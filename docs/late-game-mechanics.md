# Late Game Mechanics - Technical Reference

This document details the late game mechanics for validation purposes.
Reference when implementing or debugging late game validation (task 07i).

## Auto-Upgrader System

### Core Mechanics

1. **Installing an Auto-Upgrader** (10 magic each):
   - Requires 3+ upgrades on the target button
   - Creates `G.autoUpgraders[buttonId] = true`
   - Can chain: auto_recruit -> auto_auto_recruit -> auto_auto_auto_recruit, etc.

2. **Using an Auto-Upgrader** (costs 1 Googol = 10^100):
   - Clicking the auto-upgrade button adds levels to the target
   - The number of levels added = `getUpgradeMult(autoButtonId)`

3. **getUpgradeMult(id) Function** (util.js:135-143):
   ```javascript
   function getUpgradeMult(id) {
     var level = G.upgradeLevels[id] || 0;
     if (level instanceof OrdinalNumber) {
       return level.exp10();  // 10^level where level is tower notation
     }
     if (level > 300) return OrdinalNumber.fromSci(1, level);  // 10^level as OrdinalNumber
     return Math.pow(10, level);  // Plain number 10^level
   }
   ```

### Cascade Example

Starting with recruit at level 10:
- Click auto_recruit: recruit += 10^(auto_recruit_level), say auto_recruit_level = 5
  - recruit becomes 10 + 10^5 = 100,010
- Click auto_auto_recruit: auto_recruit += 10^(auto_auto_recruit_level), say = 3
  - auto_recruit becomes 5 + 10^3 = 1,005
- Now clicking auto_recruit: recruit += 10^1005
  - recruit becomes OrdinalNumber since 10^1005 > 300 threshold

### Tower Growth Formula

With N auto-upgrader tiers, each clicked M times:
```
f(N) = M           (manual clicks at top tier)
f(N-1) = 10^M      (first tier adds 10^M levels)
f(N-2) = 10^(10^M) (second tier cascades)
...
f(0) = 10↑↑N       (tetration tower of height N)
```

**Key insight**: More tiers = taller tower (arrows=2 with larger height).
To get arrows=3, tower height must exceed 10^12, requiring ~10^12 tiers.

## OrdinalNumber System

### Representation
```javascript
{
  arrows: Number,    // 0=plain, 1=scientific, 2=tetration, k=k-ation
  height: Number|OrdinalNumber  // Can be nested!
}
```

### Interpretation
- `{arrows: 0, height: 42}` = 42
- `{arrows: 1, height: 15}` = 10^15
- `{arrows: 2, height: 5}` = 10↑↑5 = 10^10^10^10^10
- `{arrows: 3, height: 3}` = 10↑↑↑3 = 10↑↑(10↑↑(10))

### Normalization (ordinal.js:68-118)

**Purpose**: Keep height in manageable range by trading with arrows.

**Rules**:
1. If `arrows=0` and `height >= 1e12`: promote to `arrows=1`, `height=log10(height)`
2. If `arrows>0` and `height >= 1e12`: promote to `arrows+1`, `height=log10(height)`
3. If `height < 1` and `arrows > 0`: demote arrows, `height=10^height`
4. Guard against Infinity/NaN: cap at `{arrows: 100, height: 1e11}`

### JS vs PHP Differences - CRITICAL

| Feature | JS (ordinal.js) | PHP (OrdinalNumber.php) |
|---------|-----------------|-------------------------|
| Nested heights | **Supported**: height can be OrdinalNumber | **Flattened**: adds inner arrows to outer |
| Lines of code | 962 | 401 |
| _flatten() | Complex recursive flattening for comparison | Not implemented |
| exp10() | `arrows += 1; normalize()` | Not implemented |
| Comparison | Handles nested heights recursively | Simple arrows/height comparison |

### Nested Height Example

JS can represent: `{arrows: 2, height: {arrows: 1, height: 50}}`
- Meaning: 10↑↑(10^50)
- The height of the tetration is itself 10^50

PHP flattens this to: `{arrows: 3, height: 50}` (approximate)

### exp10() Method (ordinal.js:561-580)

```javascript
exp10() {
  const result = new OrdinalNumber(this);

  if (result.arrows === 0) {
    // 10^n where n is plain
    if (result.height < 308) {
      return new OrdinalNumber(Math.pow(10, result.height));
    } else {
      return new OrdinalNumber({arrows: 1, height: result.height}).normalize();
    }
  }

  // 10^(10↑^k h) = 10↑^(k+1) with height adjustment
  result.arrows += 1;
  return result.normalize();
}
```

**This is the key operation for auto-upgraders** - adding levels means calling exp10() on the auto-upgrader's level.

## Arithmetic Approximations

### Addition (ordinal.js:308-393)

- **Both arrows=0**: Exact addition
- **Both arrows=1**: `10^a + 10^b = 10^max(a,b) * (1 + 10^(min-max))`
  - If |a-b| > 15, smaller is negligible
- **Higher arrows**: Larger dominates completely

### Multiplication (ordinal.js:482-523)

- **Both arrows=0**: Exact multiplication
- **Both arrows=1**: `10^a * 10^b = 10^(a+b)` - add exponents
- **Higher arrows**: Larger dominates

### Division (ordinal.js:529-555)

- **Both arrows=1**: `10^a / 10^b = 10^(a-b)` - subtract exponents
- **Higher arrows**: If `this >> other`, result ≈ this

**Key insight**: All arithmetic is approximate for arrows >= 2. The game doesn't compute exact values; it estimates.

## Late Game Growth Rates

### How Coins Grow

1. **Early game**: Coins = power × 4 per day (passive loot)
2. **Middle game with dragons**: Dragon income adds multiplicatively
3. **Late game with auto-upgraders**:
   - Each auto-upgrade click boosts loot multiplier exponentially
   - With tier-5 auto-upgraders, each click can add 10^(10^(10^...)) to loot level
   - Income goes from 10^40 to 10^4000 in seconds

### Why "Sanity Checks" Are Hard

Consider: Player has 10 auto-upgrader tiers on loot.
- Each click of tier-10 cascades down through all tiers
- Loot level can jump from {arrows:1, height:100} to {arrows:2, height:15} in one click
- This means arrow jumps of 1+ are NORMAL in late game

Current sanity check (LateGameValidator.php:266-268):
```php
// More than 2 arrow jumps in < 100 days is suspicious
if ($arrowDiff > 2 && $dayDiff < 100) {
    $flags[] = "Day $day: Suspicious arrow jump (+$arrowDiff arrows in $dayDiff days)";
}
```

**Problem**: With enough auto-upgrader tiers, you CAN legitimately jump 2+ arrows per day. The check needs to account for auto-upgrader count.

## Validation Feasibility Analysis

### Can PHP Match JS Exactly?

**Short answer: NO, not with current PHP implementation.**

**Reasons**:

1. **Nested OrdinalNumber heights not supported**
   - JS: `{arrows:2, height:{arrows:1, height:50}}`
   - PHP flattens this, losing precision
   - Fix: Implement recursive height in PHP (major rewrite)

2. **exp10() not implemented**
   - Critical for auto-upgrader level calculations
   - Fix: Add method to PHP OrdinalNumber

3. **Comparison logic differs**
   - JS has complex `_flatten()` for nested comparison
   - PHP does simple arrows/height comparison
   - Results can differ for edge cases

4. **Arithmetic approximations differ**
   - Even with same logic, floating-point differences accumulate
   - After millions of operations, results diverge

### Recommended Approach

**Do NOT attempt full late-game replay.** Instead:

1. **Trust early/middle validation**: Cheaters caught there won't reach late game
2. **Sanity check auto-upgrader count vs magic**: Can't have 50 auto-upgraders without 500 magic
3. **Check auto-upgrader tier plausibility**: If tier-10 exists, tiers 1-9 must also exist
4. **Allow generous arrow jumps**: With N auto-upgrader tiers, up to N arrow jumps per click is plausible
5. **Flag impossible sequences**: Ruby unlocked before sapphire, etc.

### Fixed Sanity Check Logic

```php
// Count auto-upgrader tiers
$maxAutoTier = $this->getMaxAutoUpgraderTier($clicks);

// Arrow jumps up to (maxAutoTier + 1) are plausible
// With 5 auto-upgrader tiers, 6-arrow jumps are possible in one click
$plausibleArrowJump = $maxAutoTier + 1;

if ($arrowDiff > $plausibleArrowJump && $dayDiff < 10) {
    $flags[] = "Day $day: Arrow jump exceeds plausible limit for $maxAutoTier auto-upgrader tiers";
}
```

## Magic Cost Reference

| Action | Magic Cost |
|--------|------------|
| Unlock Planet through Mathematical Multiverse | 1 each |
| Upgrade Button | 2 |
| Separate Costs | 3 |
| Freeze Costs | 4 |
| Eternal Feast | 1 |
| Unlock Sapphire | 10 |
| Unlock Emerald | 20 |
| Unlock Ruby | 50 |
| Auto-Upgrader | 10 each |

**Total for full late-game setup**: 10 (sapphire) + 20 (emerald) + 50 (ruby) + N×10 (auto-upgraders) = 80 + 10N magic minimum.

For 10 auto-upgraders per button × 3 buttons = 30 auto-upgraders = 380 magic = 380 dark rituals.

## Files Reference

- `html-game/js/ordinal.js` - OrdinalNumber class (962 lines)
- `html-game/js/util.js` - getUpgradeMult() and formatting
- `html-game/js/events.js` - Auto-upgrader click handlers
- `leaderboard-server/src/OrdinalNumber.php` - PHP port (401 lines, incomplete)
- `leaderboard-server/src/LateGameValidator.php` - Current sanity checks
