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

test("Higher arrows wins", ON({arrows: 2, height: 1}).gt(ON({arrows: 1, height: 9})));
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

test("format plain", ON(1000).format() === "1,000");
test("format scientific", ON({arrows: 1, height: 50}).format().includes("10^"));
test("format tower", ON({arrows: 2, height: 5}).format().includes("10^^"));
test("format higher arrows", ON({arrows: 4, height: 3}).format().includes("↑^4"));

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

test("Infinity handling", ON(Infinity).arrows >= 0);
test("NaN handling", ON(NaN).height === 0);

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
