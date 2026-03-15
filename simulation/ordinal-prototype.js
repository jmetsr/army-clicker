// ================================================================
// PROTOTYPE: Compare two approaches for large number representation
// Run with: node simulation/ordinal-prototype.js
// ================================================================

console.log("=== ORDINAL NUMBER PROTOTYPE COMPARISON ===\n");

// ================================================================
// APPROACH 1: Current-style tower representation
// Stores actual structure: {tower: [a, b, c]} = 10^10^10^a where tower has values
// ================================================================

class TowerNumber {
  // tower[0] is the "top" of the tower
  // 10^tower[0] if length 1
  // 10^10^tower[0] if length 2 (but tower[0] could be big)
  // etc.

  constructor(val) {
    if (typeof val === 'number') {
      if (val < 1e12) {
        this.tower = [val]; // Just a number
        this.layer = 0;
      } else {
        // Scientific: store as [exponent]
        this.tower = [Math.log10(val)];
        this.layer = 1;
      }
    } else if (val instanceof TowerNumber) {
      this.tower = [...val.tower];
      this.layer = val.layer;
    } else {
      this.tower = [0];
      this.layer = 0;
    }
  }

  // 10^this
  exp10() {
    let r = new TowerNumber(this);
    if (r.layer === 0 && r.tower[0] < 308) {
      // Can compute directly
      r.tower = [Math.pow(10, r.tower[0])];
      if (r.tower[0] >= 1e12) {
        r.tower = [Math.log10(r.tower[0])];
        r.layer = 1;
      }
    } else {
      // Push a new level
      r.layer++;
    }
    return r;
  }

  // this + other (approximate - take max)
  add(other) {
    other = other instanceof TowerNumber ? other : new TowerNumber(other);
    // Higher layer wins
    if (this.layer > other.layer) return new TowerNumber(this);
    if (other.layer > this.layer) return new TowerNumber(other);
    // Same layer - compare top values
    if (this.tower[0] > other.tower[0]) return new TowerNumber(this);
    return new TowerNumber(other);
  }

  // this * other (add exponents at layer 1+)
  mul(other) {
    other = other instanceof TowerNumber ? other : new TowerNumber(other);
    if (this.layer === 0 && other.layer === 0) {
      return new TowerNumber(this.tower[0] * other.tower[0]);
    }
    // At layer 1+, multiply ≈ add exponents
    // But if layers differ, higher wins
    if (this.layer > other.layer) return new TowerNumber(this);
    if (other.layer > this.layer) return new TowerNumber(other);
    // Same layer
    let r = new TowerNumber(this);
    r.tower[0] += other.tower[0];
    return r;
  }

  format() {
    if (this.layer === 0) return this.tower[0].toLocaleString();
    if (this.layer === 1) return `10^${this.tower[0].toFixed(1)}`;
    return `10↑↑${this.layer} (${this.tower[0].toFixed(1)})`;
  }

  // Compare: return -1, 0, 1
  cmp(other) {
    other = other instanceof TowerNumber ? other : new TowerNumber(other);
    if (this.layer !== other.layer) return this.layer - other.layer;
    return this.tower[0] - other.tower[0];
  }
}

// ================================================================
// APPROACH 2: Arrow notation (k, height)
// {arrows: k, height: n} = 10 ↑^k n
// ================================================================

class ArrowNumber {
  constructor(val) {
    if (typeof val === 'number') {
      if (val < 1e12) {
        this.arrows = 0; // Not even exponentiation yet
        this.height = val;
      } else {
        this.arrows = 1; // 10^height
        this.height = Math.log10(val);
      }
    } else if (val instanceof ArrowNumber) {
      this.arrows = val.arrows;
      this.height = val.height;
    } else {
      this.arrows = 0;
      this.height = 0;
    }
  }

  // 10^this - increases arrow count or height depending on current state
  exp10() {
    let r = new ArrowNumber(this);
    if (r.arrows === 0) {
      // 10^n where n < 1e12
      if (r.height < 308) {
        r.height = Math.pow(10, r.height);
        if (r.height >= 1e12) {
          r.arrows = 1;
          r.height = Math.log10(r.height);
        }
      } else {
        r.arrows = 1;
        // height stays same - now it's 10^height
      }
    } else if (r.arrows === 1) {
      // 10^(10^height) = 10↑↑2 with some height adjustment
      // Actually this is where it gets tricky...
      // 10^(10^h) is a tower of height 2, top value h
      r.arrows = 2;
      // height represents "effective tower height"
      // This is the approximation - we lose the exact structure
    } else {
      // 10^(10↑↑k h) ≈ 10↑↑(k+1) ???
      // This is where the mapping breaks down
      r.arrows++;
    }
    return r;
  }

  // this + other
  add(other) {
    other = other instanceof ArrowNumber ? other : new ArrowNumber(other);
    if (this.arrows > other.arrows) return new ArrowNumber(this);
    if (other.arrows > this.arrows) return new ArrowNumber(other);
    if (this.height > other.height) return new ArrowNumber(this);
    return new ArrowNumber(other);
  }

  // this * other
  mul(other) {
    other = other instanceof ArrowNumber ? other : new ArrowNumber(other);
    if (this.arrows === 0 && other.arrows === 0) {
      return new ArrowNumber(this.height * other.height);
    }
    // Higher arrow wins
    if (this.arrows > other.arrows) return new ArrowNumber(this);
    if (other.arrows > this.arrows) return new ArrowNumber(other);
    // Same arrows - add heights (rough approximation)
    let r = new ArrowNumber(this);
    r.height += other.height;
    return r;
  }

  format() {
    if (this.arrows === 0) return this.height.toLocaleString();
    if (this.arrows === 1) return `10^${this.height.toFixed(1)}`;
    return `10↑^${this.arrows} ${this.height.toFixed(1)}`;
  }

  cmp(other) {
    other = other instanceof ArrowNumber ? other : new ArrowNumber(other);
    if (this.arrows !== other.arrows) return this.arrows - other.arrows;
    return this.height - other.height;
  }
}

// ================================================================
// TEST: Simulate game-like number generation
// ================================================================

console.log("--- Test 1: Basic operations ---\n");

let t1 = new TowerNumber(1000000);
let a1 = new ArrowNumber(1000000);
console.log("1 million:");
console.log("  Tower:", t1.format());
console.log("  Arrow:", a1.format());

let t2 = t1.exp10();
let a2 = a1.exp10();
console.log("\n10^(1 million):");
console.log("  Tower:", t2.format());
console.log("  Arrow:", a2.format());

let t3 = t2.exp10();
let a3 = a2.exp10();
console.log("\n10^10^(1 million):");
console.log("  Tower:", t3.format());
console.log("  Arrow:", a3.format());

console.log("\n--- Test 2: Game-like upgrade chain ---\n");

// More accurate game simulation:
// - upgradeLevel for a button = how many times you've "upgraded" it with magic
// - Each click of the button does 10^upgradeLevel effect
// - Auto-upgrader: each click adds 10^(autoUpgradeLevel) to the button's upgradeLevel
// - Auto-auto: each click adds 10^(autoAutoLevel) to the autoUpgradeLevel

function simulateGameTower(trainUpgrades, autoTrainUpgrades, autoAutoUpgrades) {
  // Start: upgradeLevel for train = trainUpgrades (from magic upgrades)
  // After using auto-train: trainUpgradeLevel increases

  // autoAutoLevel = how powerful auto-auto is
  let autoAutoLevel = autoAutoUpgrades; // simple: each upgrade = +1

  // autoTrainLevel = how powerful auto-train is
  // But it's been boosted by autoAutoLevel worth of auto-auto clicks
  // Each auto-auto click adds 10^autoAutoLevel to autoTrainLevel
  // Assume we clicked auto-auto some number of times...
  // For simplicity: autoTrainLevel = autoTrainUpgrades + 10^autoAutoLevel
  let autoTrainLevel = autoTrainUpgrades;
  if (autoAutoLevel > 0) {
    autoTrainLevel += Math.pow(10, Math.min(autoAutoLevel, 15)); // cap to avoid infinity
  }

  // trainLevel = trainUpgrades + 10^autoTrainLevel (from auto-train clicks)
  let trainLevel = trainUpgrades;
  if (autoTrainLevel > 0) {
    if (autoTrainLevel < 15) {
      trainLevel += Math.pow(10, autoTrainLevel);
    } else {
      // trainLevel is now huge - need TowerNumber
      let t = new TowerNumber(0);
      t.tower = [autoTrainLevel];
      t.layer = 1;
      return t.exp10(); // 10^10^autoTrainLevel
    }
  }

  // Final PPT effect = 10^trainLevel
  if (trainLevel < 308) {
    return new TowerNumber(Math.pow(10, trainLevel));
  }
  let t = new TowerNumber(0);
  t.tower = [trainLevel];
  t.layer = 1;
  return t;
}

function simulateGameArrow(trainUpgrades, autoTrainUpgrades, autoAutoUpgrades) {
  let autoAutoLevel = autoAutoUpgrades;

  let autoTrainLevel = autoTrainUpgrades;
  if (autoAutoLevel > 0) {
    autoTrainLevel += Math.pow(10, Math.min(autoAutoLevel, 15));
  }

  let trainLevel = trainUpgrades;
  if (autoTrainLevel > 0) {
    if (autoTrainLevel < 15) {
      trainLevel += Math.pow(10, autoTrainLevel);
    } else {
      let a = new ArrowNumber(0);
      a.arrows = 2;
      a.height = autoTrainLevel;
      return a;
    }
  }

  if (trainLevel < 308) {
    return new ArrowNumber(Math.pow(10, trainLevel));
  }
  let a = new ArrowNumber(0);
  a.arrows = 1;
  a.height = trainLevel;
  return a;
}

console.log("Scenario: 5 auto-auto clicks, 10 auto clicks, 20 train clicks");
let tResult = simulateGameTower(5, 10, 20);
let aResult = simulateGameArrow(5, 10, 20);
console.log("  Tower result:", tResult.format());
console.log("  Arrow result:", aResult.format());

console.log("\nScenario: 10 auto-auto, 50 auto, 100 train");
tResult = simulateGameTower(10, 50, 100);
aResult = simulateGameArrow(10, 50, 100);
console.log("  Tower result:", tResult.format());
console.log("  Arrow result:", aResult.format());

console.log("\nScenario: 100 auto-auto, 100 auto, 100 train");
tResult = simulateGameTower(100, 100, 100);
aResult = simulateGameArrow(100, 100, 100);
console.log("  Tower result:", tResult.format());
console.log("  Arrow result:", aResult.format());

console.log("\n--- Test 3: Comparison accuracy ---\n");

// Generate several numbers and see if both approaches rank them the same
let scenarios = [
  [1, 1, 1],
  [2, 1, 1],
  [1, 2, 1],
  [1, 1, 2],
  [5, 5, 5],
  [10, 1, 1],
  [1, 10, 1],
  [1, 1, 10],
  [10, 10, 10],
  [20, 20, 20],
];

let towerResults = scenarios.map(s => ({
  scenario: s,
  result: simulateGameTower(...s)
}));

let arrowResults = scenarios.map(s => ({
  scenario: s,
  result: simulateGameArrow(...s)
}));

// Sort by result
towerResults.sort((a, b) => a.result.cmp(b.result));
arrowResults.sort((a, b) => a.result.cmp(b.result));

console.log("Tower ranking (smallest to largest):");
towerResults.forEach((r, i) => {
  console.log(`  ${i+1}. [${r.scenario}] = ${r.result.format()}`);
});

console.log("\nArrow ranking (smallest to largest):");
arrowResults.forEach((r, i) => {
  console.log(`  ${i+1}. [${r.scenario}] = ${r.result.format()}`);
});

// Check if rankings match
let towerOrder = towerResults.map(r => r.scenario.join(','));
let arrowOrder = arrowResults.map(r => r.scenario.join(','));
let match = towerOrder.every((s, i) => s === arrowOrder[i]);
console.log("\nRankings match:", match ? "YES" : "NO - MISMATCH!");

console.log("\n--- Test 4: Where structure matters? ---\n");

// Try to find cases where the "sum of exponentials" structure matters
// 10^(10^50 + 10^40) vs 10^(10^50)
// These should be "almost equal" since 10^50 >> 10^40

console.log("Case: 10^(10^50 + 10^40) vs 10^(10^50)");
console.log("  Mathematically: nearly equal (10^40 is negligible compared to 10^50)");
console.log("  Both approaches would say: equal");
console.log("  This is CORRECT for game purposes - tiny differences don't matter\n");

console.log("Case: 10^(10^50 + 10^50) vs 10^(10^50)");
console.log("  = 10^(2 * 10^50) vs 10^(10^50)");
console.log("  = 10^(10^50.3) vs 10^(10^50)  [since log10(2) ≈ 0.3]");
console.log("  Both approaches: roughly equal (within same arrow tier)");
console.log("  Reality: 10^(10^50.3) is VASTLY larger, but for display both are 10↑↑50ish\n");

console.log("--- Conclusion ---\n");
console.log("KEY INSIGHT: Both approaches collapse to the same representation!");
console.log("  Tower: {layer: k, tower: [h]} ≈ 10↑↑k with height h");
console.log("  Arrow: {arrows: k, height: h} ≈ 10↑↑k with height h");
console.log("");
console.log("They're functionally identical because:");
console.log("  1. We approximate (max instead of sum)");
console.log("  2. We only care about comparison/display");
console.log("  3. We don't need exact arithmetic");
console.log("");
console.log("RECOMMENDATION: Keep current layer approach, just make it cleaner.");
console.log("The 'unified arrow notation' is what we already have, just with");
console.log("different variable names. No fundamental redesign needed.");
console.log("");
console.log("What we DO need:");
console.log("  1. Fix the JS operator bugs (task 22)");
console.log("  2. Make layer promotion automatic and robust");
console.log("  3. Maybe add layer 3 (tower of towers) when needed");
console.log("  4. Better display formatting for high layers");
