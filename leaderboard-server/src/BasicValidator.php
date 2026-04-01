<?php
/**
 * BasicValidator - Catch obvious cheating with simple sanity checks
 *
 * Note: Full income/spending verification requires game replay (see 07g/h/i tasks).
 * This class only does quick sanity checks.
 */

class ValidationResult {
    public bool $passed;
    public array $flags;

    public function __construct(bool $passed = true, array $flags = []) {
        $this->passed = $passed;
        $this->flags = $flags;
    }

    public function addFlag(string $flag): void {
        $this->flags[] = $flag;
        $this->passed = false;
    }

    public function merge(ValidationResult $other): void {
        $this->flags = array_merge($this->flags, $other->flags);
        if (!$other->passed) {
            $this->passed = false;
        }
    }
}

class BasicValidator {
    private LogParser $parser;
    private array $flags = [];

    public function __construct(LogParser $parser) {
        $this->parser = $parser;
    }

    /**
     * Run all basic validation checks
     */
    public function validate(): ValidationResult {
        $result = new ValidationResult();

        // Run all checks
        $this->checkLogNotEmpty($result);
        $this->checkHasStartEvent($result);
        $this->checkDaySequence($result);
        $this->checkNoNegativeValues($result);
        $this->checkReasonableDayCount($result);
        $this->checkMilestoneConsistency($result);

        // Note: Full income/spending verification requires game replay.
        // See tasks 07g (early game), 07h (middle game), 07i (late game).

        return $result;
    }

    /**
     * Check that log isn't empty
     */
    private function checkLogNotEmpty(ValidationResult $result): void {
        $events = $this->parser->getEvents();
        if (empty($events)) {
            $result->addFlag('Log is empty - no game events recorded');
        }
    }

    /**
     * Check for game start event
     */
    private function checkHasStartEvent(ValidationResult $result): void {
        $startEvents = $this->parser->getEventsOfType('start');
        if (empty($startEvents)) {
            $result->addFlag('Missing game start event');
        }
    }

    /**
     * Check that days are sequential and don't go backwards
     */
    private function checkDaySequence(ValidationResult $result): void {
        $snapshots = $this->parser->getSnapshots();
        if (count($snapshots) < 2) {
            return; // Not enough data to check
        }

        // Sort by day
        usort($snapshots, fn($a, $b) => ($a['day'] ?? 0) <=> ($b['day'] ?? 0));

        $prevDay = -1;

        foreach ($snapshots as $snap) {
            $day = $snap['day'] ?? 0;

            // Check for backwards movement
            if ($day < $prevDay) {
                $result->addFlag("Days go backwards: day $prevDay followed by day $day");
            }

            $prevDay = $day;
        }
    }

    /**
     * Check for negative values (impossible in normal gameplay)
     */
    private function checkNoNegativeValues(ValidationResult $result): void {
        $snapshots = $this->parser->getSnapshots();

        foreach ($snapshots as $snap) {
            $day = $snap['day'] ?? '?';
            $player = $snap['player'] ?? [];

            // Check troops
            if ($this->isNegative($player['troops'] ?? 0)) {
                $result->addFlag("Negative troops at day $day");
            }

            // Check coins
            if ($this->isNegative($player['coins'] ?? 0)) {
                $result->addFlag("Negative coins at day $day");
            }

            // Check food
            if ($this->isNegative($player['food'] ?? 0)) {
                $result->addFlag("Negative food at day $day");
            }

            // Check farms
            if (($player['farms'] ?? 0) < 0) {
                $result->addFlag("Negative farm count at day $day");
            }
        }
    }

    /**
     * Check if an OrdinalNumber or plain number is negative
     */
    private function isNegative($value): bool {
        if (is_numeric($value)) {
            return $value < 0;
        }
        if (is_array($value)) {
            // OrdinalNumber format: {arrows, height}
            // arrows >= 0 means positive (it's 10^something)
            // Only arrows=0 with negative height would be negative
            $arrows = $value['arrows'] ?? 0;
            $height = $value['height'] ?? 0;
            if ($arrows === 0 && is_numeric($height) && $height < 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Check that day count is reasonable for the time played
     */
    private function checkReasonableDayCount(ValidationResult $result): void {
        $dayCount = $this->parser->getDayCount();
        $clickCount = $this->parser->getClickCount();

        // If we have click timestamps, check rate
        $clickLog = $this->parser->getClickLog();
        if (count($clickLog) >= 2) {
            $firstClick = $clickLog[0]['t'] ?? 0;
            $lastClick = $clickLog[count($clickLog) - 1]['t'] ?? 0;
            $elapsedMs = $lastClick - $firstClick;
            $elapsedSeconds = $elapsedMs / 1000;

            if ($elapsedSeconds > 0) {
                // Each day requires at least 1 click, game runs ~10 days/second max
                // So 1000 days in 10 seconds = 100 days/sec is suspicious
                $daysPerSecond = $dayCount / $elapsedSeconds;

                if ($daysPerSecond > 50) {
                    $result->addFlag("Impossible game speed: $dayCount days in " . round($elapsedSeconds) . " seconds ($daysPerSecond days/sec)");
                }
            }
        }

        // Sanity check: more than 100k days is suspicious
        if ($dayCount > 100000) {
            $result->addFlag("Unrealistic day count: $dayCount days");
        }
    }

    /**
     * Check that claimed milestones are roughly consistent with log
     */
    private function checkMilestoneConsistency(ValidationResult $result): void {
        $milestones = $this->parser->extractMilestones();

        // Coin milestones are extracted from clicks+battles by LogParser
        // No need to cross-check against snapshots (they only exist at day 365/730 now)

        // Check vanquish/surrender - should have corresponding event
        if ($milestones['dayVanquish'] !== null) {
            $vanquishEvents = $this->parser->getEventsOfType('vanquish');
            if (empty($vanquishEvents)) {
                $result->addFlag("Claims vanquish at day {$milestones['dayVanquish']} but no vanquish event in log");
            }
        }

        if ($milestones['daySurrender'] !== null) {
            $surrenderEvents = $this->parser->getEventsOfType('surrender');
            if (empty($surrenderEvents)) {
                $result->addFlag("Claims surrender at day {$milestones['daySurrender']} but no surrender event in log");
            }
        }
    }
}
