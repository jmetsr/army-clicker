<?php
/**
 * IncomeVerifier - Check that coin income matches expected values
 *
 * Income formula:
 * - Power = Troops × PPT
 * - Passive loot = Power × 4 coins/day
 */

require_once __DIR__ . '/LogParser.php';
require_once __DIR__ . '/OrdinalNumber.php';

class IncomeVerifier {
    private LogParser $parser;

    // How much variance to allow before flagging (e.g., 2.0 = 2x expected)
    private float $toleranceMultiplier = 3.0;

    // Minimum coin difference to care about (ignore tiny discrepancies)
    private float $minimumDifference = 1000;

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    /**
     * Verify income across all snapshots
     * Returns array of flags for suspicious days
     */
    public function verify(): array {
        $flags = [];
        $snapshots = $this->parser->getSnapshots();

        if (count($snapshots) < 2) {
            return $flags; // Not enough data
        }

        // Sort by day
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        // Compare consecutive snapshots
        for ($i = 1; $i < count($snapshots); $i++) {
            $prev = $snapshots[$i - 1];
            $curr = $snapshots[$i];

            $flag = $this->checkIncomeBetween($prev, $curr);
            if ($flag !== null) {
                $flags[] = $flag;
            }
        }

        return $flags;
    }

    /**
     * Check income between two snapshots
     */
    private function checkIncomeBetween(array $prev, array $curr): ?string {
        $prevDay = $prev['day'] ?? 0;
        $currDay = $curr['day'] ?? 0;
        $daysDiff = $currDay - $prevDay;

        if ($daysDiff <= 0) {
            return null; // Invalid or same day
        }

        // Get player data
        $prevPlayer = $prev['player'] ?? [];
        $currPlayer = $curr['player'] ?? [];

        // Get coin values
        $prevCoins = new OrdinalNumber($prevPlayer['coins'] ?? 0);
        $currCoins = new OrdinalNumber($currPlayer['coins'] ?? 0);

        // If coins went down, that's fine (spending)
        if ($currCoins->lte($prevCoins)) {
            return null;
        }

        // Skip verification for OrdinalNumbers with arrows > 0
        // Late-game exponential growth makes linear verification impossible
        // PPT can grow from 1 to 10^10000+ via training upgrades
        $prevCoinsRaw = $prevPlayer['coins'] ?? 0;
        $currCoinsRaw = $currPlayer['coins'] ?? 0;
        if ($this->isLargeOrdinal($prevCoinsRaw) || $this->isLargeOrdinal($currCoinsRaw)) {
            return null; // Skip - too complex to verify
        }

        // Calculate actual coin gain
        $actualGain = $currCoins->subtract($prevCoins);

        // Calculate expected income
        // Use average of prev and curr troops/ppt for approximation
        $prevTroops = new OrdinalNumber($prevPlayer['troops'] ?? 0);
        $currTroops = new OrdinalNumber($currPlayer['troops'] ?? 0);

        // PPT can also be an OrdinalNumber now
        $prevPptRaw = $prevPlayer['ppt'] ?? 1;
        $currPptRaw = $currPlayer['ppt'] ?? 1;

        // Skip if PPT is a large ordinal (exponential growth from training)
        if ($this->isLargeOrdinal($prevPptRaw) || $this->isLargeOrdinal($currPptRaw)) {
            return null;
        }

        $prevPpt = is_numeric($prevPptRaw) ? (float)$prevPptRaw : 1;
        $currPpt = is_numeric($currPptRaw) ? (float)$currPptRaw : 1;

        // Average troops (simple average for estimation)
        $avgTroops = $prevTroops->add($currTroops)->divide(new OrdinalNumber(2));

        // Average PPT
        $avgPpt = ($prevPpt + $currPpt) / 2;

        // Expected power = troops × ppt
        $expectedPower = $avgTroops->multiply(new OrdinalNumber($avgPpt));

        // Expected income = power × 4 × days
        $expectedIncome = $expectedPower->multiply(new OrdinalNumber(4 * $daysDiff));

        // Compare actual vs expected
        // Allow for some spending/variance, so we only flag if actual >> expected
        $actualFloat = $actualGain->toFloat();
        $expectedFloat = $expectedIncome->toFloat();

        // Skip tiny amounts
        if ($actualFloat < $this->minimumDifference && $expectedFloat < $this->minimumDifference) {
            return null;
        }

        // Check if actual is way more than expected
        // Use a high tolerance (10x) because PPT can grow within a snapshot period
        if ($expectedFloat > 0) {
            $ratio = $actualFloat / $expectedFloat;

            if ($ratio > 10.0) { // Very generous - only flag extreme cases
                return sprintf(
                    "Day %d-%d: Gained %s coins but expected ~%s (%.1fx more than expected)",
                    $prevDay,
                    $currDay,
                    $actualGain->toString(),
                    $expectedIncome->toString(),
                    $ratio
                );
            }
        } elseif ($actualFloat > $this->minimumDifference * 100) {
            // Expected ~0 income but gained a lot (higher threshold)
            return sprintf(
                "Day %d-%d: Gained %s coins with near-zero expected income",
                $prevDay,
                $currDay,
                $actualGain->toString()
            );
        }

        return null;
    }

    /**
     * Check if a value is a large OrdinalNumber (arrows > 0)
     */
    private function isLargeOrdinal($value): bool {
        if (is_array($value)) {
            $arrows = $value['arrows'] ?? 0;
            return $arrows > 0;
        }
        return false;
    }

    /**
     * Quick check: does total coins seem plausible for the game length?
     */
    public function checkFinalCoinsPlausible(): ?string {
        $snapshots = $this->parser->getSnapshots();
        if (empty($snapshots)) {
            return null;
        }

        // Get final snapshot
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));
        $final = end($snapshots);
        $finalDay = $final['day'] ?? 0;
        $finalPlayer = $final['player'] ?? [];

        // Skip verification for large ordinals - late-game growth is exponential
        $coinsRaw = $finalPlayer['coins'] ?? 0;
        $pptRaw = $finalPlayer['ppt'] ?? 1;
        if ($this->isLargeOrdinal($coinsRaw) || $this->isLargeOrdinal($pptRaw)) {
            return null;
        }

        $finalCoins = new OrdinalNumber($coinsRaw);
        $finalTroops = new OrdinalNumber($finalPlayer['troops'] ?? 0);
        $finalPpt = is_numeric($pptRaw) ? (float)$pptRaw : 1;

        // Rough upper bound: if you had final troops/ppt from day 1
        // Max possible = troops × ppt × 4 × days
        $maxPossible = $finalTroops
            ->multiply(new OrdinalNumber($finalPpt))
            ->multiply(new OrdinalNumber(4 * $finalDay));

        // Also account for potential compound growth - allow 100x the simple calc
        // (PPT can grow significantly within a run)
        $maxPossible = $maxPossible->multiply(new OrdinalNumber(100));

        // Check if final coins exceed this generous upper bound
        if ($finalCoins->gt($maxPossible) && $finalDay > 10) {
            return sprintf(
                "Final coins (%s) seem implausibly high for day %d with %s troops at %d PPT",
                $finalCoins->toString(),
                $finalDay,
                $finalTroops->toString(),
                $finalPpt
            );
        }

        return null;
    }
}
