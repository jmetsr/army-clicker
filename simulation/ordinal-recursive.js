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
    } else if (typeof val === 'bigint') {
      // Convert BigInt to Number for processing
      const num = Number(val);
      if (!isFinite(num) || num >= 1e12) {
        this.arrows = 1;
        const s = val.toString();
        this.height = s.length - 1 + Math.log10(parseFloat(s.slice(0, 15)) / Math.pow(10, Math.min(14, s.length - 1)));
      } else {
        this.arrows = 0;
        this.height = Math.max(0, Math.floor(num));
      }
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
    // FIX: Guard against Infinity/NaN to prevent infinite loop
    if (!isFinite(this.height) || isNaN(this.height)) {
      // Cap at a very large but finite value
      this.arrows = Math.min(this.arrows + 10, 100);
      this.height = 1e11;
      return this;
    }
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
        // Key insight: 10↑^(k+1) h1 ≈ 10↑^k (10↑^k ... h1 times)
        //
        // Special cases:
        //   10↑^(k+1) 1 = 10 (one iteration = just 10)
        //   10↑^(k+1) 2 = 10↑^k 10 (two iterations = 10↑^k applied to 10)
        //   10↑^(k+1) 3 = 10↑^k (10↑^k 10) (three iterations)
        //
        // So: 10^^^2 = 10^^10, 10^^^3 = 10^^(10^^10) = 10^^(huge)
        //
        // Strategy: "expand" the higher arrow by one level
        //   {k+1, h1} becomes approximately {k, 10^(h1-1)} for small h1
        //   But for h1 >= 3, the expansion is already huge

        // First handle the case where higher arrow's height is very small
        if (higherArrow.height <= 1) {
          // 10↑^(k+1) 1 = 10, so compare 10 vs 10↑^k h2
          // lower arrow wins if h2 > some threshold
          if (lowerArrow.arrows === 0) {
            return lowerArrow.height > 10 ?
              (aFlat.arrows > bFlat.arrows ? -1 : 1) :
              (aFlat.arrows > bFlat.arrows ? 1 : -1);
          }
          // lower arrow has arrows >= 1, so it's at least 10^something > 10
          return aFlat.arrows > bFlat.arrows ? -1 : 1;
        }

        if (higherArrow.height === 2) {
          // 10↑^(k+1) 2 = 10↑^k 10
          // Compare 10↑^k 10 vs 10↑^k h2, i.e., compare 10 vs h2
          if (lowerArrow.height > 10) {
            return aFlat.arrows > bFlat.arrows ? -1 : 1;
          } else if (lowerArrow.height < 10) {
            return aFlat.arrows > bFlat.arrows ? 1 : -1;
          }
          return 0; // Equal: 10↑^(k+1) 2 = 10↑^k 10
        }

        // higherArrow.height >= 3
        // 10↑^(k+1) 3 = 10↑^k (10↑^k 10) which is at least 10↑^k 10^10
        // For k=1: 10^^(10^10) has exponent 10^10 = 10 billion
        // For k=2: 10^^^3 = 10^^(10^^10) which is astronomically huge
        //
        // The "equivalent height" at the lower arrow level grows super-exponentially
        // For h1 >= 3, the higher arrow almost always wins
        // Exception: lowerArrow.height is itself enormous (near promotion threshold)

        if (higherArrow.arrows >= 2) {
          // For tetration and above with height >= 3, always wins
          return aFlat.arrows > bFlat.arrows ? 1 : -1;
        }

        // higherArrow.arrows === 1, comparing 10^h1 vs plain h2
        // 10^h1 vs h2 - higher wins if 10^h1 > h2
        const expandedHeight = Math.pow(10, Math.min(higherArrow.height, 300));
        if (expandedHeight > lowerArrow.height * 1e6) {
          return aFlat.arrows > bFlat.arrows ? 1 : -1;
        } else if (lowerArrow.height > expandedHeight * 1e6) {
          return aFlat.arrows > bFlat.arrows ? -1 : 1;
        }
        // Close - use log comparison
        if (higherArrow.height > Math.log10(Math.max(1, lowerArrow.height)) + 0.01) {
          return aFlat.arrows > bFlat.arrows ? 1 : -1;
        } else if (Math.log10(Math.max(1, lowerArrow.height)) > higherArrow.height + 0.01) {
          return aFlat.arrows > bFlat.arrows ? -1 : 1;
        }
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
  // Correctly handles {A, {j, h}} by bumping up to match arrow levels
  _flatten(n) {
    if (n.height instanceof OrdinalNumber) {
      // Recursively flatten the inner height first
      const inner = this._flatten(n.height);
      // {arrows: A, height: {arrows: j, height: h}}
      // = 10↑^A(10↑^j(h))

      if (inner.arrows === 0) {
        // Inner is just a plain number
        return { arrows: n.arrows, height: inner.height };
      }

      // inner.arrows >= 1
      const A = n.arrows;
      const j = inner.arrows;
      const h = inner.height;

      if (j >= A) {
        // Inner arrows >= outer arrows
        // {A, {j, h}} = 10↑^A(10↑^j(h))
        //
        // Convert to level j+1 using slog:
        // slog_{j+1}(10↑^A(10↑^j(h))) counts slog_j applications:
        //   - After 1 slog_j: if A < j, we get 10↑^A(h') for some h'
        //   - After (j-A+1) slog_j applications: we reach 10↑^j(h)
        //   - After (j-A+2) applications: we reach h
        //   - If h <= 10: result = (j-A+2) + log10(h)
        //
        // Simplified: result height = (j - A + 2) + log10(h) for h <= 10
        //             or (j - A + 2) + slog at lower level for h > 10

        if (h <= 10) {
          return { arrows: j + 1, height: (j - A + 2) + Math.log10(Math.max(1, h)) };
        } else if (h <= 1e10) {
          // h is moderate, add one more slog_j iteration
          return { arrows: j + 1, height: (j - A + 3) + Math.log10(Math.log10(h)) };
        } else {
          // h is huge, approximate
          return { arrows: j + 1, height: (j - A + 3) + Math.log10(Math.log10(h)) };
        }
      } else {
        // Inner arrows < outer arrows (j < A)
        // {A, {j, h}} means 10↑^A with HEIGHT = 10↑^j(h)
        // The inner structure IS the height of the outer operation.

        if (j === 1) {
          // Inner is 10^h, which IS the height of outer operation
          if (h <= 308) {
            // Computable as a number
            return { arrows: A, height: Math.pow(10, h) };
          } else {
            // 10^h is too large - bump to level A+1 and compute slog
            // slog_{A+1}(10↑^A(10^h)):
            //   After 1 slog_A: 10^h (the height)
            //   After 2 slog_A: slog_A(10^h) ≈ 2 + log10(log10(h)) for A >= 2
            // Result: 2 + log10(that)
            const innerSlog = 2 + Math.log10(Math.log10(h));
            return { arrows: A + 1, height: 2 + Math.log10(Math.max(1, innerSlog)) };
          }
        } else {
          // j >= 2 but j < A: inner is 10↑^j(h), which is huge
          // Bump to level A+1 and approximate
          // The height 10↑^j(h) is so large that slog_A gives roughly j + small
          return { arrows: A + 1, height: 2 + Math.log10(j + Math.log10(Math.max(1, h))) };
        }
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

    // Both arrows=0: exact addition
    if (this.arrows === 0 && other.arrows === 0) {
      return new OrdinalNumber(this.height + other.height);
    }

    // Both arrows=1: add via exponents (10^a + 10^b)
    if (this.arrows === 1 && other.arrows === 1) {
      // FIXED: Handle nested OrdinalNumber heights without calling toNumber()
      // If either height is an OrdinalNumber, compare them properly
      const h1IsON = this.height instanceof OrdinalNumber;
      const h2IsON = other.height instanceof OrdinalNumber;

      if (h1IsON || h2IsON) {
        // At least one height is an OrdinalNumber
        // Compare them using cmp() instead of toNumber()
        const on1 = h1IsON ? this.height : new OrdinalNumber(this.height);
        const on2 = h2IsON ? other.height : new OrdinalNumber(other.height);
        const cmp = on1.cmp(on2);

        // The larger exponent dominates completely
        // (at these scales, 10^huge + 10^huge ≈ 10^huge)
        if (cmp >= 0) {
          // Return copy with slightly increased height to represent "doubled"
          // For nested heights, we can't meaningfully add, so just return the max
          return new OrdinalNumber(this);
        } else {
          return new OrdinalNumber(other);
        }
      }

      // Both heights are plain numbers - original logic
      const h1 = this.height;
      const h2 = other.height;
      const diff = Math.abs(h1 - h2);

      // If exponents differ by > 15, smaller is negligible
      if (diff > 15) {
        return h1 > h2 ? new OrdinalNumber(this) : new OrdinalNumber(other);
      }

      // Close enough to add properly: 10^a + 10^b = 10^a * (1 + 10^(b-a))
      const maxH = Math.max(h1, h2);
      const minH = Math.min(h1, h2);
      const sum = Math.pow(10, minH - maxH) + 1; // 1 + 10^(min-max)
      const newHeight = maxH + Math.log10(sum);
      return new OrdinalNumber({ arrows: 1, height: newHeight }).normalize();
    }

    // Mixed: arrows=0 + arrows=1 (or vice versa)
    if ((this.arrows === 0 && other.arrows === 1) || (this.arrows === 1 && other.arrows === 0)) {
      const arr0 = this.arrows === 0 ? this : other;
      const arr1 = this.arrows === 1 ? this : other;

      // If arr1.height is an OrdinalNumber, arr1 is much larger
      if (arr1.height instanceof OrdinalNumber) {
        return new OrdinalNumber(arr1);
      }

      // Convert arrows=0 to arrows=1 format for comparison
      const h0 = arr0.height > 0 ? Math.log10(arr0.height) : -Infinity;
      const h1 = arr1.height;
      const diff = h1 - h0;

      // If arr1 is much larger (diff > 15), arr0 is negligible
      if (diff > 15) {
        return new OrdinalNumber(arr1);
      }

      // If arr0 is larger (shouldn't happen if arr1 >= 1e12 and arr0 < 1e12, but handle it)
      if (diff < -15) {
        return new OrdinalNumber(arr0);
      }

      // Close enough - do proper addition
      // 10^h1 + arr0.height = 10^h1 * (1 + arr0.height / 10^h1) = 10^h1 * (1 + 10^(h0-h1))
      const sum = 1 + Math.pow(10, h0 - h1);
      const newHeight = h1 + Math.log10(sum);
      return new OrdinalNumber({ arrows: 1, height: newHeight }).normalize();
    }

    // Higher arrows: larger dominates
    return this.cmp(other) >= 0 ? new OrdinalNumber(this) : new OrdinalNumber(other);
  }

  // ================================================================
  // SUBTRACTION (approximate)
  // ================================================================

  sub(other) {
    other = OrdinalNumber.from(other);

    // Both arrows=0: exact subtraction
    if (this.arrows === 0 && other.arrows === 0) {
      return new OrdinalNumber(Math.max(0, this.height - other.height));
    }

    // If this <= other, result is 0
    const cmp = this.cmp(other);
    if (cmp <= 0) return new OrdinalNumber(0);

    // Both arrows=1: subtract via exponents
    if (this.arrows === 1 && other.arrows === 1) {
      // FIXED: Handle nested OrdinalNumber heights without calling toNumber()
      const h1IsON = this.height instanceof OrdinalNumber;
      const h2IsON = other.height instanceof OrdinalNumber;

      if (h1IsON || h2IsON) {
        // At least one height is an OrdinalNumber
        // If this.height >> other.height, other is negligible
        const on1 = h1IsON ? this.height : new OrdinalNumber(this.height);
        const on2 = h2IsON ? other.height : new OrdinalNumber(other.height);
        const heightCmp = on1.cmp(on2);

        // If heights are similar or on1 is much bigger, result ≈ this
        // (subtracting a tiny amount from huge = huge)
        return new OrdinalNumber(this);
      }

      // Both heights are plain numbers - original logic
      const h1 = this.height;
      const h2 = other.height;
      const diff = h1 - h2;

      // If this >> other (diff > 15), other is negligible
      if (diff > 15) {
        return new OrdinalNumber(this);
      }

      // Close enough to subtract properly: 10^h1 - 10^h2 = 10^h1 * (1 - 10^(h2-h1))
      const factor = 1 - Math.pow(10, h2 - h1);
      if (factor <= 0) return new OrdinalNumber(0);
      const newHeight = h1 + Math.log10(factor);
      return new OrdinalNumber({ arrows: 1, height: newHeight }).normalize();
    }

    // Mixed: arrows=1 - arrows=0
    if (this.arrows === 1 && other.arrows === 0) {
      // If this.height is an OrdinalNumber, this is much larger
      if (this.height instanceof OrdinalNumber) {
        return new OrdinalNumber(this);
      }

      const h1 = this.height;
      const h0 = other.height > 0 ? Math.log10(other.height) : -Infinity;
      const diff = h1 - h0;

      // If this >> other, other is negligible
      if (diff > 15) {
        return new OrdinalNumber(this);
      }

      // Close enough - do proper subtraction
      const factor = 1 - Math.pow(10, h0 - h1);
      if (factor <= 0) return new OrdinalNumber(0);
      const newHeight = h1 + Math.log10(factor);
      return new OrdinalNumber({ arrows: 1, height: newHeight }).normalize();
    }

    // arrows=0 - arrows=1: result is 0 (arrows=1 is always bigger)
    if (this.arrows === 0 && other.arrows === 1) {
      return new OrdinalNumber(0);
    }

    // Higher arrows: if this > other by a lot, result ≈ this
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
    const n = new OrdinalNumber(this);

    if (n.arrows === 0) {
      // 10^n where n is a plain number
      if (n.height < 308) {
        const val = Math.pow(10, n.height);
        return new OrdinalNumber(val);
      } else {
        // 10^(big number) - becomes arrows=1, height is the exponent
        return new OrdinalNumber({arrows: 1, height: n.height}).normalize();
      }
    }

    // For arrows >= 1: 10^(this) where this = 10↑^k(h)
    // Result is 10^(10↑^k(h)) which is {arrows: 1, height: this}
    // Use nested OrdinalNumber for the height
    return new OrdinalNumber({arrows: 1, height: n}).normalize();
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
  // FORMATTING - "notation strains before it breaks"
  // ================================================================

  // Named number thresholds
  static NAMES = [
    { exp: 3, name: 'thousand' },
    { exp: 6, name: 'million' },
    { exp: 9, name: 'billion' },
    { exp: 12, name: 'trillion' },
    { exp: 15, name: 'quadrillion' },
    { exp: 18, name: 'quintillion' },
    { exp: 21, name: 'sextillion' },
    { exp: 24, name: 'septillion' },
    { exp: 27, name: 'octillion' },
    { exp: 30, name: 'nonillion' },
    { exp: 33, name: 'decillion' },
  ];

  // Helper: format number with commas
  static _commas(n) {
    return Math.floor(n).toLocaleString();
  }

  // Helper: format as named number (thousand to decillion)
  static _named(value) {
    // value is a plain number
    if (value < 1000) return OrdinalNumber._commas(value);

    const exp = Math.floor(Math.log10(value));
    // Find the largest name that fits
    let bestName = null;
    let bestExp = 0;
    for (const n of OrdinalNumber.NAMES) {
      if (n.exp <= exp) {
        bestName = n.name;
        bestExp = n.exp;
      }
    }
    if (!bestName) return OrdinalNumber._commas(value);

    const scaled = value / Math.pow(10, bestExp);
    if (scaled >= 100) {
      return Math.floor(scaled).toLocaleString() + ' ' + bestName;
    } else if (scaled >= 10) {
      return scaled.toFixed(1) + ' ' + bestName;
    } else {
      return scaled.toFixed(2) + ' ' + bestName;
    }
  }

  format() {
    const n = new OrdinalNumber(this).normalize();

    // FIXED: Handle nested OrdinalNumber heights without calling toNumber()
    // If height is an OrdinalNumber, format it recursively
    if (n.height instanceof OrdinalNumber) {
      const innerFormat = n.height.format();
      // Display as 10^(inner) or 10↑↑(inner) etc.
      if (n.arrows === 1) {
        return '10^(' + innerFormat + ')';
      } else if (n.arrows === 2) {
        return '10↑↑(' + innerFormat + ')';
      } else if (n.arrows === 3) {
        return '10↑↑↑(' + innerFormat + ')';
      } else if (n.arrows <= 5) {
        return '10' + '↑'.repeat(n.arrows) + '(' + innerFormat + ')';
      } else {
        return '10↑^' + n.arrows + '(' + innerFormat + ')';
      }
    }

    const h = n.height;

    // arrows=0: plain with commas up to 999,999, then named
    if (n.arrows === 0) {
      if (h < 1000000) {
        return OrdinalNumber._commas(h);
      }
      return OrdinalNumber._named(h);
    }

    // arrows=1: named up to 999.9 decillion (~10^35.9999), then scientific
    if (n.arrows === 1) {
      if (h < 36) {
        // Named range (up to 999.9 decillion ≈ 10^35.9999)
        const value = Math.pow(10, h);
        return OrdinalNumber._named(value);
      }
      if (h < 1000) {
        // Scientific: 10^500
        return '10^' + Math.floor(h);
      }
      if (h < 10000000) {
        // Scientific with commas: 10^1,250,000
        return '10^' + OrdinalNumber._commas(h);
      }
      // Very large exponent - will be handled by promotion to arrows=2
      return '10^' + OrdinalNumber._commas(h);
    }

    // arrows=2 (tetration): tower of ^, then ↑ strain, then clean ↑↑
    if (n.arrows === 2) {
      const height = Math.floor(h);
      if (height <= 6) {
        // Tower of ^s: 10^10^10^10^10^10
        return '10' + '^10'.repeat(height - 1);
      }
      if (height <= 12) {
        // ↑ strain: 10↑10↑10↑10↑10↑10↑10
        return Array(height).fill('10').join('↑');
      }
      // Clean ↑↑
      return '10↑↑' + height;
    }

    // arrows=3 (pentation): chain of ↑↑, then clean ↑↑↑
    if (n.arrows === 3) {
      const height = Math.floor(h);
      if (height <= 5) {
        // ↑↑ strain: 10↑↑10↑↑10↑↑10↑↑10
        return Array(height).fill('10').join('↑↑');
      }
      // Clean ↑↑↑
      return '10↑↑↑' + height;
    }

    // arrows=4: chain of ↑↑↑, then clean ↑↑↑↑
    if (n.arrows === 4) {
      const height = Math.floor(h);
      if (height <= 5) {
        // ↑↑↑ strain: 10↑↑↑10↑↑↑10↑↑↑10
        return Array(height).fill('10').join('↑↑↑');
      }
      // Clean ↑↑↑↑
      return '10↑↑↑↑' + height;
    }

    // arrows=5: last level before ↑^n notation
    if (n.arrows === 5) {
      const height = Math.floor(h);
      if (height <= 5) {
        return Array(height).fill('10').join('↑↑↑↑');
      }
      return '10↑↑↑↑↑' + height;
    }

    // arrows >= 6: use ↑^n notation
    const height = Math.floor(h);
    const arrowStr = '↑^' + n.arrows;
    if (height <= 5) {
      // Still show some strain
      const prevArrow = '↑'.repeat(n.arrows - 1);
      return Array(height).fill('10').join(prevArrow);
    }
    return '10' + arrowStr + ' ' + height;
  }

  // Short format for display
  fmt() {
    return this.format();
  }

  // ================================================================
  // COMPATIBILITY PROPERTIES (for old code accessing .layer/.value)
  // ================================================================

  get layer() {
    // Map arrows to old layer concept
    // Old: layer 0 = plain number, layer 1 = scientific, layer 2 = tower
    // New: arrows 0 = plain, arrows 1 = scientific, arrows 2+ = tower/higher
    return this.arrows;
  }

  get value() {
    // Map to old value concept
    if (this.arrows === 0) {
      return this.height;
    }
    if (this.arrows === 1) {
      // FIXED: Don't call toNumber() on nested heights
      if (this.height instanceof OrdinalNumber) {
        // Nested structure - return as tower to indicate "very large"
        return { tower: [this.height.arrows > 0 ? 1e15 : this.height.height] };
      }
      return { mantissa: 1, exponent: this.height };
    }
    // arrows 2+: tower format
    if (this.height instanceof OrdinalNumber) {
      return { tower: [1e15] }; // Indicate "extremely large"
    }
    return { tower: [this.height] };
  }

  // ================================================================
  // COMPATIBILITY METHODS (for game integration)
  // ================================================================

  clone() {
    return new OrdinalNumber(this);
  }

  isZero() {
    return this.arrows === 0 && this.height === 0;
  }

  floor() {
    // At arrows=0, floor the height
    if (this.arrows === 0) {
      const r = new OrdinalNumber(this);
      r.height = Math.floor(r.height);
      return r;
    }
    // Higher arrows are conceptually integers already
    return this.clone();
  }

  // Returns {mantissa, exponent} for compatibility with old code
  toSci() {
    if (this.arrows === 0) {
      if (this.height === 0) return { mantissa: 0, exponent: 0 };
      const exp = Math.floor(Math.log10(this.height));
      const mant = this.height / Math.pow(10, exp);
      return { mantissa: mant, exponent: exp };
    }
    if (this.arrows === 1) {
      // FIXED: Don't call toNumber() on nested heights
      if (this.height instanceof OrdinalNumber) {
        // Nested structure - return huge exponent
        return { mantissa: 1, exponent: 1e15 };
      }
      // mantissa is always ~1 for pure powers of 10
      return { mantissa: 1, exponent: this.height };
    }
    // Higher arrows - return huge exponent
    return { mantissa: 1, exponent: 1e15 };
  }

  // For debugging/display - what notation level are we at
  notationName() {
    if (this.arrows === 0) {
      if (this.height < 1000000) return 'Standard';
      return 'Named';
    }
    if (this.arrows === 1) {
      // FIXED: Don't call toNumber() on nested heights
      if (this.height instanceof OrdinalNumber) {
        return 'Nested Exponential';
      }
      if (this.height <= 33) return 'Named';
      if (this.height <= 1000000) return 'Scientific';
      return 'Double Exponential';
    }
    if (this.arrows === 2) return 'Tetration';
    if (this.arrows === 3) return 'Pentation';
    if (this.arrows === 4) return 'Hexation';
    return 'Arrow-' + this.arrows;
  }

  // ================================================================
  // STATIC HELPERS
  // ================================================================

  static from(val) {
    if (val instanceof OrdinalNumber) return val;
    return new OrdinalNumber(val);
  }

  // Alias for compatibility
  static _wrap(val) {
    return OrdinalNumber.from(val);
  }

  static fromNumber(n) {
    return new OrdinalNumber(n);
  }

  static fromBigInt(n) {
    // Convert BigInt to Number
    const num = Number(n);
    return new OrdinalNumber(num);
  }

  static fromSci(mantissa, exponent) {
    // Handle BigInt exponent (backwards compat)
    const exp = typeof exponent === 'bigint' ? Number(exponent) : exponent;

    if (exp < 12 && mantissa * Math.pow(10, exp) < 1e12) {
      // Small enough to be arrows=0
      return new OrdinalNumber(mantissa * Math.pow(10, exp));
    }

    // Create as arrows=1 with appropriate height
    // 10^exp * mantissa = 10^(exp + log10(mantissa))
    const height = exp + Math.log10(mantissa);
    return new OrdinalNumber({ arrows: 1, height: height }).normalize();
  }

  static fromTower(levels) {
    // levels is an array like [a] meaning 10^10^...^a
    // The length of the array determines the tower height
    if (!Array.isArray(levels) || levels.length === 0) {
      return new OrdinalNumber(0);
    }

    // FIXED: Guard against Infinity/NaN in levels
    const level0 = levels[0];
    if (!isFinite(level0) || isNaN(level0)) {
      // Infinity in tower levels - create a very large but valid number
      // This happens when toNumber() returns Infinity upstream
      return new OrdinalNumber({ arrows: 10, height: 1e11 });
    }

    // For a tower [a], this means 10^a at tower level = length
    // Actually in old code: tower[0] is the "top" value
    // So [100] means 10^100 (tower of 1 level with top=100)
    // And the tower length indicates how many 10^'s

    // In our representation:
    // - Tower of 1: arrows=1, height=levels[0] (just 10^a)
    // - Tower of 2+: arrows=2, height=levels.length with top value encoded
    // This is approximate - the old tower notation stored more info

    if (levels.length === 1) {
      // 10^levels[0]
      return new OrdinalNumber({ arrows: 1, height: level0 }).normalize();
    }

    // For longer towers, treat as tetration
    // The old code stored tower[0] as the top value
    // We approximate as arrows=2, height = number of levels + log adjustment
    return new OrdinalNumber({ arrows: 2, height: levels.length + Math.log10(Math.max(1, level0)) }).normalize();
  }
}

// Helper to create OrdinalNumber easily (must be after class definition for browser)
function ON(val) { return new OrdinalNumber(val); }

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OrdinalNumber, ON };
}
