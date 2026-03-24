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

// Test very large -> normalized
$n3 = new OrdinalNumber(['arrows' => 1, 'height' => 1e15]);
if (test("1e15 exponent promotes to arrows=2", 2, $n3->arrows)) $passed++; else $failed++;
if (test("height≈15 after promotion", true, abs($n3->height - 15) < 0.01)) $passed++; else $failed++;

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

// exp10 on plain number
$g = new OrdinalNumber(5);
$g10 = $g->exp10();
if (test("10^5 = 100000", true, abs($g10->toFloat() - 100000) < 1)) $passed++; else $failed++;

// exp10 on arrows=1
$h = new OrdinalNumber(['arrows' => 1, 'height' => 100]);
$h10 = $h->exp10();
if (test("10^(10^100) has arrows=2", 2, $h10->arrows)) $passed++; else $failed++;
if (test("height=100 preserved", 100.0, $h10->height)) $passed++; else $failed++;

// exp10 on arrows=2
$i = new OrdinalNumber(['arrows' => 2, 'height' => 5]);
$i10 = $i->exp10();
if (test("10^(10^^5) has arrows=3", 3, $i10->arrows)) $passed++; else $failed++;

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
