<?php
/**
 * OrdinalNumber - PHP port of the game's large number system
 *
 * Matches JS implementation in html-game/js/ordinal.js
 *
 * Representation: {arrows, height}
 * - arrows=0: height is a plain number (base case)
 * - arrows=1: 10^height (scientific notation)
 * - arrows=2: 10^^height (tetration)
 * - arrows=k: 10↑^k height
 * - height can be a NUMBER or another OrdinalNumber (nested!)
 *
 * Normalization keeps height in reasonable range by trading with arrows.
 */

class OrdinalNumber {
    public int $arrows;
    /** @var float|OrdinalNumber */
    public $height;

    // Threshold for promoting to next arrow level
    private const PROMOTION_THRESHOLD = 1e12;

    /**
     * Create from various input types
     */
    public function __construct($value = 0) {
        if ($value instanceof OrdinalNumber) {
            $this->arrows = $value->arrows;
            // Deep copy height if it's an OrdinalNumber
            $this->height = ($value->height instanceof OrdinalNumber)
                ? new OrdinalNumber($value->height)
                : $value->height;
        } elseif (is_array($value) && isset($value['arrows'])) {
            // {arrows, height} format from JSON
            $this->arrows = (int)($value['arrows'] ?? 0);
            $height = $value['height'] ?? 0;

            // Handle nested OrdinalNumber height
            if (is_array($height) && isset($height['arrows'])) {
                $this->height = new OrdinalNumber($height);
            } else {
                $this->height = (float)$height;
            }
        } elseif (is_numeric($value)) {
            $num = (float)$value;
            if (!is_finite($num) || is_nan($num)) {
                $this->arrows = 0;
                $this->height = 0.0;
            } elseif ($num < self::PROMOTION_THRESHOLD) {
                $this->arrows = 0;
                $this->height = $num;
            } elseif ($num < 1e308) {
                $this->arrows = 1;
                $this->height = log10($num);
            } else {
                $this->arrows = 1;
                $this->height = 308.0;
            }
        } else {
            $this->arrows = 0;
            $this->height = 0.0;
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
     * Wrap any value as OrdinalNumber
     */
    public static function from($val): self {
        if ($val instanceof OrdinalNumber) return $val;
        return new self($val);
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
        // Base case: arrows=0, height is plain number
        if ($this->arrows === 0) {
            if (!($this->height instanceof OrdinalNumber)) {
                if ($this->height >= self::PROMOTION_THRESHOLD) {
                    $this->arrows = 1;
                    $this->height = log10($this->height);
                    return $this->normalize();
                }
            }
            return $this;
        }

        // Recursive case: height might be OrdinalNumber
        if ($this->height instanceof OrdinalNumber) {
            $this->height->normalize();
            // If height has arrows > 0, we have nested structure
            // This is fine - comparison will recurse
            return $this;
        }

        // Height is a number, arrows > 0
        // Guard against Infinity/NaN
        if (!is_finite($this->height) || is_nan($this->height)) {
            $this->arrows = min($this->arrows + 10, 100);
            $this->height = 1e11;
            return $this;
        }

        // Promote if height is huge
        while ($this->height >= self::PROMOTION_THRESHOLD) {
            $this->arrows += 1;
            $this->height = log10($this->height);
        }

        // Denormalize if height too small
        while ($this->height < 1 && $this->arrows > 0 && !($this->height instanceof OrdinalNumber)) {
            $this->arrows -= 1;
            $this->height = pow(10, $this->height);
        }

        return $this;
    }

    /**
     * Flatten nested height to simple (arrows, numericHeight) for comparison
     * Matches JS _flatten() method
     */
    private function flatten(OrdinalNumber $n): array {
        if ($n->height instanceof OrdinalNumber) {
            // Recursively flatten the inner height first
            $inner = $this->flatten($n->height);

            // {arrows: A, height: {arrows: j, height: h}}
            // = 10↑^A(10↑^j(h))

            if ($inner['arrows'] === 0) {
                // Inner is just a plain number
                return ['arrows' => $n->arrows, 'height' => $inner['height']];
            }

            // inner.arrows >= 1
            $A = $n->arrows;
            $j = $inner['arrows'];
            $h = $inner['height'];

            if ($j >= $A) {
                // Inner arrows >= outer arrows
                if ($h <= 10) {
                    return ['arrows' => $j + 1, 'height' => ($j - $A + 2) + log10(max(1, $h))];
                } else {
                    return ['arrows' => $j + 1, 'height' => ($j - $A + 3) + log10(log10($h))];
                }
            } else {
                // Inner arrows < outer arrows (j < A)
                if ($j === 1) {
                    if ($h <= 308) {
                        return ['arrows' => $A, 'height' => pow(10, $h)];
                    } else {
                        $innerSlog = 2 + log10(log10($h));
                        return ['arrows' => $A + 1, 'height' => 2 + log10(max(1, $innerSlog))];
                    }
                } else {
                    return ['arrows' => $A + 1, 'height' => 2 + log10($j + log10(max(1, $h)))];
                }
            }
        } else {
            return ['arrows' => $n->arrows, 'height' => $n->height];
        }
    }

    /**
     * Compare to another OrdinalNumber
     * Returns: -1 if this < other, 0 if equal, 1 if this > other
     * Matches JS cmp() method
     */
    public function compare($other): int {
        $other = self::from($other);

        $a = (new OrdinalNumber($this))->normalize();
        $b = (new OrdinalNumber($other))->normalize();

        $aFlat = $this->flatten($a);
        $bFlat = $this->flatten($b);

        // Compare arrows first
        if ($aFlat['arrows'] !== $bFlat['arrows']) {
            $higherArrow = $aFlat['arrows'] > $bFlat['arrows'] ? $aFlat : $bFlat;
            $lowerArrow = $aFlat['arrows'] > $bFlat['arrows'] ? $bFlat : $aFlat;
            $diff = $higherArrow['arrows'] - $lowerArrow['arrows'];

            if ($diff === 1) {
                // Compare {k+1, h1} vs {k, h2}
                if ($higherArrow['height'] <= 1) {
                    if ($lowerArrow['arrows'] === 0) {
                        return $lowerArrow['height'] > 10
                            ? ($aFlat['arrows'] > $bFlat['arrows'] ? -1 : 1)
                            : ($aFlat['arrows'] > $bFlat['arrows'] ? 1 : -1);
                    }
                    return $aFlat['arrows'] > $bFlat['arrows'] ? -1 : 1;
                }

                if ($higherArrow['height'] == 2) {
                    if ($lowerArrow['height'] > 10) {
                        return $aFlat['arrows'] > $bFlat['arrows'] ? -1 : 1;
                    } elseif ($lowerArrow['height'] < 10) {
                        return $aFlat['arrows'] > $bFlat['arrows'] ? 1 : -1;
                    }
                    return 0;
                }

                // higherArrow.height >= 3
                if ($higherArrow['arrows'] >= 2) {
                    return $aFlat['arrows'] > $bFlat['arrows'] ? 1 : -1;
                }

                // higherArrow.arrows === 1, comparing 10^h1 vs plain h2
                $expandedHeight = pow(10, min($higherArrow['height'], 300));
                if ($expandedHeight > $lowerArrow['height'] * 1e6) {
                    return $aFlat['arrows'] > $bFlat['arrows'] ? 1 : -1;
                } elseif ($lowerArrow['height'] > $expandedHeight * 1e6) {
                    return $aFlat['arrows'] > $bFlat['arrows'] ? -1 : 1;
                }

                if ($higherArrow['height'] > log10(max(1, $lowerArrow['height'])) + 0.01) {
                    return $aFlat['arrows'] > $bFlat['arrows'] ? 1 : -1;
                } elseif (log10(max(1, $lowerArrow['height'])) > $higherArrow['height'] + 0.01) {
                    return $aFlat['arrows'] > $bFlat['arrows'] ? -1 : 1;
                }
                return 0;
            } else {
                // diff >= 2
                if ($higherArrow['height'] <= 1) {
                    return $aFlat['arrows'] > $bFlat['arrows'] ? -1 : 1;
                }
                return $aFlat['arrows'] > $bFlat['arrows'] ? 1 : -1;
            }
        }

        // Same arrows - compare heights
        return $aFlat['height'] <=> $bFlat['height'];
    }

    public function gt($other): bool {
        return $this->compare($other) > 0;
    }

    public function gte($other): bool {
        return $this->compare($other) >= 0;
    }

    public function lt($other): bool {
        return $this->compare($other) < 0;
    }

    public function lte($other): bool {
        return $this->compare($other) <= 0;
    }

    public function eq($other): bool {
        return $this->compare($other) === 0;
    }

    /**
     * Convert to float (may lose precision or return INF)
     */
    public function toFloat(): float {
        if ($this->arrows === 0 && !($this->height instanceof OrdinalNumber)) {
            return $this->height;
        }
        if ($this->arrows === 1 && !($this->height instanceof OrdinalNumber) && $this->height < 308) {
            return pow(10, $this->height);
        }
        return INF;
    }

    /**
     * 10^this - the key operation for auto-upgraders
     * Matches JS exp10() method
     */
    public function exp10(): OrdinalNumber {
        $n = new OrdinalNumber($this);

        if ($n->arrows === 0 && !($n->height instanceof OrdinalNumber)) {
            // 10^n where n is a plain number
            if ($n->height < 308) {
                return new OrdinalNumber(pow(10, $n->height));
            } else {
                // 10^(big number) - becomes arrows=1, height is the exponent
                $r = new OrdinalNumber();
                $r->arrows = 1;
                $r->height = $n->height;
                return $r->normalize();
            }
        }

        // For arrows >= 1: 10^(this) where this = 10↑^k(h)
        // Result is 10^(10↑^k(h)) which is {arrows: 1, height: this}
        // Use nested OrdinalNumber for the height
        $r = new OrdinalNumber();
        $r->arrows = 1;
        $r->height = $n;
        return $r->normalize();
    }

    /**
     * Add another OrdinalNumber
     * Matches JS add() method
     */
    public function add($other): OrdinalNumber {
        $other = self::from($other);

        // Both arrows=0: exact addition
        if ($this->arrows === 0 && $other->arrows === 0
            && !($this->height instanceof OrdinalNumber)
            && !($other->height instanceof OrdinalNumber)) {
            return new OrdinalNumber($this->height + $other->height);
        }

        // Both arrows=1: add via exponents
        if ($this->arrows === 1 && $other->arrows === 1) {
            $h1IsON = $this->height instanceof OrdinalNumber;
            $h2IsON = $other->height instanceof OrdinalNumber;

            if ($h1IsON || $h2IsON) {
                // At least one height is an OrdinalNumber - larger dominates
                $on1 = $h1IsON ? $this->height : new OrdinalNumber($this->height);
                $on2 = $h2IsON ? $other->height : new OrdinalNumber($other->height);
                $cmp = $on1->compare($on2);
                return $cmp >= 0 ? new OrdinalNumber($this) : new OrdinalNumber($other);
            }

            // Both heights are plain numbers
            $h1 = $this->height;
            $h2 = $other->height;
            $diff = abs($h1 - $h2);

            if ($diff > 15) {
                return $h1 > $h2 ? new OrdinalNumber($this) : new OrdinalNumber($other);
            }

            // Close enough to add properly
            $maxH = max($h1, $h2);
            $minH = min($h1, $h2);
            $sum = pow(10, $minH - $maxH) + 1;
            $newHeight = $maxH + log10($sum);
            $result = new OrdinalNumber();
            $result->arrows = 1;
            $result->height = $newHeight;
            return $result->normalize();
        }

        // Mixed: arrows=0 + arrows=1
        if (($this->arrows === 0 && $other->arrows === 1) || ($this->arrows === 1 && $other->arrows === 0)) {
            $arr0 = $this->arrows === 0 ? $this : $other;
            $arr1 = $this->arrows === 1 ? $this : $other;

            if ($arr1->height instanceof OrdinalNumber) {
                return new OrdinalNumber($arr1);
            }

            $h0 = $arr0->height > 0 ? log10($arr0->height) : -INF;
            $h1 = $arr1->height;
            $diff = $h1 - $h0;

            if ($diff > 15) return new OrdinalNumber($arr1);
            if ($diff < -15) return new OrdinalNumber($arr0);

            $sum = 1 + pow(10, $h0 - $h1);
            $newHeight = $h1 + log10($sum);
            $result = new OrdinalNumber();
            $result->arrows = 1;
            $result->height = $newHeight;
            return $result->normalize();
        }

        // Higher arrows: larger dominates
        return $this->compare($other) >= 0 ? new OrdinalNumber($this) : new OrdinalNumber($other);
    }

    /**
     * Subtract another OrdinalNumber
     * Matches JS sub() method
     */
    public function subtract($other): OrdinalNumber {
        $other = self::from($other);

        // Both arrows=0: exact subtraction
        if ($this->arrows === 0 && $other->arrows === 0
            && !($this->height instanceof OrdinalNumber)
            && !($other->height instanceof OrdinalNumber)) {
            return new OrdinalNumber(max(0, $this->height - $other->height));
        }

        // If this <= other, result is 0
        if ($this->compare($other) <= 0) {
            return new OrdinalNumber(0);
        }

        // Both arrows=1
        if ($this->arrows === 1 && $other->arrows === 1) {
            $h1IsON = $this->height instanceof OrdinalNumber;
            $h2IsON = $other->height instanceof OrdinalNumber;

            if ($h1IsON || $h2IsON) {
                // Nested heights: result ≈ this
                return new OrdinalNumber($this);
            }

            $h1 = $this->height;
            $h2 = $other->height;
            $diff = $h1 - $h2;

            if ($diff > 15) return new OrdinalNumber($this);

            $factor = 1 - pow(10, $h2 - $h1);
            if ($factor <= 0) return new OrdinalNumber(0);
            $newHeight = $h1 + log10($factor);
            $result = new OrdinalNumber();
            $result->arrows = 1;
            $result->height = $newHeight;
            return $result->normalize();
        }

        // Mixed or higher: result ≈ this
        return new OrdinalNumber($this);
    }

    /**
     * Multiply by another OrdinalNumber
     * Matches JS mul() method
     */
    public function multiply($other): OrdinalNumber {
        $other = self::from($other);

        if ($this->isZero() || $other->isZero()) {
            return new OrdinalNumber(0);
        }

        // Both arrows=0: exact multiplication
        if ($this->arrows === 0 && $other->arrows === 0
            && !($this->height instanceof OrdinalNumber)
            && !($other->height instanceof OrdinalNumber)) {
            return new OrdinalNumber($this->height * $other->height);
        }

        // Both arrows=1: add exponents
        if ($this->arrows === 1 && $other->arrows === 1) {
            $result = new OrdinalNumber();
            $result->arrows = 1;

            $h1Num = !($this->height instanceof OrdinalNumber);
            $h2Num = !($other->height instanceof OrdinalNumber);

            if ($h1Num && $h2Num) {
                $result->height = $this->height + $other->height;
            } else {
                // Add heights using OrdinalNumber arithmetic
                $result->height = self::from($this->height)->add($other->height);
            }
            return $result->normalize();
        }

        // Mixed: one arrows=0, other arrows=1
        if ($this->arrows === 0 && $other->arrows === 1) {
            $result = new OrdinalNumber($other);
            if (!($this->height instanceof OrdinalNumber) && $this->height > 0
                && !($result->height instanceof OrdinalNumber)) {
                $result->height += log10($this->height);
            }
            return $result->normalize();
        }
        if ($this->arrows === 1 && $other->arrows === 0) {
            return $other->multiply($this);
        }

        // Higher arrows: larger dominates
        return $this->compare($other) >= 0 ? new OrdinalNumber($this) : new OrdinalNumber($other);
    }

    /**
     * Divide by another OrdinalNumber
     * Matches JS div() method
     */
    public function divide($other): OrdinalNumber {
        $other = self::from($other);

        if ($other->isZero()) {
            $result = new OrdinalNumber();
            $result->arrows = 10;
            $result->height = 9;
            return $result;
        }

        if ($this->isZero()) {
            return new OrdinalNumber(0);
        }

        // Both arrows=0
        if ($this->arrows === 0 && $other->arrows === 0
            && !($this->height instanceof OrdinalNumber)
            && !($other->height instanceof OrdinalNumber)) {
            return new OrdinalNumber($this->height / $other->height);
        }

        // 10^a / 10^b = 10^(a-b)
        if ($this->arrows === 1 && $other->arrows === 1
            && !($this->height instanceof OrdinalNumber)
            && !($other->height instanceof OrdinalNumber)) {
            $newHeight = $this->height - $other->height;
            if ($newHeight < 0) return new OrdinalNumber(0);
            $result = new OrdinalNumber();
            $result->arrows = 1;
            $result->height = $newHeight;
            return $result->normalize();
        }

        // Higher arrows
        $cmp = $this->compare($other);
        if ($cmp < 0) return new OrdinalNumber(0);
        if ($cmp === 0) return new OrdinalNumber(1);
        return new OrdinalNumber($this);
    }

    /**
     * Check if zero
     */
    public function isZero(): bool {
        return $this->arrows === 0
            && !($this->height instanceof OrdinalNumber)
            && $this->height == 0;
    }

    /**
     * Convert to display string
     */
    public function toString(): string {
        if ($this->height instanceof OrdinalNumber) {
            $innerStr = $this->height->toString();
            if ($this->arrows === 1) return "10^($innerStr)";
            if ($this->arrows === 2) return "10↑↑($innerStr)";
            return "10↑^{$this->arrows}($innerStr)";
        }

        if ($this->arrows === 0) {
            if ($this->height < 1000000) {
                return number_format($this->height, 0, '', ',');
            }
            return sprintf('%.2e', $this->height);
        }

        if ($this->arrows === 1) {
            if ($this->height < 36) {
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
            'height' => ($this->height instanceof OrdinalNumber)
                ? $this->height->toArray()
                : $this->height
        ];
    }
}
