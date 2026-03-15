// ================================================================
// Recursive Arrow/Height OrdinalNumber
//
// Representation: {arrows: Number, height: OrdinalNumber|Number}
// - arrows=0: height is a plain number (base case)
// - arrows=1: 10^height (scientific notation)
// - arrows=2: 10^^height (tetration)
// - arrows=k: 10↑^k height
//
// Key insight: arrows and height TRADE OFF
//   {arrows: k, height: 10} ≈ {arrows: k+1, height: 1}
// So we normalize to keep height in [1, 10)
// ================================================================

class OrdinalNumber {
  constructor(val) {
    if (val instanceof OrdinalNumber) {
      this.arrows = val.arrows;
      // Deep copy height if it's an OrdinalNumber
      this.height = (val.height instanceof OrdinalNumber)
        ? new OrdinalNumber(val.height)
        : val.height;
    } else if (typeof val === 'object' && val !== null && 'arrows' in val) {
      // Raw {arrows, height} object
      this.arrows = val.arrows;
      this.height = (val.height instanceof OrdinalNumber)
        ? new OrdinalNumber(val.height)
        : (typeof val.height === 'object' && val.height !== null && 'arrows' in val.height)
          ? new OrdinalNumber(val.height)
          : val.height;
    } else if (typeof val === 'number') {
      if (!isFinite(val) || isNaN(val)) {
        this.arrows = 0;
        this.height = 0;
      } else if (val < 1e12) {
        this.arrows = 0;
        this.height = val;
      } else if (val < 1e308) {
        this.arrows = 1;
        this.height = Math.log10(val);
      } else {
        // Infinity or very large - treat as 10^308
        this.arrows = 1;
        this.height = 308;
      }
    } else {
      this.arrows = 0;
      this.height = 0;
    }
  }

  // ================================================================
  // NORMALIZATION - the key operation
  // Keep height in [1, 10) by trading with arrows
  // ================================================================

  normalize() {
    // Base case: arrows=0, height is plain number
    if (this.arrows === 0) {
      if (this.height >= 1e12) {
        // Promote to arrows=1
        this.arrows = 1;
        this.height = Math.log10(this.height);
        return this.normalize(); // Recurse in case height is still big
      }
      return this;
    }

    // Recursive case: height might be OrdinalNumber
    if (this.height instanceof OrdinalNumber) {
      this.height.normalize();

      // If height has arrows > 0, we have nested structure
      // {arrows: k, height: {arrows: j, height: h}}
      // This is fine - comparison will recurse
      return this;
    }

    // Height is a number, arrows > 0
    // Only normalize when height is HUGE (>= 1e12)
    // This keeps 10^100 as {arrows:1, height:100} which is readable
    // But 10^(1e15) becomes {arrows:2, height:15}
    while (this.height >= 1e12) {
      this.arrows += 1;
      this.height = Math.log10(this.height);
    }

    // Denormalize if height too small (< 1) and we can reduce arrows
    while (this.height < 1 && this.arrows > 0) {
      this.arrows -= 1;
      if (this.arrows === 0) {
        // Back to plain number
        this.height = Math.pow(10, this.height);
      } else {
        this.height = Math.pow(10, this.height);
      }
    }

    return this;
  }

  // ================================================================
  // COMPARISON
  // ================================================================

  cmp(other) {
    other = OrdinalNumber.from(other);

    const a = new OrdinalNumber(this).normalize();
    const b = new OrdinalNumber(other).normalize();

    // Get effective comparison values
    // We flatten the structure to (arrows, numericHeight) pairs
    const aFlat = this._flatten(a);
    const bFlat = this._flatten(b);

    // Compare arrows first
    if (aFlat.arrows !== bFlat.arrows) {
      // Different arrow counts - need to check if lower arrow count can win
      // 10^^^2 = 10^^10, 10^^^3 = 10^^(10^^10) = 10^^(huge)
      // Generally: {k+1, h} > {k, any} when h >= 2
      // But: {k+1, 2} = {k, 10} approximately
      // And: {k, 1000} > {k+1, 2} because 1000 > 10

      const higherArrow = aFlat.arrows > bFlat.arrows ? aFlat : bFlat;
      const lowerArrow = aFlat.arrows > bFlat.arrows ? bFlat : aFlat;
      const diff = higherArrow.arrows - lowerArrow.arrows;

      if (diff === 1) {
        // Compare {k+1, h1} vs {k, h2}
        // {k+1, h} ≈ {k, 10^(h-1) iterated} which is roughly {k, 10^h} for comparison
        // So {k+1, h1} wins if 10^h1 > h2, i.e., h1 > log10(h2)
        const expandedHeight = Math.pow(10, higherArrow.height);
        if (expandedHeight > lowerArrow.height * 1e6) {
          // Higher arrow clearly wins
          return aFlat.arrows > bFlat.arrows ? 1 : -1;
        } else if (lowerArrow.height > expandedHeight * 1e6) {
          // Lower arrow wins
          return aFlat.arrows > bFlat.arrows ? -1 : 1;
        }
        // Close - expand another level for precision
        // For simplicity, use log comparison
        if (higherArrow.height > Math.log10(lowerArrow.height) + 0.01) {
          return aFlat.arrows > bFlat.arrows ? 1 : -1;
        } else if (Math.log10(lowerArrow.height) > higherArrow.height + 0.01) {
          return aFlat.arrows > bFlat.arrows ? -1 : 1;
        }
        // Very close, call it equal (rare)
        return 0;
      } else {
        // diff >= 2, higher arrow almost always wins
        // Exception: height is 1 or less
        if (higherArrow.height <= 1) {
          // 10^^^1 = 10, so lower arrow likely wins
          return aFlat.arrows > bFlat.arrows ? -1 : 1;
        }
        return aFlat.arrows > bFlat.arrows ? 1 : -1;
      }
    }

    // Same arrows - compare heights
    return aFlat.height - bFlat.height;
  }

  // Flatten nested height to simple (arrows, numericHeight)
  _flatten(n) {
    if (n.height instanceof OrdinalNumber) {
      // Recursively flatten height
      const inner = this._flatten(n.height);
      // {arrows: k, height: {arrows: j, height: h}}
      // = 10↑^k(10↑^j(h))
      // We need to combine these into a single level
      // For comparison purposes, treat inner as "10^inner.height" if inner.arrows=1
      // This is approximate but works for comparison
      if (inner.arrows === 0) {
        return { arrows: n.arrows, height: inner.height };
      } else {
        // Nested structure - approximate by boosting outer arrows
        // {k, {j, h}} ≈ {k+j, h} roughly (very rough!)
        return { arrows: n.arrows + inner.arrows, height: inner.height };
      }
    } else {
      return { arrows: n.arrows, height: n.height };
    }
  }

  lt(other) { return this.cmp(other) < 0; }
  lte(other) { return this.cmp(other) <= 0; }
  gt(other) { return this.cmp(other) > 0; }
  gte(other) { return this.cmp(other) >= 0; }
  eq(other) { return this.cmp(other) === 0; }

  // ================================================================
  // ADDITION (approximate - take max since larger dominates)
  // ================================================================

  add(other) {
    other = OrdinalNumber.from(other);

    // At high levels, sum ≈ max
    // But at arrows=0, we can do exact addition
    if (this.arrows === 0 && other.arrows === 0) {
      return new OrdinalNumber(this.height + other.height);
    }

    // Otherwise take the larger
    return this.cmp(other) >= 0 ? new OrdinalNumber(this) : new OrdinalNumber(other);
  }

  // ================================================================
  // SUBTRACTION (approximate)
  // ================================================================

  sub(other) {
    other = OrdinalNumber.from(other);

    if (this.arrows === 0 && other.arrows === 0) {
      return new OrdinalNumber(Math.max(0, this.height - other.height));
    }

    // If this >> other, result ≈ this
    // If this ≈ other, result ≈ 0 (but we can't know exactly)
    // If this < other, result = 0
    const cmp = this.cmp(other);
    if (cmp <= 0) return new OrdinalNumber(0);

    // this > other
    // If arrows differ by 2+, result ≈ this
    const a = new OrdinalNumber(this).normalize();
    const b = new OrdinalNumber(other).normalize();

    if (a.arrows > b.arrows + 1) {
      return new OrdinalNumber(this);
    }

    // Close values - approximate as this (imprecise but safe)
    return new OrdinalNumber(this);
  }

  // ================================================================
  // MULTIPLICATION
  // ================================================================

  mul(other) {
    other = OrdinalNumber.from(other);

    // Plain numbers: exact multiplication
    if (this.arrows === 0 && other.arrows === 0) {
      return new OrdinalNumber(this.height * other.height);
    }

    // 10^a * 10^b = 10^(a+b)
    // At arrows=1: multiply = add exponents
    if (this.arrows === 1 && other.arrows === 1) {
      const result = new OrdinalNumber({arrows: 1, height: 0});
      // Add the heights (exponents)
      if (typeof this.height === 'number' && typeof other.height === 'number') {
        result.height = this.height + other.height;
      } else {
        result.height = OrdinalNumber.from(this.height).add(other.height);
      }
      return result.normalize();
    }

    // Mixed: one is arrows=0, other is arrows=1
    if (this.arrows === 0 && other.arrows === 1) {
      // n * 10^k = 10^(k + log10(n))
      const result = new OrdinalNumber(other);
      if (this.height > 0) {
        const logN = Math.log10(this.height);
        if (typeof result.height === 'number') {
          result.height += logN;
        }
      }
      return result.normalize();
    }
    if (this.arrows === 1 && other.arrows === 0) {
      return other.mul(this); // Commutative
    }

    // Higher arrows: larger one dominates
    // 10^^a * 10^^b ≈ 10^^max(a,b) for very different a,b
    // More precisely: 10^^a * 10^^b = 10^^a * 10^^b, but approximation is ok
    return this.cmp(other) >= 0 ? new OrdinalNumber(this) : new OrdinalNumber(other);
  }

  // ================================================================
  // DIVISION (approximate)
  // ================================================================

  div(other) {
    other = OrdinalNumber.from(other);

    if (other.arrows === 0 && other.height === 0) {
      // Division by zero - return infinity-ish
      return new OrdinalNumber({arrows: 10, height: 9});
    }

    if (this.arrows === 0 && other.arrows === 0) {
      return new OrdinalNumber(this.height / other.height);
    }

    // 10^a / 10^b = 10^(a-b)
    if (this.arrows === 1 && other.arrows === 1) {
      if (typeof this.height === 'number' && typeof other.height === 'number') {
        const newHeight = this.height - other.height;
        if (newHeight < 0) return new OrdinalNumber(0);
        return new OrdinalNumber({arrows: 1, height: newHeight}).normalize();
      }
    }

    // Higher arrows: if this >> other, result ≈ this
    const cmp = this.cmp(other);
    if (cmp < 0) return new OrdinalNumber(0);
    if (cmp === 0) return new OrdinalNumber(1);
    return new OrdinalNumber(this);
  }

  // ================================================================
  // EXPONENTIATION: 10^this
  // ================================================================

  exp10() {
    const result = new OrdinalNumber(this);

    if (result.arrows === 0) {
      // 10^n where n is a plain number
      if (result.height < 308) {
        const val = Math.pow(10, result.height);
        return new OrdinalNumber(val);
      } else {
        // 10^(big number) - becomes arrows=1
        return new OrdinalNumber({arrows: 1, height: result.height}).normalize();
      }
    }

    // 10^(10^h) = 10^^2 with height adjustment
    // More generally: 10^(10↑^k h)
    // This increases the tower by 1
    result.arrows += 1;
    return result.normalize();
  }

  // ================================================================
  // FRACTION OPERATIONS (for game compatibility)
  // ================================================================

  mulFraction(num, denom) {
    // this * (num/denom)
    if (this.arrows === 0) {
      return new OrdinalNumber(this.height * num / denom);
    }
    // At higher levels, fraction is negligible unless num/denom ≈ 1
    if (num === denom) return new OrdinalNumber(this);
    if (num === 0) return new OrdinalNumber(0);
    // Approximate: adjust exponent
    const factor = num / denom;
    if (this.arrows === 1 && typeof this.height === 'number') {
      return new OrdinalNumber({arrows: 1, height: this.height + Math.log10(factor)}).normalize();
    }
    return new OrdinalNumber(this);
  }

  // ================================================================
  // CONVERSION
  // ================================================================

  toNumber() {
    if (this.arrows === 0) {
      return this.height;
    }
    if (this.arrows === 1) {
      const h = (this.height instanceof OrdinalNumber) ? this.height.toNumber() : this.height;
      if (h < 308) {
        return Math.pow(10, h);
      }
      return Infinity;
    }
    return Infinity;
  }

  // ================================================================
  // FORMATTING
  // ================================================================

  format() {
    const n = new OrdinalNumber(this).normalize();

    if (n.arrows === 0) {
      if (Number.isInteger(n.height) && n.height < 1e6) {
        return n.height.toLocaleString();
      }
      return n.height.toFixed(2);
    }

    if (n.arrows === 1) {
      const h = (n.height instanceof OrdinalNumber) ? n.height.format() : n.height.toFixed(2);
      return `10^${h}`;
    }

    if (n.arrows === 2) {
      const h = (n.height instanceof OrdinalNumber) ? n.height.format() : n.height.toFixed(2);
      return `10^^${h}`;
    }

    // Higher arrows
    const h = (n.height instanceof OrdinalNumber) ? n.height.format() : n.height.toFixed(2);
    return `10↑^${n.arrows} ${h}`;
  }

  // Short format for display
  fmt() {
    return this.format();
  }

  // ================================================================
  // STATIC HELPERS
  // ================================================================

  static from(val) {
    if (val instanceof OrdinalNumber) return val;
    return new OrdinalNumber(val);
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OrdinalNumber };
}
