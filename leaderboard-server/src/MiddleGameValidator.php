<?php
/**
 * MiddleGameValidator - Simple validation for magic stage
 *
 * Just checks that magic spent doesn't exceed magic earned (dark rituals).
 */

require_once __DIR__ . '/LogParser.php';

class MiddleGameValidator {
    private LogParser $parser;

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    public function validate(): array {
        $flags = [];
        $clicks = $this->parser->getClickLog();

        if (empty($clicks)) {
            return [];
        }

        // Count magic earned and spent
        $darkRituals = 0;
        $magicSpent = 0;

        $magicCosts = [
            'unlock_planet' => 1,
            'unlock_solar_system' => 1,
            'unlock_galaxy' => 1,
            'unlock_galaxy_cluster' => 1,
            'unlock_supercluster' => 1,
            'unlock_observable_universe' => 1,
            'unlock_full_universe' => 1,
            'unlock_quantum_multiverse' => 1,
            'unlock_cosmological_multiverse' => 1,
            'unlock_mathematical_multiverse' => 1,
            'upgrade_button' => 2,
            'separate_costs' => 3,
            'freeze_costs' => 4,
            'eternal_feast' => 1,
        ];

        foreach ($clicks as $click) {
            $action = $click['action'] ?? '';

            if ($action === 'dark_ritual') {
                $darkRituals++;
            }

            if (isset($magicCosts[$action])) {
                $magicSpent += $magicCosts[$action];
            }
        }

        // Magic spent shouldn't exceed magic earned
        if ($magicSpent > $darkRituals) {
            $flags[] = "Magic spent ($magicSpent) exceeds dark rituals ($darkRituals)";
        }

        return $flags;
    }
}
