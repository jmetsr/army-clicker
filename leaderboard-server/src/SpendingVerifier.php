<?php
/**
 * SpendingVerifier - Check that spending is plausible
 *
 * Since we only have snapshots (not every transaction), we verify:
 * 1. Coin drops between snapshots match building/troop increases
 * 2. Players can't have more buildings than they could afford
 */

require_once __DIR__ . '/LogParser.php';
require_once __DIR__ . '/OrdinalNumber.php';

class SpendingVerifier {
    private LogParser $parser;

    // Base costs (should match game constants)
    private const BASE_COSTS = [
        'recruit' => 10,
        'squad_leader' => 400,
        'barracks' => 1600,
        'military_base' => 30000,
        'kingdom' => 400000,
        'empire' => 40000000,
        'farm' => 1000,
        'plantation' => 5000,
        'colony' => 25000,
        'train' => 100,
    ];

    // Inflation rates
    private const ARMY_INFLATION = 1.04;
    private const ECON_INFLATION = 1.02;
    private const RECRUIT_INFLATION = 1.02;

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    /**
     * Verify spending across all snapshots
     */
    public function verify(): array {
        $flags = [];
        $snapshots = $this->parser->getSnapshots();

        if (count($snapshots) < 2) {
            return $flags;
        }

        // Sort by day
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        // Check consecutive snapshots
        for ($i = 1; $i < count($snapshots); $i++) {
            $prev = $snapshots[$i - 1];
            $curr = $snapshots[$i];

            $flag = $this->checkSpendingBetween($prev, $curr);
            if ($flag !== null) {
                $flags[] = $flag;
            }
        }

        // Check final state plausibility
        $finalFlag = $this->checkFinalStatePlausible($snapshots);
        if ($finalFlag !== null) {
            $flags[] = $finalFlag;
        }

        return $flags;
    }

    /**
     * Check spending between two snapshots
     */
    private function checkSpendingBetween(array $prev, array $curr): ?string {
        $prevDay = $prev['day'] ?? 0;
        $currDay = $curr['day'] ?? 0;
        $daysDiff = $currDay - $prevDay;

        $prevPlayer = $prev['player'] ?? [];
        $currPlayer = $curr['player'] ?? [];

        // Skip verification for large ordinals - late-game is exponential
        $prevCoinsRaw = $prevPlayer['coins'] ?? 0;
        $currCoinsRaw = $currPlayer['coins'] ?? 0;
        $prevPptRaw = $prevPlayer['ppt'] ?? 1;
        if ($this->isLargeOrdinal($prevCoinsRaw) || $this->isLargeOrdinal($currCoinsRaw) ||
            $this->isLargeOrdinal($prevPptRaw)) {
            return null;
        }

        $prevCoins = new OrdinalNumber($prevCoinsRaw);
        $currCoins = new OrdinalNumber($currCoinsRaw);

        // Check what was gained (troops, farms)
        $prevTroops = new OrdinalNumber($prevPlayer['troops'] ?? 0);
        $currTroops = new OrdinalNumber($currPlayer['troops'] ?? 0);
        $troopGain = $currTroops->subtract($prevTroops);
        $troopGainFloat = max(0, $troopGain->toFloat());

        $prevFarms = (int)($prevPlayer['farms'] ?? 0);
        $currFarms = (int)($currPlayer['farms'] ?? 0);
        $farmGain = max(0, $currFarms - $prevFarms);

        // Estimate minimum cost for what was gained
        $minTroopCost = $troopGainFloat * self::BASE_COSTS['recruit'];
        $minFarmCost = $farmGain * self::BASE_COSTS['farm'];
        $minCostForGains = $minTroopCost + $minFarmCost;

        // Calculate expected income during this period
        // Use PREVIOUS troops only (conservative - can't use cheated troop counts)
        $prevPpt = (float)($prevPlayer['ppt'] ?? 1);
        $expectedIncome = $prevTroops->toFloat() * $prevPpt * 4 * $daysDiff;

        // Maximum they could afford = starting coins + income
        $maxAffordable = $prevCoins->toFloat() + $expectedIncome;

        // Flag: gained more than they could afford (free troops/buildings)
        if ($minCostForGains > $maxAffordable * 2 && $minCostForGains > 10000) {
            return sprintf(
                "Day %d-%d: Gained %d troops + %d farms (min cost %s) but could only afford ~%s",
                $prevDay,
                $currDay,
                (int)$troopGainFloat,
                $farmGain,
                number_format($minCostForGains, 0),
                number_format($maxAffordable, 0)
            );
        }

        // If coins increased, no overspending issue
        if ($currCoins->gte($prevCoins)) {
            return null;
        }

        // Coins dropped - calculate how much was spent
        $spent = $prevCoins->subtract($currCoins);
        $spentFloat = $spent->toFloat();

        // They could spend: starting coins + income earned
        $maxPossibleSpend = $maxAffordable;

        // Flag if they spent way more than possible
        if ($spentFloat > $maxPossibleSpend * 1.5 && $spentFloat > 10000) {
            return sprintf(
                "Day %d-%d: Spent %s coins but max possible was ~%s",
                $prevDay,
                $currDay,
                $spent->toString(),
                number_format($maxPossibleSpend, 0)
            );
        }

        // Note: We don't flag "spent but gained nothing" because players buy many things
        // besides troops/farms (SL, barracks, MB, kingdoms, empires, plantations, colonies, training)

        return null;
    }

    /**
     * Check if final state is plausible given total possible earnings
     */
    private function checkFinalStatePlausible(array $snapshots): ?string {
        if (empty($snapshots)) {
            return null;
        }

        $final = end($snapshots);
        $finalDay = $final['day'] ?? 0;
        $finalPlayer = $final['player'] ?? [];

        $finalTroops = new OrdinalNumber($finalPlayer['troops'] ?? 0);
        $finalFarms = (int)($finalPlayer['farms'] ?? 0);

        // Very rough check: can they have this many troops?
        // Each troop costs at minimum 10 coins (base recruit cost)
        // Total spending on troops >= troops * 10
        $minTroopSpending = $finalTroops->multiply(new OrdinalNumber(10));

        // Maximum possible earnings (very generous upper bound)
        // Assume they had current troops/ppt from day 1 (impossible but generous)
        $ppt = (float)($finalPlayer['ppt'] ?? 1);
        $maxEarnings = $finalTroops->multiply(new OrdinalNumber($ppt * 4 * $finalDay));

        // If min spending >> max earnings, suspicious
        if ($minTroopSpending->gt($maxEarnings) && $finalDay > 10) {
            $troopCount = $finalTroops->toString();
            $earnings = $maxEarnings->toString();
            return sprintf(
                "Final state: %s troops would cost at least %s to recruit, but max possible earnings ~%s",
                $troopCount,
                $minTroopSpending->toString(),
                $earnings
            );
        }

        return null;
    }
}
