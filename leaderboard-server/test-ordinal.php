<?php
/**
 * Test OrdinalNumber PHP implementation against expected JS behavior
 */

require_once __DIR__ . '/src/OrdinalNumber.php';

function test($name, $expected, $actual) {
    $pass = $expected === $actual;
    $status = $pass ? "✓" : "✗";
    echo "$status $name: expected $expected, got $actual\n";
    return $pass;
}

function testCmp($name, $expected, OrdinalNumber $a, $b) {
    $actual = $a->compare($b);
    // Normalize to -1, 0, 1
    $actual = $actual > 0 ? 1 : ($actual < 0 ? -1 : 0);
    return test($name, $expected, $actual);
}

$passed = 0;
$failed = 0;

echo "=== Basic Construction ===\n";

// Test basic numbers
$n1 = new OrdinalNumber(42);
if (test("arrows=0 for small number", 0, $n1->arrows)) $passed++; else $failed++;
if (test("height=42 for 42", 42.0, $n1->height)) $passed++; else $failed++;

// Test large number -> arrows=1
$n2 = new OrdinalNumber(1e15);
if (test("arrows=1 for 1e15", 1, $n2->arrows)) $passed++; else $failed++;
if (test("height≈15 for 1e15", true, abs($n2->height - 15) < 0.01)) $passed++; else $failed++;

// Test very large -> nested (NOT promoted to arrows=2!)
// 10^(1e15) should be {arrows:1, height:{arrows:1, height:15}}, not {arrows:2, height:15}
$n3 = new OrdinalNumber(['arrows' => 1, 'height' => 1e15]);
if (test("1e15 exponent stays at arrows=1", 1, $n3->arrows)) $passed++; else $failed++;
if (test("1e15 exponent has nested height", true, $n3->height instanceof OrdinalNumber)) $passed++; else $failed++;
if (test("nested inner arrows=1", 1, $n3->height->arrows)) $passed++; else $failed++;
if (test("nested inner height≈15", true, abs($n3->height->height - 15) < 0.01)) $passed++; else $failed++;

echo "\n=== Nested Heights ===\n";

// Test nested construction
$nested = new OrdinalNumber([
    'arrows' => 2,
    'height' => ['arrows' => 1, 'height' => 50]
]);
if (test("nested preserves outer arrows", 2, $nested->arrows)) $passed++; else $failed++;
if (test("nested height is OrdinalNumber", true, $nested->height instanceof OrdinalNumber)) $passed++; else $failed++;
if (test("inner arrows=1", 1, $nested->height->arrows)) $passed++; else $failed++;
if (test("inner height=50", 50.0, $nested->height->height)) $passed++; else $failed++;

echo "\n=== Comparison ===\n";

// Same arrows, different heights
$a = new OrdinalNumber(['arrows' => 1, 'height' => 100]);
$b = new OrdinalNumber(['arrows' => 1, 'height' => 50]);
if (testCmp("10^100 > 10^50", 1, $a, $b)) $passed++; else $failed++;

// Different arrows
$c = new OrdinalNumber(['arrows' => 2, 'height' => 5]);
$d = new OrdinalNumber(['arrows' => 1, 'height' => 1000]);
if (testCmp("10^^5 > 10^1000", 1, $c, $d)) $passed++; else $failed++;

// Edge case: 10^^2 = 10^10
$e = new OrdinalNumber(['arrows' => 2, 'height' => 2]);
$f = new OrdinalNumber(['arrows' => 1, 'height' => 10]);
if (testCmp("10^^2 == 10^10", 0, $e, $f)) $passed++; else $failed++;

echo "\n=== exp10() ===\n";

// exp10 on plain number < 308
$g = new OrdinalNumber(5);
$g10 = $g->exp10();
if (test("10^5 = 100000", true, abs($g10->toFloat() - 100000) < 1)) $passed++; else $failed++;

// exp10 on plain number >= 308 (becomes arrows=1)
$g2 = new OrdinalNumber(500);
$g210 = $g2->exp10();
if (test("10^500 has arrows=1", 1, $g210->arrows)) $passed++; else $failed++;
if (test("10^500 height=500", 500.0, $g210->height)) $passed++; else $failed++;

// exp10 on arrows=1: 10^(10^h) should use NESTED height, not increment arrows
// This is the critical bug fix test!
$h = new OrdinalNumber(['arrows' => 1, 'height' => 100]);
$h10 = $h->exp10();
if (test("10^(10^100) has arrows=1 (outer)", 1, $h10->arrows)) $passed++; else $failed++;
if (test("10^(10^100) height is nested OrdinalNumber", true, $h10->height instanceof OrdinalNumber)) $passed++; else $failed++;
if (test("inner has arrows=1", 1, $h10->height->arrows)) $passed++; else $failed++;
if (test("inner height=100", 100.0, $h10->height->height)) $passed++; else $failed++;

// exp10 on arrows=2: same pattern - should nest, not increment
$i = new OrdinalNumber(['arrows' => 2, 'height' => 5]);
$i10 = $i->exp10();
if (test("10^(10^^5) has arrows=1 (outer)", 1, $i10->arrows)) $passed++; else $failed++;
if (test("10^(10^^5) height is nested", true, $i10->height instanceof OrdinalNumber)) $passed++; else $failed++;
if (test("inner has arrows=2", 2, $i10->height->arrows)) $passed++; else $failed++;
if (test("inner height=5", 5.0, $i10->height->height)) $passed++; else $failed++;

echo "\n=== exp10() bug fix: 10^(10^h) ≠ 10↑↑h ===\n";

// The key test: 10^(10^13) should NOT equal 10↑↑13
// 10^(10^13) = 10^10000000000000 ≈ {arrows:1, height:1e13}
// 10↑↑13 = power tower of 13 tens, astronomically larger
$exp_val = new OrdinalNumber(['arrows' => 1, 'height' => 13]);
$factor = $exp_val->exp10();  // Should be 10^(10^13)
$tetration = new OrdinalNumber(['arrows' => 2, 'height' => 13]);  // 10↑↑13

// factor should be MUCH smaller than tetration
if (testCmp("10^(10^13) < 10↑↑13", -1, $factor, $tetration)) $passed++; else $failed++;

// Verify the structure is correct
if (test("exp10 result is nested, not tetration", true,
    $factor->arrows === 1 && $factor->height instanceof OrdinalNumber)) $passed++; else $failed++;

echo "\n=== Arithmetic ===\n";

// Addition
$j = new OrdinalNumber(100);
$k = new OrdinalNumber(50);
$sum = $j->add($k);
if (test("100+50=150", 150.0, $sum->height)) $passed++; else $failed++;

// Addition with arrows=1
$l = new OrdinalNumber(['arrows' => 1, 'height' => 15]);
$m = new OrdinalNumber(['arrows' => 1, 'height' => 10]);
$sum2 = $l->add($m);
if (test("10^15 + 10^10 ≈ 10^15", true, abs($sum2->height - 15) < 0.1)) $passed++; else $failed++;

// Multiplication
$n = new OrdinalNumber(['arrows' => 1, 'height' => 10]);
$o = new OrdinalNumber(['arrows' => 1, 'height' => 5]);
$prod = $n->multiply($o);
if (test("10^10 × 10^5 = 10^15", true, abs($prod->height - 15) < 0.01)) $passed++; else $failed++;

echo "\n=== Summary ===\n";
echo "Passed: $passed\n";
echo "Failed: $failed\n";

exit($failed > 0 ? 1 : 0);
