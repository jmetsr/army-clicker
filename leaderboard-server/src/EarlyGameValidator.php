<?php
/**
 * EarlyGameValidator - Simple click-by-click validation
 *
 * Each click in the log includes the game state at that moment.
 * We just verify:
 * 1. Each action was affordable (had enough coins)
 * 2. State transitions make sense between clicks
 */

require_once __DIR__ . '/LogParser.php';

class EarlyGameValidator {
    private LogParser $parser;

    // Base costs (must match game)
    const RECRUIT_COST = 20;
    const SQUAD_LEADER_COST = 400;
    const BARRACKS_COST = 1600;
    const MILITARY_BASE_COST = 30000;
    const KINGDOM_COST = 400000;
    const EMPIRE_COST = 40000000;
    const TRAIN_COST = 160;
    const FARM_COST = 1000;
    const PLANTATION_COST = 5000;
    const COLONY_COST = 25000;

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    /**
     * Simple click-by-click validation
     */
    public function validate(): array {
        $flags = [];
        $clicks = $this->parser->getClickLog();

        if (empty($clicks)) {
            return ['No click log available'];
        }

        error_log("=== EarlyGameValidator: checking " . count($clicks) . " clicks ===");

        // Sort by time
        usort($clicks, fn($a, $b) => ($a['t'] ?? 0) <=> ($b['t'] ?? 0));

        // Track counts that aren't in click log
        $recruitCount = 0;
        $econClicks = 0;

        foreach ($clicks as $i => $click) {
            $action = $click['action'] ?? '';
            $coins = $click['coins'] ?? 0;
            $day = $click['day'] ?? 0;
            $armyClicks = $click['armyClicks'] ?? 0;
            $trainClicks = $click['train'] ?? 0;

            // Check if action was affordable
            $cost = $this->getActionCost($action, $armyClicks, $trainClicks, $recruitCount, $econClicks);
            if ($cost > 0 && $coins < $cost) {
                $flags[] = "Day $day: $action with $coins coins (needs $cost)";
                // Only flag first few issues to avoid spam
                if (count($flags) >= 5) {
                    error_log("Stopping after 5 flags");
                    break;
                }
            }

            // Update our counts after the action
            if ($action === 'recruit') $recruitCount++;
            if (in_array($action, ['farm', 'plantation', 'colony'])) $econClicks++;
        }

        error_log("EarlyGameValidator found " . count($flags) . " issues");
        return $flags;
    }

    /**
     * Get cost of an action based on current counts
     */
    private function getActionCost(string $action, int $armyClicks, int $trainClicks, int $recruitCount, int $econClicks): float {
        switch ($action) {
            case 'beg':
                return 0;
            case 'recruit':
                return floor(self::RECRUIT_COST * pow(1.02, $recruitCount));
            case 'squad_leader':
                return floor(self::SQUAD_LEADER_COST * pow(1.04, $armyClicks));
            case 'barracks':
                return floor(self::BARRACKS_COST * pow(1.04, $armyClicks));
            case 'military_base':
                return floor(self::MILITARY_BASE_COST * pow(1.04, $armyClicks));
            case 'kingdom':
                return floor(self::KINGDOM_COST * pow(1.04, $armyClicks));
            case 'empire':
                return floor(self::EMPIRE_COST * pow(1.04, $armyClicks));
            case 'train':
                return floor(self::TRAIN_COST * pow(1.04, $trainClicks));
            case 'farm':
                return floor(self::FARM_COST * pow(1.02, $econClicks));
            case 'plantation':
                return floor(self::PLANTATION_COST * pow(1.02, $econClicks));
            case 'colony':
                return floor(self::COLONY_COST * pow(1.02, $econClicks));
            default:
                return 0; // Unknown action, don't flag
        }
    }

}
