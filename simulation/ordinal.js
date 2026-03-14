// ================================================================
//  ORDINAL NUMBER ENGINE - handles numbers across regimes
//  NO BIGINT - uses native Number for performance
// ================================================================

class OrdinalNumber {
  // Layer 0: Number (exact up to ~10^15, we promote at 10^12 for nice display)
  // Layer 1: {mantissa, exponent} both Number - covers up to 10^308
  // Layer 2: {tower: [a,b,c,...]} meaning 10^10^10^...^a - for beyond 10^308

  // Threshold for promoting from layer 0 to layer 1
  static PROMOTE_THRESHOLD = 1e12;  // 1 trillion

  // If exponent difference > this, ignore the smaller value in add/sub
  static SIGNIFICANCE_THRESHOLD = 7;  // ~1/10 million

  constructor(val) {
    if (val instanceof OrdinalNumber) {
      this.layer = val.layer;
      this.value = this._cloneValue(val);
    } else if (typeof val === 'bigint') {
      // Convert BigInt to Number (for backwards compatibility during transition)
      var n = Number(val);
      if (!isFinite(n) || n >= OrdinalNumber.PROMOTE_THRESHOLD) {
        this.layer = 1;
        var s = val.toString();
        var exp = s.length - 1;
        var mant = parseFloat(s.slice(0, 16)) / Math.pow(10, Math.min(15, s.length - 1));
        this.value = { mantissa: mant, exponent: exp };
      } else {
        this.layer = 0;
        this.value = Math.max(0, Math.floor(n));
      }
    } else if (typeof val === 'number') {
      if (!isFinite(val) || isNaN(val)) {
        this.layer = 1;
        this.value = { mantissa: 9.999, exponent: 999999999 };
      } else if (val >= OrdinalNumber.PROMOTE_THRESHOLD) {
        this.layer = 1;
        var exp = Math.floor(Math.log10(val));
        var mant = val / Math.pow(10, exp);
        this.value = { mantissa: mant, exponent: exp };
      } else {
        this.layer = 0;
        this.value = Math.max(0, Math.floor(val));
      }
    } else {
      this.layer = 0;
      this.value = 0;
    }
  }

  _cloneValue(other) {
    if (other.layer === 0) return other.value;
    if (other.layer === 1) return { mantissa: other.value.mantissa, exponent: other.value.exponent };
    if (other.layer === 2) return { tower: [...other.value.tower] };
    return JSON.parse(JSON.stringify(other.value));
  }

  static fromBigInt(n) { return new OrdinalNumber(n); }
  static fromNumber(n) { return new OrdinalNumber(n); }

  static fromSci(mantissa, exponent) {
    var r = new OrdinalNumber(0);
    // Convert BigInt exponent if passed (backwards compat)
    var exp = typeof exponent === 'bigint' ? Number(exponent) : exponent;
    if (exp < 12 && mantissa * Math.pow(10, exp) < OrdinalNumber.PROMOTE_THRESHOLD) {
      r.layer = 0;
      r.value = Math.floor(mantissa * Math.pow(10, exp));
    } else {
      r.layer = 1;
      r.value = { mantissa: mantissa, exponent: exp };
      r.normalize();
    }
    return r;
  }

  static fromTower(levels) {
    var r = new OrdinalNumber(0);
    r.layer = 2;
    r.value = { tower: levels };
    return r;
  }

  clone() {
    var r = new OrdinalNumber(0);
    r.layer = this.layer;
    r.value = this._cloneValue(this);
    return r;
  }

  // Normalize mantissa to [1, 10) and check for layer promotion
  normalize() {
    if (this.layer === 0) {
      if (this.value >= OrdinalNumber.PROMOTE_THRESHOLD) {
        var exp = Math.floor(Math.log10(this.value));
        var mant = this.value / Math.pow(10, exp);
        this.layer = 1;
        this.value = { mantissa: mant, exponent: exp };
      }
    }
    if (this.layer === 1) {
      // Normalize mantissa to [1, 10)
      if (this.value.mantissa >= 10) {
        while (this.value.mantissa >= 10) {
          this.value.mantissa /= 10;
          this.value.exponent += 1;
        }
      } else if (this.value.mantissa < 1 && this.value.mantissa > 0) {
        while (this.value.mantissa < 1 && this.value.exponent > 0) {
          this.value.mantissa *= 10;
          this.value.exponent -= 1;
        }
      }
      // Check for promotion to layer 2 (tower)
      // Only promote when exponent itself is huge (> 1e15), not just > 308
      // JS Number can represent exponents up to ~10^15 safely
      if (this.value.exponent > 1e15) {
        this.layer = 2;
        this.value = { tower: [this.value.exponent] };
      }
      // Check for demotion back to layer 0
      if (this.value.exponent < 12) {
        var num = this.value.mantissa * Math.pow(10, this.value.exponent);
        if (num < OrdinalNumber.PROMOTE_THRESHOLD) {
          this.layer = 0;
          this.value = Math.floor(num);
        }
      }
    }
    return this;
  }

  // === COMPARISON ===
  gte(other) {
    other = OrdinalNumber._wrap(other);
    if (this.layer !== other.layer) return this.layer > other.layer;
    if (this.layer === 0) return this.value >= other.value;
    if (this.layer === 1) {
      if (this.value.exponent !== other.value.exponent) return this.value.exponent > other.value.exponent;
      return this.value.mantissa >= other.value.mantissa;
    }
    if (this.layer === 2) return this.value.tower.length >= other.value.tower.length;
    return true;
  }

  gt(other) { other = OrdinalNumber._wrap(other); return this.gte(other) && !this.eq(other); }
  lte(other) { return !this.gt(other); }
  lt(other) { return !this.gte(other); }

  eq(other) {
    other = OrdinalNumber._wrap(other);
    if (this.layer !== other.layer) return false;
    if (this.layer === 0) return this.value === other.value;
    if (this.layer === 1) return this.value.exponent === other.value.exponent && Math.abs(this.value.mantissa - other.value.mantissa) < 0.0001;
    return false;
  }

  isZero() { return this.layer === 0 && this.value === 0; }

  static _wrap(x) {
    if (x instanceof OrdinalNumber) return x;
    return new OrdinalNumber(x);
  }

  // === ARITHMETIC ===
  add(other) {
    other = OrdinalNumber._wrap(other);

    // Layer 0 + Layer 0
    if (this.layer === 0 && other.layer === 0) {
      return new OrdinalNumber(this.value + other.value);
    }

    // Layer 2 dominates everything
    if (this.layer === 2 && other.layer < 2) return this.clone();
    if (other.layer === 2 && this.layer < 2) return other.clone();

    // Layer 0 + Layer 1: convert layer 0 to scientific and add
    if (this.layer === 0 && other.layer === 1) {
      var sci = this.toSci();
      var expDiff = sci.exponent - other.value.exponent;
      if (expDiff < -OrdinalNumber.SIGNIFICANCE_THRESHOLD) return other.clone();
      if (expDiff > OrdinalNumber.SIGNIFICANCE_THRESHOLD) return this.clone();
      var r = other.clone();
      r.value.mantissa += sci.mantissa / Math.pow(10, -expDiff);
      return r.normalize();
    }
    if (this.layer === 1 && other.layer === 0) {
      var sci = other.toSci();
      var expDiff = this.value.exponent - sci.exponent;
      if (expDiff > OrdinalNumber.SIGNIFICANCE_THRESHOLD) return this.clone();
      if (expDiff < -OrdinalNumber.SIGNIFICANCE_THRESHOLD) return other.clone();
      var r = this.clone();
      r.value.mantissa += sci.mantissa / Math.pow(10, expDiff);
      return r.normalize();
    }

    // Both layer 1
    if (this.layer === 1) {
      var expDiff = this.value.exponent - other.value.exponent;
      // If difference > threshold, smaller is negligible
      if (expDiff > OrdinalNumber.SIGNIFICANCE_THRESHOLD) return this.clone();
      if (expDiff < -OrdinalNumber.SIGNIFICANCE_THRESHOLD) return other.clone();

      // Close enough to add - align exponents
      var r = this.clone();
      if (expDiff >= 0) {
        r.value.mantissa += other.value.mantissa / Math.pow(10, expDiff);
      } else {
        r.value.exponent = other.value.exponent;
        r.value.mantissa = other.value.mantissa + this.value.mantissa / Math.pow(10, -expDiff);
      }
      return r.normalize();
    }

    // Layer 2 - just return the larger one
    return this.clone();
  }

  sub(other) {
    other = OrdinalNumber._wrap(other);

    // Layer 0 - Layer 0
    if (this.layer === 0 && other.layer === 0) {
      var v = this.value - other.value;
      return new OrdinalNumber(v < 0 ? 0 : v);
    }

    // Layer 2 handling
    if (this.layer === 2 && other.layer < 2) return this.clone();
    if (other.layer === 2 && this.layer < 2) return new OrdinalNumber(0);

    // Layer 1 - Layer 0: convert and subtract
    if (this.layer === 1 && other.layer === 0) {
      var sci = other.toSci();
      var expDiff = this.value.exponent - sci.exponent;
      if (expDiff > OrdinalNumber.SIGNIFICANCE_THRESHOLD) return this.clone();
      if (expDiff < -OrdinalNumber.SIGNIFICANCE_THRESHOLD) return new OrdinalNumber(0);
      var r = this.clone();
      r.value.mantissa -= sci.mantissa / Math.pow(10, expDiff);
      if (r.value.mantissa <= 0) return new OrdinalNumber(0);
      return r.normalize();
    }
    // Layer 0 - Layer 1: usually 0 unless layer 0 is bigger
    if (this.layer === 0 && other.layer === 1) {
      var sci = this.toSci();
      var expDiff = sci.exponent - other.value.exponent;
      if (expDiff < -OrdinalNumber.SIGNIFICANCE_THRESHOLD) return new OrdinalNumber(0);
      if (expDiff > OrdinalNumber.SIGNIFICANCE_THRESHOLD) return this.clone();
      // They're close - do the subtraction
      var result = sci.mantissa * Math.pow(10, expDiff) - other.value.mantissa;
      if (result <= 0) return new OrdinalNumber(0);
      return OrdinalNumber.fromSci(result, other.value.exponent);
    }

    // Both layer 1
    if (this.layer === 1) {
      var expDiff = this.value.exponent - other.value.exponent;
      // If we're much bigger, subtraction is negligible
      if (expDiff > OrdinalNumber.SIGNIFICANCE_THRESHOLD) return this.clone();
      // If they're much bigger, result is 0
      if (expDiff < -OrdinalNumber.SIGNIFICANCE_THRESHOLD) return new OrdinalNumber(0);

      var r = this.clone();
      r.value.mantissa -= other.value.mantissa / Math.pow(10, expDiff);
      if (r.value.mantissa <= 0) return new OrdinalNumber(0);
      return r.normalize();
    }

    return this.clone();
  }

  mul(other) {
    // Handle plain number multiplier (common case: percentages, factors)
    if (typeof other === 'number') {
      if (this.layer === 0) {
        var result = this.value * other;
        return new OrdinalNumber(result);
      }
      if (this.layer === 1) {
        var r = this.clone();
        r.value.mantissa *= other;
        return r.normalize();
      }
      if (this.layer === 2) {
        // For tower notation, multiplying by a number adds log10(number) to the top
        // But this is usually negligible - only matters if number is huge
        if (other > 1e10) {
          var r = this.clone();
          r.value.tower[0] += Math.log10(other);
          return r;
        }
        return this.clone();
      }
      return this.clone();
    }

    other = OrdinalNumber._wrap(other);

    // Layer 0 * Layer 0
    if (this.layer === 0 && other.layer === 0) {
      return new OrdinalNumber(this.value * other.value);
    }

    // Layer 2 handling
    if (this.layer === 2 || other.layer === 2) {
      // Layer 2 * Layer 2: combine towers (take max, they're so big it doesn't matter much)
      if (this.layer === 2 && other.layer === 2) {
        var r = this.clone();
        // Just take the larger tower
        if (other.value.tower[0] > this.value.tower[0]) {
          r.value.tower[0] = other.value.tower[0];
        }
        return r;
      }
      // Layer 2 * Layer 1: add the exponent to tower[0] (it's usually negligible but let's do it right)
      if (this.layer === 2) {
        var r = this.clone();
        var otherExp = other.toSci().exponent;
        // 10^(10^a) * 10^e = 10^(10^a + e), but 10^a >> e usually, so just add e/10^a which rounds to 0
        // However, if e is significant compared to 10^a, we should note it
        // For simplicity: just add log10(e) to tower if e > 1e10
        if (otherExp > 1e10) {
          r.value.tower[0] += Math.log10(otherExp);
        }
        return r;
      }
      // Layer 1 * Layer 2
      if (other.layer === 2) {
        var r = other.clone();
        var thisExp = this.toSci().exponent;
        if (thisExp > 1e10) {
          r.value.tower[0] += Math.log10(thisExp);
        }
        return r;
      }
    }

    // Both layer 0 or layer 1: convert to scientific and multiply
    var a = this.toSci();
    var b = other.toSci();
    var mant = a.mantissa * b.mantissa;
    var exp = a.exponent + b.exponent;

    // Normalize mantissa
    if (mant >= 10) { mant /= 10; exp += 1; }
    if (mant < 1 && mant > 0) { mant *= 10; exp -= 1; }

    return OrdinalNumber.fromSci(mant, exp);
  }

  div(other) {
    other = OrdinalNumber._wrap(other);
    if (other.isZero()) return new OrdinalNumber(0);

    // Layer 0 / Layer 0
    if (this.layer === 0 && other.layer === 0) {
      return new OrdinalNumber(Math.floor(this.value / other.value));
    }

    // Layer 2 handling
    if (this.layer === 2 || other.layer === 2) {
      // Layer 2 / Layer 2: subtract towers (result depends on which is bigger)
      if (this.layer === 2 && other.layer === 2) {
        if (this.value.tower[0] > other.value.tower[0]) {
          return this.clone(); // Dividing by smaller tower is negligible
        }
        return new OrdinalNumber(0); // Dividing by larger tower gives ~0
      }
      // Layer 2 / Layer 1: still huge, return this
      if (this.layer === 2) {
        return this.clone();
      }
      // Layer 1 / Layer 2: result is ~0
      return new OrdinalNumber(0);
    }

    // Convert to scientific and divide
    var a = this.toSci();
    var b = other.toSci();
    var mant = a.mantissa / b.mantissa;
    var exp = a.exponent - b.exponent;

    // Normalize mantissa
    while (mant >= 10) { mant /= 10; exp += 1; }
    while (mant < 1 && mant > 0 && exp > 0) { mant *= 10; exp -= 1; }

    if (exp < 0) return new OrdinalNumber(0);
    return OrdinalNumber.fromSci(mant, exp);
  }

  // Multiply by fraction (for percentage operations like drain)
  mulFraction(numerator, denominator) {
    if (this.layer === 0) {
      return new OrdinalNumber(Math.floor(this.value * numerator / denominator));
    }
    if (this.layer === 1) {
      var r = this.clone();
      r.value.mantissa *= (numerator / denominator);
      return r.normalize();
    }
    // Layer 2: fractions are negligible on tower numbers
    // e.g., 10^10^1000 * 0.5 ≈ 10^10^1000 (the 0.5 doesn't matter)
    return this.clone();
  }

  toSci() {
    if (this.layer === 0) {
      if (this.value === 0) return { mantissa: 0, exponent: 0 };
      var exp = Math.floor(Math.log10(this.value));
      var mant = this.value / Math.pow(10, exp);
      return { mantissa: mant, exponent: exp };
    }
    if (this.layer === 1) return { mantissa: this.value.mantissa, exponent: this.value.exponent };
    return { mantissa: 1, exponent: 999999999 };
  }

  toNumber() {
    if (this.layer === 0) {
      return this.value;
    }
    if (this.layer === 1) {
      if (this.value.exponent > 308) return Infinity;
      return this.value.mantissa * Math.pow(10, this.value.exponent);
    }
    return Infinity;
  }

  floor() {
    if (this.layer === 0) return this.clone();
    return this.clone(); // higher layers are already "integers" conceptually
  }

  // === DISPLAY ===
  format() {
    if (this.layer === 0) {
      var n = this.value;
      if (n < 1000) return n.toLocaleString('en-US');
      if (n < 1000000) return n.toLocaleString('en-US');

      // Use word format for readability
      var words = [[33,'decillion'],[30,'nonillion'],[27,'octillion'],[24,'septillion'],
                   [21,'sextillion'],[18,'quintillion'],[15,'quadrillion'],[12,'trillion'],
                   [9,'billion'],[6,'million'],[3,'thousand']];
      for (var i = 0; i < words.length; i++) {
        var exp = words[i][0], word = words[i][1];
        var threshold = Math.pow(10, exp);
        if (n >= threshold) {
          var scaled = n / threshold;
          if (scaled < 10) return scaled.toFixed(2) + ' ' + word;
          if (scaled < 100) return scaled.toFixed(1) + ' ' + word;
          return Math.floor(scaled).toLocaleString('en-US') + ' ' + word;
        }
      }
      return n.toLocaleString('en-US');
    }

    if (this.layer === 1) {
      var exp = this.value.exponent;
      var mant = this.value.mantissa;

      // If mantissa is essentially 0 (would display as 0.000), just show 0
      if (mant < 0.0005) return '0';

      // Use word names for exponents up to decillion (1e33)
      if (exp <= 33) {
        var words = [[33,'decillion'],[30,'nonillion'],[27,'octillion'],[24,'septillion'],
                     [21,'sextillion'],[18,'quintillion'],[15,'quadrillion'],[12,'trillion'],
                     [9,'billion'],[6,'million'],[3,'thousand']];
        for (var i = 0; i < words.length; i++) {
          var wordExp = words[i][0], word = words[i][1];
          if (exp >= wordExp) {
            var displayExp = exp - wordExp;
            var displayVal = mant * Math.pow(10, displayExp);
            if (displayVal < 10) return displayVal.toFixed(2) + ' ' + word;
            if (displayVal < 100) return displayVal.toFixed(1) + ' ' + word;
            return Math.floor(displayVal).toLocaleString('en-US') + ' ' + word;
          }
        }
        // Below thousand - just show as number
        var val = mant * Math.pow(10, exp);
        return val < 10 ? val.toFixed(2) : Math.floor(val).toLocaleString('en-US');
      }

      // Scientific for larger exponents
      if (exp <= 1000000) return mant.toFixed(3) + 'e' + exp;

      // Double exponential
      var eExp = Math.floor(Math.log10(exp));
      var eMant = exp / Math.pow(10, eExp);
      return '10^(' + eMant.toFixed(3) + 'e' + eExp + ')';
    }

    if (this.layer === 2) {
      var t = this.value.tower;
      if (t.length <= 4) return '10' + '^10'.repeat(t.length - 1) + '^' + t[0];
      return '10\u2191\u21912' + t.length + '(' + t[0] + ')';
    }

    return '???';
  }

  notationName() {
    if (this.layer === 0) {
      if (this.value < 1000000) return 'Standard';
      if (this.value < 1e15) return 'Named';
      return 'Scientific';
    }
    if (this.layer === 1) {
      if (this.value.exponent <= 1000000) return 'Scientific';
      return 'Double Exponential';
    }
    if (this.layer === 2) return 'Tetration';
    return 'Beyond';
  }
}

// Helper to create OrdinalNumber easily
function ON(val) { return new OrdinalNumber(val); }

// Export for Node.js (simulation)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OrdinalNumber, ON };
}
