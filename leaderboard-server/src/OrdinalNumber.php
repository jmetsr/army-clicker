<?php
/**
 * OrdinalNumber - PHP port of the game's large number system
 *
 * Representation: {arrows, height}
 * - arrows=0: height is a plain number (base case)
 * - arrows=1: 10^height (scientific notation)
 * - arrows=2: 10^^height (tetration)
 * - arrows=k: 10↑^k height
 *
 * Normalization keeps height in reasonable range by trading with arrows.
 */

class OrdinalNumber {
    public int $arrows;
    public float $height;

    // Threshold for promoting to next arrow level
    private const PROMOTION_THRESHOLD = 1e12;

    /**
     * Create from various input types
     */
    public function __construct($value = 0) {
        if ($value instanceof OrdinalNumber) {
            $this->arrows = $value->arrows;
            $this->height = $value->height;
        } elseif (is_array($value) && isset($value['arrows'])) {
            // {arrows, height} format from JSON
            $this->arrows = (int)($value['arrows'] ?? 0);
            $height = $value['height'] ?? 0;
            // Handle nested OrdinalNumber height
            if (is_array($height) && isset($height['arrows'])) {
                // Flatten nested structure for simplicity
                $inner = new OrdinalNumber($height);
                // Approximate: if inner has arrows, bump our arrows
                if ($inner->arrows > 0) {
                    $this->arrows += $inner->arrows;
                    $this->height = $inner->height;
                } else {
                    $this->height = $inner->height;
                }
            } else {
                $this->height = (float)$height;
            }
        } elseif (is_numeric($value)) {
            $num = (float)$value;
            if (!is_finite($num) || is_nan($num)) {
                $this->arrows = 0;
                $this->height = 0;
            } elseif ($num < self::PROMOTION_THRESHOLD) {
                $this->arrows = 0;
                $this->height = $num;
            } elseif ($num < 1e308) {
                $this->arrows = 1;
                $this->height = log10($num);
            } else {
                $this->arrows = 1;
                $this->height = 308;
            }
        } else {
            $this->arrows = 0;
            $this->height = 0;
        }

        $this->normalize();
    }

    /**
     * Create from a plain number
     */
    public static function fromNumber(float $n): self {
        return new self($n);
    }

    /**
     * Create from string (e.g., "1.5e15" or "10^100")
     */
    public static function fromString(string $s): self {
        $s = trim($s);

        // Handle scientific notation like "1.5e15"
        if (preg_match('/^([\d.]+)e(\d+)$/i', $s, $m)) {
            $mantissa = (float)$m[1];
            $exp = (int)$m[2];
            $result = new self();
            $result->arrows = 1;
            $result->height = $exp + log10($mantissa);
            return $result->normalize();
        }

        // Handle "10^X" notation
        if (preg_match('/^10\^([\d.]+)$/', $s, $m)) {
            $result = new self();
            $result->arrows = 1;
            $result->height = (float)$m[1];
            return $result->normalize();
        }

        // Handle "10^^X" notation (tetration)
        if (preg_match('/^10\^\^([\d.]+)$/', $s, $m)) {
            $result = new self();
            $result->arrows = 2;
            $result->height = (float)$m[1];
            return $result->normalize();
        }

        // Plain number
        if (is_numeric($s)) {
            return new self((float)$s);
        }

        return new self(0);
    }

    /**
     * Normalize: keep height in reasonable range by trading with arrows
     */
    public function normalize(): self {
        // Guard against invalid values
        if (!is_finite($this->height) || is_nan($this->height)) {
            $this->arrows = min($this->arrows + 10, 100);
            $this->height = 1e11;
            return $this;
        }

        // arrows=0: plain number
        if ($this->arrows === 0) {
            if ($this->height >= self::PROMOTION_THRESHOLD) {
                $this->arrows = 1;
                $this->height = log10($this->height);
                return $this->normalize();
            }
            return $this;
        }

        // arrows > 0: check if height needs promotion
        if ($this->height >= self::PROMOTION_THRESHOLD) {
            $this->arrows++;
            $this->height = log10($this->height);
            return $this->normalize();
        }

        return $this;
    }

    /**
     * Compare to another OrdinalNumber
     * Returns: -1 if this < other, 0 if equal, 1 if this > other
     */
    public function compare(OrdinalNumber $other): int {
        // Different arrow counts: more arrows = bigger
        if ($this->arrows !== $other->arrows) {
            return $this->arrows <=> $other->arrows;
        }

        // Same arrows: compare heights
        return $this->height <=> $other->height;
    }

    public function gt(OrdinalNumber $other): bool {
        return $this->compare($other) > 0;
    }

    public function gte(OrdinalNumber $other): bool {
        return $this->compare($other) >= 0;
    }

    public function lt(OrdinalNumber $other): bool {
        return $this->compare($other) < 0;
    }

    public function lte(OrdinalNumber $other): bool {
        return $this->compare($other) <= 0;
    }

    public function eq(OrdinalNumber $other): bool {
        return $this->compare($other) === 0;
    }

    /**
     * Convert to float (may lose precision or return INF)
     */
    public function toFloat(): float {
        if ($this->arrows === 0) {
            return $this->height;
        }
        if ($this->arrows === 1 && $this->height < 308) {
            return pow(10, $this->height);
        }
        return INF;
    }

    /**
     * Add another OrdinalNumber
     */
    public function add(OrdinalNumber $other): OrdinalNumber {
        // If arrows differ significantly, larger dominates
        if ($this->arrows > $other->arrows + 1) {
            return new OrdinalNumber($this);
        }
        if ($other->arrows > $this->arrows + 1) {
            return new OrdinalNumber($other);
        }

        // Both arrows=0: simple addition
        if ($this->arrows === 0 && $other->arrows === 0) {
            return new OrdinalNumber($this->height + $other->height);
        }

        // Both arrows=1: add in log space
        if ($this->arrows === 1 && $other->arrows === 1) {
            $maxH = max($this->height, $other->height);
            $minH = min($this->height, $other->height);
            // 10^max + 10^min = 10^max * (1 + 10^(min-max))
            $sum = 1 + pow(10, $minH - $maxH);
            $result = new OrdinalNumber();
            $result->arrows = 1;
            $result->height = $maxH + log10($sum);
            return $result->normalize();
        }

        // Mixed or higher arrows: approximate with max
        if ($this->compare($other) >= 0) {
            return new OrdinalNumber($this);
        }
        return new OrdinalNumber($other);
    }

    /**
     * Subtract another OrdinalNumber
     */
    public function subtract(OrdinalNumber $other): OrdinalNumber {
        // If other is much smaller, result is approximately this
        if ($this->arrows > $other->arrows) {
            return new OrdinalNumber($this);
        }

        // Both arrows=0: simple subtraction
        if ($this->arrows === 0 && $other->arrows === 0) {
            return new OrdinalNumber(max(0, $this->height - $other->height));
        }

        // Both arrows=1: subtract in log space
        if ($this->arrows === 1 && $other->arrows === 1) {
            if ($this->height <= $other->height) {
                return new OrdinalNumber(0);
            }
            // 10^a - 10^b = 10^a * (1 - 10^(b-a))
            $factor = 1 - pow(10, $other->height - $this->height);
            if ($factor <= 0) {
                return new OrdinalNumber(0);
            }
            $result = new OrdinalNumber();
            $result->arrows = 1;
            $result->height = $this->height + log10($factor);
            return $result->normalize();
        }

        // Higher arrows: approximate
        if ($this->compare($other) <= 0) {
            return new OrdinalNumber(0);
        }
        return new OrdinalNumber($this);
    }

    /**
     * Multiply by another OrdinalNumber
     */
    public function multiply(OrdinalNumber $other): OrdinalNumber {
        // 0 * anything = 0
        if ($this->isZero() || $other->isZero()) {
            return new OrdinalNumber(0);
        }

        // Both arrows=0: simple multiplication
        if ($this->arrows === 0 && $other->arrows === 0) {
            return new OrdinalNumber($this->height * $other->height);
        }

        // At least one arrows=1: add exponents
        $result = new OrdinalNumber();

        if ($this->arrows === 0) {
            // this * 10^b = 10^(log10(this) + b)
            $result->arrows = 1;
            $result->height = log10(max(1, $this->height)) + $other->height;
        } elseif ($other->arrows === 0) {
            $result->arrows = 1;
            $result->height = $this->height + log10(max(1, $other->height));
        } else {
            // Both have arrows >= 1
            $result->arrows = max($this->arrows, $other->arrows);
            if ($this->arrows === $other->arrows) {
                $result->height = $this->height + $other->height;
            } elseif ($this->arrows > $other->arrows) {
                $result->height = $this->height + log10(max(1, $other->height));
            } else {
                $result->height = $other->height + log10(max(1, $this->height));
            }
        }

        return $result->normalize();
    }

    /**
     * Divide by another OrdinalNumber
     */
    public function divide(OrdinalNumber $other): OrdinalNumber {
        if ($other->isZero()) {
            // Division by zero - return a huge number
            $result = new OrdinalNumber();
            $result->arrows = 10;
            $result->height = 1e11;
            return $result;
        }

        if ($this->isZero()) {
            return new OrdinalNumber(0);
        }

        // Both arrows=0: simple division
        if ($this->arrows === 0 && $other->arrows === 0) {
            return new OrdinalNumber($this->height / $other->height);
        }

        // Subtract exponents
        $result = new OrdinalNumber();

        if ($this->arrows === 0) {
            // Can't really divide small by large meaningfully
            return new OrdinalNumber(0);
        }

        if ($other->arrows === 0) {
            $result->arrows = 1;
            $result->height = $this->height - log10(max(1, $other->height));
        } else {
            if ($this->arrows !== $other->arrows) {
                if ($this->arrows > $other->arrows) {
                    return new OrdinalNumber($this);
                }
                return new OrdinalNumber(0);
            }
            // Same arrows: subtract heights
            $newHeight = $this->height - $other->height;
            if ($newHeight < 0) {
                return new OrdinalNumber(0);
            }
            $result->arrows = 1;
            $result->height = $newHeight;
        }

        return $result->normalize();
    }

    /**
     * Check if zero
     */
    public function isZero(): bool {
        return $this->arrows === 0 && $this->height == 0;
    }

    /**
     * Convert to display string
     */
    public function toString(): string {
        if ($this->arrows === 0) {
            if ($this->height < 1000000) {
                return number_format($this->height, 0, '', ',');
            }
            // Large plain number - show in scientific
            return sprintf('%.2e', $this->height);
        }

        if ($this->arrows === 1) {
            if ($this->height < 36) {
                // Can show as named number
                $value = pow(10, $this->height);
                return sprintf('%.2e', $value);
            }
            return '10^' . round($this->height, 2);
        }

        if ($this->arrows === 2) {
            return '10^^' . round($this->height, 2);
        }

        return '10↑^' . $this->arrows . '^' . round($this->height, 2);
    }

    /**
     * Convert to array for JSON serialization
     */
    public function toArray(): array {
        return [
            'arrows' => $this->arrows,
            'height' => $this->height
        ];
    }
}
