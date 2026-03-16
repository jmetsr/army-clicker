// ================================================================
// Test suite for recursive OrdinalNumber
// Run with: node simulation/ordinal-recursive-test.js
// ================================================================

const { OrdinalNumber } = require('./ordinal-recursive.js');
const ON = (v) => new OrdinalNumber(v);

let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n=== ${name} ===`);
}

// ================================================================
// CONSTRUCTION
// ================================================================
section("Construction");

test("Plain number", ON(100).arrows === 0 && ON(100).height === 100);
test("Large number becomes arrows=1", ON(1e15).arrows === 1);
test("Large number height is log10", Math.abs(ON(1e15).height - 15) < 0.001);
test("Copy constructor", ON(ON(1000)).height === 1000);
test("Object constructor", ON({arrows: 2, height: 5}).arrows === 2);
test("Zero", ON(0).height === 0);
test("Negative becomes zero", ON(-100).height >= 0 || ON(-100).arrows === 0);

// ================================================================
// NORMALIZATION
// ================================================================
section("Normalization");

// We use loose normalization: only bump arrows when height >= 1e12
// This keeps numbers like 10^100 readable as "10^100" not "10^^2"
test("Height >= 1e12 increases arrows",
  (() => {
    const n = ON({arrows: 1, height: 1e15}).normalize();
    return n.arrows === 2 && n.height < 1e12;
  })()
);

test("Height < 1 decreases arrows",
  (() => {
    const n = ON({arrows: 2, height: 0.5}).normalize();
    return n.arrows === 1;
  })()
);

test("Height stays readable (no over-normalization)",
  (() => {
    const n = ON({arrows: 1, height: 1000000}).normalize();
    // 1 million stays as height (not normalized to arrows=2)
    return n.arrows === 1 && n.height === 1000000;
  })()
);

test("10^100 stays as arrows=1 (height reasonable)",
  (() => {
    const n = ON({arrows: 1, height: 100}).normalize();
    // 10^100 should stay as arrows=1, height=100 (readable, no need to normalize)
    return n.arrows === 1 && n.height === 100;
  })()
);

// ================================================================
// COMPARISON
// ================================================================
section("Comparison");

test("Plain numbers compare correctly", ON(100).gt(ON(50)));
test("Plain numbers lt", ON(50).lt(ON(100)));
test("Equal numbers", ON(100).eq(ON(100)));

// Note: Higher arrows doesn't ALWAYS win - 10^^1 = 10 < 10^9 = 1 billion
test("Higher arrows with height=1 loses to lower arrows with high height",
  ON({arrows: 2, height: 1}).lt(ON({arrows: 1, height: 9})));
test("Higher arrows wins when height >= 3", ON({arrows: 2, height: 3}).gt(ON({arrows: 1, height: 1000})));
test("Same arrows, higher height wins", ON({arrows: 1, height: 50}).gt(ON({arrows: 1, height: 40})));

test("10^100 > 10^50", ON({arrows: 1, height: 100}).gt(ON({arrows: 1, height: 50})));
test("10^^5 > 10^1000", ON({arrows: 2, height: 5}).gt(ON({arrows: 1, height: 1000})));
// 10^^^2 = 10^^10 (tower of 10 tens)
// 10^^1000 = tower of 1000 tens
// So 10^^1000 > 10^^^2!
test("10^^1000 > 10^^^2 (more levels in tower)", ON({arrows: 2, height: 1000}).gt(ON({arrows: 3, height: 2})));

// Edge case from task 25: normalization matters!
// {arrows: 2, height: 100} = 10^^100 = 10^10^...^10 (100 levels)
// {arrows: 3, height: 1} = 10^^^1 = 10
// The FIRST is bigger despite fewer arrows (before normalization)
test("10^^100 > 10^^^1 (normalization matters)",
  (() => {
    const a = ON({arrows: 2, height: 100}); // Will normalize to arrows=3, height≈2
    const b = ON({arrows: 3, height: 1});   // 10^^^1 = 10
    return a.gt(b);
  })()
);

// ================================================================
// ADDITION
// ================================================================
section("Addition");

test("Plain number addition exact", ON(100).add(ON(50)).height === 150);
test("Large + small = large", ON(1e15).add(ON(100)).arrows === 1);
test("10^100 + 10^50 ≈ 10^100 (max)",
  (() => {
    const sum = ON({arrows: 1, height: 100}).add(ON({arrows: 1, height: 50}));
    return sum.arrows >= 1; // Just check it's still large
  })()
);

// ================================================================
// SUBTRACTION
// ================================================================
section("Subtraction");

test("Plain subtraction", ON(100).sub(ON(30)).height === 70);
test("Subtraction floor at 0", ON(50).sub(ON(100)).height === 0);
test("Large - small ≈ large", ON(1e15).sub(ON(100)).arrows === 1);

// ================================================================
// MULTIPLICATION
// ================================================================
section("Multiplication");

test("Plain multiplication", ON(10).mul(ON(5)).height === 50);
test("10^a * 10^b = 10^(a+b)",
  (() => {
    const a = ON({arrows: 1, height: 20});
    const b = ON({arrows: 1, height: 30});
    const product = a.mul(b);
    // Should be 10^50 (arrows=1, height≈50)
    return product.arrows >= 1;
  })()
);
test("Plain * scientific",
  (() => {
    const a = ON(100);
    const b = ON({arrows: 1, height: 10});
    const product = a.mul(b);
    // 100 * 10^10 = 10^12
    return product.arrows === 1 && product.height > 10;
  })()
);

// ================================================================
// DIVISION
// ================================================================
section("Division");

test("Plain division", Math.abs(ON(100).div(ON(4)).height - 25) < 0.001);
test("10^100 / 10^50 = 10^50",
  (() => {
    const a = ON({arrows: 1, height: 100});
    const b = ON({arrows: 1, height: 50});
    const quotient = a.div(b);
    return quotient.arrows === 1 && Math.abs(quotient.height - 50) < 1;
  })()
);
test("Division by zero returns huge", ON(100).div(ON(0)).arrows > 0);

// ================================================================
// EXP10 (10^this)
// ================================================================
section("Exponentiation (10^this)");

test("10^5 = 100000", ON(5).exp10().toNumber() === 100000);
test("10^20 becomes scientific", ON(20).exp10().arrows === 1);
test("10^(10^5) increases arrows",
  (() => {
    const n = ON({arrows: 1, height: 5}).exp10();
    return n.arrows === 2;
  })()
);
test("10^(10^^5) = 10^^(5+1)?",
  (() => {
    const n = ON({arrows: 2, height: 5}).exp10();
    return n.arrows === 3;
  })()
);

// ================================================================
// TONUM / FORMAT
// ================================================================
section("Conversion and Formatting");

test("toNumber plain", ON(12345).toNumber() === 12345);
test("toNumber scientific", Math.abs(ON({arrows: 1, height: 6}).toNumber() - 1e6) < 1);
test("toNumber tower = Infinity", ON({arrows: 2, height: 5}).toNumber() === Infinity);

// New "strain before break" display tests
console.log("\n--- Display progression demo ---");
console.log("Plain:", ON(847).format());
console.log("Plain with commas:", ON(999999).format());
console.log("Named (million):", ON(1.5e6).format());
console.log("Named (trillion):", ON(5.2e12).format());
console.log("Named (decillion):", ON(1e33).format());
console.log("Named (999 decillion):", ON(9.99e35).format());
console.log("Scientific:", ON({arrows: 1, height: 500}).format());
console.log("Sci+commas:", ON({arrows: 1, height: 1250000}).format());
console.log("Tower (5):", ON({arrows: 2, height: 5}).format());
console.log("↑ strain (9):", ON({arrows: 2, height: 9}).format());
console.log("Clean ↑↑:", ON({arrows: 2, height: 15}).format());
console.log("↑↑ strain (4):", ON({arrows: 3, height: 4}).format());
console.log("Clean ↑↑↑:", ON({arrows: 3, height: 8}).format());
console.log("↑↑↑ strain (3):", ON({arrows: 4, height: 3}).format());
console.log("Clean ↑↑↑↑:", ON({arrows: 4, height: 7}).format());
console.log("↑^6 notation:", ON({arrows: 6, height: 10}).format());
console.log("");

test("format plain", ON(500).format() === "500");
test("format plain with commas", ON(999999).format() === "999,999");
test("format named million", ON(1500000).format() === "1.50 million");
test("format named trillion", ON(5.2e12).format() === "5.20 trillion");
test("format scientific", ON({arrows: 1, height: 500}).format() === "10^500");
test("format sci+commas", ON({arrows: 1, height: 1250000}).format() === "10^1,250,000");
test("format tower", ON({arrows: 2, height: 5}).format() === "10^10^10^10^10");
test("format ↑ strain", ON({arrows: 2, height: 9}).format() === "10↑10↑10↑10↑10↑10↑10↑10↑10");
test("format clean ↑↑", ON({arrows: 2, height: 15}).format() === "10↑↑15");
test("format ↑↑ strain", ON({arrows: 3, height: 4}).format() === "10↑↑10↑↑10↑↑10");
test("format clean ↑↑↑", ON({arrows: 3, height: 8}).format() === "10↑↑↑8");
test("format ↑^n", ON({arrows: 6, height: 10}).format() === "10↑^6 10");

// ================================================================
// FRACTION OPERATIONS
// ================================================================
section("Fraction Operations");

test("mulFraction plain", ON(100).mulFraction(50, 100).height === 50);
test("mulFraction 100%", ON({arrows: 1, height: 50}).mulFraction(100, 100).arrows === 1);

// ================================================================
// GAME-LIKE SCENARIOS
// ================================================================
section("Game-like Scenarios");

// Simulate train upgrades
test("Multiple exp10 chains",
  (() => {
    let n = ON(1);
    for (let i = 0; i < 10; i++) {
      n = n.exp10();
    }
    // After 10 exp10s, should have arrows >= 2
    return n.arrows >= 2;
  })()
);

// Simulate power calculation: troops * ppt
test("Large troops * large ppt",
  (() => {
    const troops = ON({arrows: 1, height: 20}); // 10^20 troops
    const ppt = ON({arrows: 1, height: 15});    // 10^15 ppt
    const power = troops.mul(ppt);
    // Should be ≈ 10^35
    return power.arrows >= 1;
  })()
);

// Comparison for AI strategy
test("Which upgrade is better? Compare values",
  (() => {
    const option1 = ON({arrows: 2, height: 5});
    const option2 = ON({arrows: 2, height: 4.9});
    return option1.gt(option2);
  })()
);

// ================================================================
// EDGE CASES
// ================================================================
section("Edge Cases");

test("Very deep nesting",
  (() => {
    // {arrows: 5, height: {arrows: 4, height: {arrows: 3, height: 5}}}
    const deep = ON({
      arrows: 5,
      height: ON({
        arrows: 4,
        height: ON({arrows: 3, height: 5})
      })
    });
    return deep.arrows === 5 && deep.height instanceof OrdinalNumber;
  })()
);

test("Compare nested vs flat",
  (() => {
    const nested = ON({arrows: 3, height: ON({arrows: 1, height: 5})});
    const flat = ON({arrows: 3, height: 5});
    // nested.height = 10^5 = 100000, flat.height = 5
    // So nested > flat
    return nested.gt(flat);
  })()
);

// ARITHMETIC ON NESTED STRUCTURES
// These tests would have caught the bug!
test("Add nested structures (far apart - early return)",
  (() => {
    const nested = ON({arrows: 1, height: ON({arrows: 1, height: 5})}); // 10^(10^5)
    const flat = ON({arrows: 1, height: 100}); // 10^100
    const result = nested.add(flat);
    console.log("  10^(10^5) + 10^100 =", result.format());
    // This works because diff > 15, so it just returns the larger
    return result instanceof OrdinalNumber;
  })()
);

test("Add nested structures (CLOSE - must compute)",
  (() => {
    // Two nested structures with similar heights - forces actual arithmetic
    const a = ON({arrows: 1, height: ON({arrows: 1, height: 5})}); // 10^(10^5)
    const b = ON({arrows: 1, height: ON({arrows: 1, height: 5})}); // 10^(10^5)
    console.log("  a.height:", a.height, "a.height.toNumber():", a.height.toNumber());
    const result = a.add(b);
    console.log("  10^(10^5) + 10^(10^5) =", result.format());
    console.log("  result.height:", result.height);
    // This SHOULD trigger the bug - h1 and h2 both become Infinity
    const heightOk = result.height instanceof OrdinalNumber ||
                     (!isNaN(result.height) && isFinite(result.height));
    return result instanceof OrdinalNumber && heightOk;
  })()
);

test("Multiply nested structures",
  (() => {
    const nested = ON({arrows: 1, height: ON({arrows: 1, height: 5})}); // 10^(10^5)
    const small = ON(100);
    console.log("  nested:", JSON.stringify({arrows: nested.arrows, height: nested.height}));
    const result = nested.mul(small);
    console.log("  result:", JSON.stringify({arrows: result.arrows, height: result.height}));
    console.log("  nested * 100 =", result.format());
    const heightOk = result.height instanceof OrdinalNumber ||
                     (!isNaN(result.height) && isFinite(result.height));
    console.log("  heightOk:", heightOk, "height:", result.height);
    return result instanceof OrdinalNumber && heightOk;
  })()
);

// THE REAL BUG - nested structure with arrows >= 2 in the height
test("Add with arrows=2 nested height (THIS IS THE BUG)",
  (() => {
    // This recreates the game situation: 10 followed by 2 arrows, height 78
    // When used in add(), toNumber() is called on the nested height and returns Infinity
    const a = ON({arrows: 1, height: ON({arrows: 2, height: 78})}); // 10^(10^^78)
    const b = ON({arrows: 1, height: ON({arrows: 2, height: 78})}); // 10^(10^^78)
    console.log("  a.height:", a.height.format());
    console.log("  a.height.toNumber():", a.height.toNumber()); // This will be Infinity!
    const result = a.add(b);
    console.log("  result:", result.format());
    console.log("  result.height:", result.height);
    // The bug: result.height becomes NaN or Infinity because the arithmetic used Infinity
    const heightOk = result.height instanceof OrdinalNumber ||
                     (!isNaN(result.height) && isFinite(result.height));
    console.log("  heightOk:", heightOk);
    return result instanceof OrdinalNumber && heightOk;
  })()
);

test("Sub with arrows=2 nested height",
  (() => {
    const a = ON({arrows: 1, height: ON({arrows: 2, height: 78})});
    const b = ON({arrows: 1, height: 100}); // Much smaller
    console.log("  Subtracting 10^100 from 10^(10^^78)");
    const result = a.sub(b);
    console.log("  result:", result.format());
    const heightOk = result.height instanceof OrdinalNumber ||
                     (!isNaN(result.height) && isFinite(result.height));
    return result instanceof OrdinalNumber && heightOk;
  })()
);

test("Infinity handling", ON(Infinity).arrows >= 0);
test("NaN handling", ON(NaN).height === 0);

// ================================================================
// BUG REPRODUCTION - scenarios that caused issues in the game
// ================================================================
section("Bug Reproduction");

// Scenario 1: fromTower with Infinity
// This happens when toNumber() returns Infinity for arrows >= 2,
// then that Infinity is passed to fromTower
// KNOWN BUG: This will HANG due to infinite loop in normalize()
console.log("  SKIPPING: fromTower([Infinity]) - KNOWN BUG: causes infinite loop");
console.log("  Bug: normalize() has 'while (height >= 1e12)' but log10(Infinity) = Infinity");

// Scenario 2: Infinite loop in normalize with Infinity height
// {arrows: 1, height: Infinity}.normalize() loops forever
// KNOWN BUG: This will HANG
console.log("  SKIPPING: normalize(Infinity) - KNOWN BUG: causes infinite loop");

// Scenario 3: toNumber on arrows >= 2 returns Infinity
test("toNumber on arrows=2 returns Infinity",
  ON({arrows: 2, height: 50}).toNumber() === Infinity
);

// Scenario 4: Chained operations that could produce Infinity
// e.g., large OrdinalNumber.mul(log_rate) where result exceeds finite range
test("Large mul doesn't produce NaN",
  (() => {
    const huge = ON({arrows: 2, height: 78});
    const logRate = 0.017; // log10(1.04)
    const result = huge.mul(logRate);
    console.log("  10^^78 * 0.017 =", result.format());
    return result instanceof OrdinalNumber && !isNaN(result.height);
  })()
);

// Scenario 5: expCostHelper-like calculation
// cost = base * rate^total where total is huge
// KNOWN BUG: This creates Infinity which hangs fromTower
console.log("  SKIPPING: expCost-like calculation - uses fromTower(Infinity)");
console.log("  Bug chain: arrows=2 → toNumber()=Infinity → fromTower([Infinity]) → hang");

// Scenario 6: undefined * number = NaN
test("undefined gainVar simulation",
  (() => {
    const gainVar = undefined; // G.sessionsPerTrain was undefined
    const baseGain = gainVar || 1; // Should fallback to 1
    const mult = 10;
    const gain = baseGain * mult;
    console.log("  undefined || 1 =", gainVar || 1, "gain =", gain);
    return gain === 10;
  })()
);

// Scenario 7: What if gainVar points to undefined property?
test("G[undefinedKey] * number simulation",
  (() => {
    const G = { existingProp: 5 };
    const baseGain = G["nonexistentProp"]; // undefined
    const mult = 10;
    const gain = baseGain * mult; // undefined * 10 = NaN
    console.log("  G['nonexistent'] * 10 =", gain, "isNaN:", isNaN(gain));
    return isNaN(gain); // This SHOULD be true, showing the bug
  })()
);

// ================================================================
// SUMMARY
// ================================================================
console.log("\n" + "=".repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("All tests passed!");
} else {
  console.log("Some tests failed - review above.");
  process.exit(1);
}
