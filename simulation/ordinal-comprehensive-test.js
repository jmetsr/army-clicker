// ================================================================
// Comprehensive OrdinalNumber Test Suite
// Goal: Discover bugs through broad coverage, not just verify known issues
// Also tests: accuracy vs speed tradeoff
// ================================================================

const { OrdinalNumber } = require('./ordinal-recursive.js');
const ON = (v) => new OrdinalNumber(v);

let passed = 0;
let failed = 0;
let warnings = 0;

function test(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    failed++;
  }
}

function warn(name, message) {
  console.log(`  ⚠ ${name}: ${message}`);
  warnings++;
}

function section(name) {
  console.log(`\n=== ${name} ===`);
}

// Helper: check result is valid (not NaN, not broken)
function isValid(n) {
  if (!(n instanceof OrdinalNumber)) return false;
  if (typeof n.arrows !== 'number' || isNaN(n.arrows)) return false;
  if (n.height instanceof OrdinalNumber) {
    return isValid(n.height);
  }
  if (typeof n.height !== 'number' || isNaN(n.height)) return false;
  return true;
}

// Helper: check operation completes quickly (< 10ms)
function timedOp(name, fn) {
  const start = Date.now();
  let result;
  try {
    result = fn();
  } catch (e) {
    console.log(`  ✗ ${name} - THREW: ${e.message}`);
    failed++;
    return null;
  }
  const elapsed = Date.now() - start;

  if (elapsed > 100) {
    console.log(`  ✗ ${name} - TOO SLOW: ${elapsed}ms`);
    failed++;
    return null;
  } else if (elapsed > 10) {
    warn(name, `slow: ${elapsed}ms`);
  }

  if (!isValid(result)) {
    console.log(`  ✗ ${name} - INVALID RESULT: ${JSON.stringify(result)}`);
    failed++;
    return null;
  }

  return result;
}

// ================================================================
// Generate test numbers at various scales
// ================================================================

const testNumbers = {
  // Layer 0: plain numbers
  zero: ON(0),
  small: ON(100),
  medium: ON(1e6),
  large: ON(1e11),

  // Layer 1 (arrows=1): scientific notation range
  sci_small: ON({arrows: 1, height: 10}),      // 10^10
  sci_medium: ON({arrows: 1, height: 100}),    // 10^100
  sci_large: ON({arrows: 1, height: 1000}),    // 10^1000
  sci_huge: ON({arrows: 1, height: 1e6}),      // 10^(million)
  sci_extreme: ON({arrows: 1, height: 1e11}),  // 10^(100 billion) - near promotion threshold

  // Layer 2 (arrows=2): tetration range
  tet_small: ON({arrows: 2, height: 3}),       // 10^^3 = 10^10^10
  tet_medium: ON({arrows: 2, height: 10}),     // 10^^10
  tet_large: ON({arrows: 2, height: 100}),     // 10^^100
  tet_huge: ON({arrows: 2, height: 1e6}),      // 10^^(million)

  // Layer 3 (arrows=3): pentation
  pent_small: ON({arrows: 3, height: 3}),
  pent_medium: ON({arrows: 3, height: 10}),

  // Higher layers
  hex_small: ON({arrows: 4, height: 3}),
  arrow5: ON({arrows: 5, height: 5}),
  arrow10: ON({arrows: 10, height: 5}),

  // Nested heights (the tricky cases!)
  nested_1_in_1: ON({arrows: 1, height: ON({arrows: 1, height: 5})}),      // 10^(10^5)
  nested_2_in_1: ON({arrows: 1, height: ON({arrows: 2, height: 5})}),      // 10^(10^^5)
  nested_1_in_2: ON({arrows: 2, height: ON({arrows: 1, height: 5})}),      // 10^^(10^5)
  nested_2_in_2: ON({arrows: 2, height: ON({arrows: 2, height: 5})}),      // 10^^(10^^5)
  nested_deep: ON({arrows: 1, height: ON({arrows: 1, height: ON({arrows: 1, height: 5})})}),

  // Edge cases: small arrows but huge height (might beat higher arrows!)
  sci_giant_height: ON({arrows: 1, height: 1e15}),  // Should promote to arrows=2
  tet_giant_height: ON({arrows: 2, height: 1e15}),  // Should promote to arrows=3
};

// ================================================================
// TEST: All operations on all pairs (same nesting level)
// ================================================================
section("Operations on Same Nesting Level");

const sameLevel = [
  ['small', 'medium'],
  ['sci_small', 'sci_medium'],
  ['sci_medium', 'sci_large'],
  ['tet_small', 'tet_medium'],
  ['tet_medium', 'tet_large'],
  ['pent_small', 'pent_medium'],
];

for (const [aName, bName] of sameLevel) {
  const a = testNumbers[aName];
  const b = testNumbers[bName];

  timedOp(`${aName} + ${bName}`, () => a.add(b));
  timedOp(`${aName} - ${bName}`, () => a.sub(b));
  timedOp(`${bName} - ${aName}`, () => b.sub(a));
  timedOp(`${aName} * ${bName}`, () => a.mul(b));
  timedOp(`${aName} / ${bName}`, () => a.div(b));
}

// ================================================================
// TEST: Operations across 1 layer difference
// ================================================================
section("Operations Across 1 Layer Difference");

const oneLayerDiff = [
  ['large', 'sci_small'],           // arrows 0 vs 1
  ['sci_large', 'tet_small'],       // arrows 1 vs 2
  ['tet_large', 'pent_small'],      // arrows 2 vs 3
  ['pent_medium', 'hex_small'],     // arrows 3 vs 4
];

for (const [aName, bName] of oneLayerDiff) {
  const a = testNumbers[aName];
  const b = testNumbers[bName];

  timedOp(`${aName} + ${bName}`, () => a.add(b));
  timedOp(`${bName} + ${aName}`, () => b.add(a));
  timedOp(`${aName} * ${bName}`, () => a.mul(b));
  timedOp(`${bName} / ${aName}`, () => b.div(a));
}

// ================================================================
// TEST: Operations across 2+ layer difference
// ================================================================
section("Operations Across 2+ Layer Difference");

const multiLayerDiff = [
  ['small', 'tet_small'],           // arrows 0 vs 2
  ['sci_small', 'pent_small'],      // arrows 1 vs 3
  ['small', 'arrow5'],              // arrows 0 vs 5
  ['sci_small', 'arrow10'],         // arrows 1 vs 10
];

for (const [aName, bName] of multiLayerDiff) {
  const a = testNumbers[aName];
  const b = testNumbers[bName];

  timedOp(`${aName} + ${bName}`, () => a.add(b));
  timedOp(`${bName} - ${aName}`, () => b.sub(a));
  timedOp(`${aName} * ${bName}`, () => a.mul(b));
}

// ================================================================
// TEST: Edge case - smaller arrows wins due to huge height
// ================================================================
section("Smaller Arrows Can Win (Height Dominates)");

// 10^^1000 vs 10^^^2
// 10^^1000 = tower of 1000 tens
// 10^^^2 = 10^^10 = tower of 10 tens
// So 10^^1000 > 10^^^2 !
const tet1000 = ON({arrows: 2, height: 1000});
const pent2 = ON({arrows: 3, height: 2});

test("10^^1000 > 10^^^2 (height beats arrows)", tet1000.gt(pent2));
test("10^^^2 < 10^^1000", pent2.lt(tet1000));

const result1 = timedOp("10^^1000 + 10^^^2", () => tet1000.add(pent2));
if (result1) {
  test("sum should be closer to 10^^1000", result1.arrows === 2 && result1.height >= 999);
}

// Even more extreme: 10^(10^100) vs 10^^3
// 10^(10^100) is a tower of 2 with the top being 10^100
// 10^^3 = 10^10^10 is a tower of 3 with the top being 10
// Which is bigger? 10^(10^100) >> 10^10^10 because 10^100 >> 10
const sci_nested = ON({arrows: 1, height: ON({arrows: 1, height: 100})}); // 10^(10^100)
const tet3 = ON({arrows: 2, height: 3}); // 10^^3 = 10^10^10

console.log(`  10^(10^100) formatted: ${sci_nested.format()}`);
console.log(`  10^^3 formatted: ${tet3.format()}`);

// 10^(10^100) has an exponent of 10^100
// 10^^3 = 10^(10^10) has an exponent of 10^10
// So 10^(10^100) > 10^^3
test("10^(10^100) > 10^^3 (nested height wins)", sci_nested.gt(tet3));

// ================================================================
// TEST: Nested structure operations
// ================================================================
section("Nested Structure Operations");

const nestedPairs = [
  ['nested_1_in_1', 'nested_1_in_1'],  // same nested
  ['nested_1_in_1', 'sci_large'],       // nested vs flat
  ['nested_2_in_1', 'tet_medium'],      // deeper nested vs flat
  ['nested_1_in_2', 'nested_2_in_1'],   // different nesting patterns
  ['nested_deep', 'nested_1_in_1'],     // 3 levels vs 2 levels
];

for (const [aName, bName] of nestedPairs) {
  const a = testNumbers[aName];
  const b = testNumbers[bName];

  console.log(`\n  Testing ${aName} vs ${bName}:`);
  console.log(`    ${aName}: ${a.format()}`);
  console.log(`    ${bName}: ${b.format()}`);

  timedOp(`${aName} + ${bName}`, () => a.add(b));
  timedOp(`${aName} - ${bName}`, () => a.sub(b));
  timedOp(`${aName} * ${bName}`, () => a.mul(b));
  timedOp(`${aName} / ${bName}`, () => a.div(b));
  timedOp(`${aName}.cmp(${bName})`, () => { a.cmp(b); return a; });
}

// ================================================================
// TEST: Promotion thresholds
// ================================================================
section("Promotion Thresholds");

// When height >= 1e12, should promote to next arrow level
const nearPromotion = ON({arrows: 1, height: 1e11});
const atPromotion = ON({arrows: 1, height: 1e12});
const pastPromotion = ON({arrows: 1, height: 1e15});

console.log(`  Near promotion (1e11): ${nearPromotion.normalize().format()} arrows=${nearPromotion.arrows}`);
console.log(`  At promotion (1e12): ${atPromotion.normalize().format()} arrows=${atPromotion.normalize().arrows}`);
console.log(`  Past promotion (1e15): ${pastPromotion.normalize().format()} arrows=${pastPromotion.normalize().arrows}`);

test("1e11 height stays at arrows=1", nearPromotion.normalize().arrows === 1);
test("1e12 height promotes to arrows=2", atPromotion.normalize().arrows === 2);
test("1e15 height promotes to arrows=2", pastPromotion.normalize().arrows === 2);

// ================================================================
// TEST: Chained operations (game-like scenarios)
// ================================================================
section("Chained Operations (Game Scenarios)");

// Simulate: start small, repeatedly multiply by 1.04
let cost = ON(100);
for (let i = 0; i < 1000; i++) {
  cost = timedOp(`chain mul ${i}`, () => cost.mul(1.04));
  if (!cost) break;
}
if (cost) {
  console.log(`  After 1000 multiplies by 1.04: ${cost.format()}`);
  test("Chained multiply produces valid result", isValid(cost));
}

// Simulate: start small, repeatedly call exp10
let power = ON(2);
for (let i = 0; i < 20; i++) {
  power = timedOp(`chain exp10 ${i}`, () => power.exp10());
  if (!power) break;
}
if (power) {
  console.log(`  After 20 exp10 calls: ${power.format()}`);
  test("Chained exp10 produces valid result", isValid(power));
  test("Should have many arrows", power.arrows >= 5);
}

// ================================================================
// TEST: Format doesn't crash on any input
// ================================================================
section("Format Robustness");

for (const [name, num] of Object.entries(testNumbers)) {
  const result = timedOp(`format ${name}`, () => { num.format(); return num; });
  if (result) {
    const formatted = num.format();
    test(`format ${name} is string`, typeof formatted === 'string' && formatted.length > 0);
  }
}

// ================================================================
// TEST: Comparison transitivity (if a > b and b > c, then a > c)
// ================================================================
section("Comparison Transitivity");

// Note: sci_small = 10^10 = 1e10, large = 1e11, so correct order is:
// small < medium < sci_small < large < sci_medium < sci_large < tet_small < tet_medium
const ordered = [
  testNumbers.small,        // 100
  testNumbers.medium,       // 1e6
  testNumbers.sci_small,    // 10^10 = 1e10 (10 billion)
  testNumbers.large,        // 1e11 (100 billion)
  testNumbers.sci_medium,   // 10^100
  testNumbers.sci_large,    // 10^1000
  testNumbers.tet_small,    // 10^^3
  testNumbers.tet_medium,   // 10^^10
];

for (let i = 0; i < ordered.length - 2; i++) {
  const a = ordered[i];
  const b = ordered[i + 1];
  const c = ordered[i + 2];

  const aGtB = a.lt(b);
  const bGtC = b.lt(c);
  const aGtC = a.lt(c);

  test(`transitivity ${i}: a<b=${aGtB}, b<c=${bGtC}, a<c=${aGtC}`,
    aGtB && bGtC && aGtC);
}

// ================================================================
// TEST: Commutativity (a + b = b + a, a * b = b * a)
// ================================================================
section("Commutativity");

const commPairs = [
  ['small', 'medium'],
  ['sci_small', 'sci_large'],
  ['tet_small', 'sci_large'],
  ['nested_1_in_1', 'sci_medium'],
];

for (const [aName, bName] of commPairs) {
  const a = testNumbers[aName];
  const b = testNumbers[bName];

  const sumAB = a.add(b);
  const sumBA = b.add(a);
  const prodAB = a.mul(b);
  const prodBA = b.mul(a);

  // Check they're approximately equal (cmp = 0)
  test(`${aName}+${bName} = ${bName}+${aName}`, sumAB.cmp(sumBA) === 0);
  test(`${aName}*${bName} = ${bName}*${aName}`, prodAB.cmp(prodBA) === 0);
}

// ================================================================
// SUMMARY
// ================================================================
console.log("\n" + "=".repeat(50));
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings`);
if (failed === 0 && warnings === 0) {
  console.log("All tests passed with no warnings!");
} else if (failed === 0) {
  console.log("All tests passed but there were performance warnings.");
} else {
  console.log("Some tests failed - review above.");
  process.exit(1);
}
