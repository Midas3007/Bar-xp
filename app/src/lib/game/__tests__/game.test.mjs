/**
 * Unit tests for the pure game logic.
 *
 * Deliberately zero-dependency: they run on Node's built-in test runner against
 * TypeScript compiled by `tsc` alone, so they need no package install and can be
 * run anywhere Node and TypeScript exist. `npm run test:game` wires it up.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  xpForLevel, totalXpForLevel, levelFromTotalXp, levelProgress,
  TIERS, tierForStats, MAX_LEVEL,
} from '../constants.js';
import {
  WEEKLY_TARGET, weekKey, weekKeyForDay, registerWorkout, settleStreak,
  streakMultiplier, safeStreak, migrateLegacyStreak, daysRemainingThisWeek,
  EMPTY_STREAK,
} from '../streak.js';
import { volumeMultiplier, DIMINISHING_THRESHOLD, scoreSession, coinsForSession } from '../xp.js';
import {
  baselineStats,
  ASSESSMENT_STAT_CEILING,
  newProfile,
  sanitizeDisplayName,
  MAX_DISPLAY_NAME,
  UNNAMED_ATHLETE,
} from '../profile.js';
import { LIMITS } from '../validation.js';

/* -------------------------------------------------------------------------- */
/* The migration guarantee                                                     */
/* -------------------------------------------------------------------------- */

// The old curve, kept here verbatim so the guarantee is checked against the real
// thing rather than against a remembered version of it.
const legacyXpForLevel = (l) => Math.floor(100 * Math.pow(l, 1.32) + 20 * l);
const legacyTotalFor = (target) => {
  let total = 0;
  for (let l = 1; l < target; l += 1) total += legacyXpForLevel(l);
  return total;
};

test('MIGRATION: no existing account can lose a level under the new curve', () => {
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    assert.ok(
      totalXpForLevel(level) <= legacyTotalFor(level),
      `level ${level}: new cumulative ${totalXpForLevel(level)} exceeds old ${legacyTotalFor(level)}`,
    );
  }
});

test('MIGRATION: every tier threshold that existed before is unchanged', () => {
  const before = {
    Uninitiated: 0, Bronze: 12, Silver: 26, Gold: 45,
    Platinum: 68, Diamond: 95, Mythic: 130, Legend: 175,
  };
  for (const [name, min] of Object.entries(before)) {
    const tier = TIERS.find((t) => t.name === name);
    assert.ok(tier, `tier ${name} disappeared`);
    assert.equal(tier.min, min, `tier ${name} threshold moved`);
  }
});

test('the tier ladder now extends past Legend', () => {
  const top = TIERS[TIERS.length - 1];
  assert.ok(top.min > 175, 'nothing above Legend');
  for (let i = 1; i < TIERS.length; i += 1) {
    assert.ok(TIERS[i].min > TIERS[i - 1].min, 'tier thresholds must ascend');
  }
});

/* -------------------------------------------------------------------------- */
/* The level curve is actually reachable                                       */
/* -------------------------------------------------------------------------- */

test('level 100 is a five-year goal, not a decorative one', () => {
  // A realistic athlete: session XP grows with level, sustained weekly streak.
  let xp = 0, sessions = 0, level = 1;
  while (level < MAX_LEVEL && sessions < 100000) {
    xp += (200 + Math.min(level, 60) * 14) * 1.25;
    sessions += 1;
    while (level < MAX_LEVEL && xp >= totalXpForLevel(level + 1)) level += 1;
  }
  // 208 sessions is a year at four a week.
  const years = sessions / 208;
  assert.ok(years > 3 && years < 7, `level 100 took ${years.toFixed(1)} years`);
});

test('levelFromTotalXp and totalXpForLevel agree at every boundary', () => {
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const at = totalXpForLevel(level);
    assert.equal(levelFromTotalXp(at), level, `at exactly the level ${level} boundary`);
    if (level > 1) assert.equal(levelFromTotalXp(at - 1), level - 1, `one XP short of level ${level}`);
  }
});

test('levelProgress never produces a value a bar cannot render', () => {
  for (const input of [undefined, null, NaN, Infinity, -1, 'abc', 0, 5_000_000]) {
    const p = levelProgress(input);
    assert.ok(Number.isFinite(p.percent) && p.percent >= 0 && p.percent <= 100, `percent for ${input}`);
    assert.ok(Number.isFinite(p.xpIntoLevel) && p.xpIntoLevel >= 0, `xpIntoLevel for ${input}`);
    assert.ok(p.level >= 1 && p.level <= MAX_LEVEL, `level for ${input}`);
  }
});

test('the curve is strictly increasing', () => {
  for (let l = 2; l <= MAX_LEVEL; l += 1) assert.ok(xpForLevel(l) > xpForLevel(l - 1));
});

/* -------------------------------------------------------------------------- */
/* Weekly streaks — the bug this slice exists to fix                           */
/* -------------------------------------------------------------------------- */

const MON = '2026-08-03', TUE = '2026-08-04', WED = '2026-08-05',
      THU = '2026-08-06', FRI = '2026-08-07', SAT = '2026-08-08',
      NEXT_MON = '2026-08-10', NEXT_WED = '2026-08-12', NEXT_FRI = '2026-08-14';

const train = (days, start = EMPTY_STREAK) =>
  days.reduce((s, d) => registerWorkout(s, d, 0), start);

test('REGRESSION: a Mon/Wed/Fri split builds a streak (it never could before)', () => {
  // Under the old daily-chain model this left `current` pinned at 1 forever.
  const s = train([MON, WED, FRI, SAT]);
  assert.equal(s.daysThisWeek, 4);
  assert.equal(s.current, 1, 'four distinct days in one week is one week of streak');
});

test('three days in a week is not enough', () => {
  const s = train([MON, WED, FRI]);
  assert.equal(s.current, 0);
  assert.equal(daysRemainingThisWeek(s), 1);
});

test('consecutive weeks accumulate', () => {
  let s = train([MON, WED, FRI, SAT]);
  assert.equal(s.current, 1);
  s = train([NEXT_MON, '2026-08-11', NEXT_WED, NEXT_FRI], s);
  assert.equal(s.current, 2, 'a second week at target');
  assert.equal(s.best, 2);
});

test('a missed week breaks the streak when no shield is held', () => {
  const s = train([MON, WED, FRI, SAT]);
  // Jump three weeks. The intervening weeks had no training at all.
  const settled = settleStreak(s, 0, '2026-08-24');
  assert.equal(settled.broken, true);
  assert.equal(settled.streak.current, 0);
});

test('a shield bridges a missed week', () => {
  const s = train([MON, WED, FRI, SAT]);
  const settled = settleStreak(s, 1, NEXT_MON + '');
  assert.equal(settled.streak.current, 1, 'the completed week is still credited');
  // Now skip a full week with one shield in hand.
  const skipped = settleStreak(settled.streak, 1, '2026-08-17');
  assert.equal(skipped.broken, false);
  assert.equal(skipped.shieldsConsumed, 1);
});

test('shields are not spent on a gap they cannot bridge', () => {
  const s = train([MON, WED, FRI, SAT]);
  const settled = settleStreak(s, 1, '2026-09-07'); // several missed weeks, one shield
  assert.equal(settled.broken, true);
  assert.equal(settled.shieldsConsumed, 0, 'the shield carries over rather than being wasted');
});

test('a second session on the same day does not advance the streak', () => {
  const s = train([MON, MON, MON, MON, MON]);
  assert.equal(s.daysThisWeek, 1, 'session spam cannot manufacture a week');
  assert.equal(s.current, 0);
});

test('logging settles an elapsed week without waiting for the background timer', () => {
  // The old code only ever settled from an hourly timer, so a shield bought to
  // save a streak routinely failed to spend before the streak had broken.
  const s = train([MON, WED, FRI, SAT]);
  const later = registerWorkout(s, '2026-08-31', 0);
  assert.equal(later.current, 0, 'the missed weeks were resolved on the logging path');
  assert.equal(later.daysThisWeek, 1);
});

test('week keys land on Monday and group a week together', () => {
  assert.equal(weekKeyForDay(MON), MON);
  assert.equal(weekKeyForDay(SAT), MON);
  assert.equal(weekKeyForDay('2026-08-09'), MON, 'Sunday belongs to the week that began Monday');
  assert.equal(weekKeyForDay(NEXT_MON), NEXT_MON);
});

test('the streak bonus is reachable and capped', () => {
  assert.equal(streakMultiplier(0), 1);
  assert.equal(streakMultiplier(1), 1.05);
  assert.ok(Math.abs(streakMultiplier(9) - 1.45) < 1e-9, 'nine weeks reaches the cap');
  assert.equal(streakMultiplier(500), 1.45, 'and stops there');
  assert.equal(streakMultiplier('nonsense'), 1);
});

test('MIGRATION: a legacy day-streak converts generously and never loses its record', () => {
  const legacy = { current: 15, best: 20, lastWorkoutDay: MON, shieldsUsed: 2 };
  const migrated = migrateLegacyStreak(safeStreak(legacy), MON);
  assert.equal(migrated.current, 3, '15 days rounds up to 3 weeks');
  assert.equal(migrated.best, 20, 'the historical best is never reduced');
  assert.equal(migrated.shieldsUsed, 2);
  assert.equal(migrated.weekKey, MON);
});

test('safeStreak survives anything a stale document can hold', () => {
  for (const junk of [undefined, null, {}, { current: NaN }, { current: -5, best: 'x' }, 42, 'nope']) {
    const s = safeStreak(junk);
    assert.ok(Number.isFinite(s.current) && s.current >= 0);
    assert.ok(Number.isFinite(s.best) && s.best >= 0);
    assert.ok(Number.isFinite(s.daysThisWeek) && s.daysThisWeek >= 0);
  }
});

/* -------------------------------------------------------------------------- */
/* Diminishing returns and the split-entry loophole                            */
/* -------------------------------------------------------------------------- */

const PUSH_UP = {
  id: 'push_up', name: 'Push-up', unit: 'reps', xpPerUnit: 1,
  statWeights: { strength: 0.45, endurance: 0.3, aesthetics: 0.2, discipline: 0.05 },
};
const entry = (sets, amount) => {
  const volume = sets * amount;
  return {
    exerciseId: 'push_up', exerciseName: 'Push-up', unit: 'reps',
    sets, amount, volume,
    xp: Math.round(volume * PUSH_UP.xpPerUnit * volumeMultiplier(volume)),
  };
};
const resolve = (id) => (id === 'push_up' ? PUSH_UP : undefined);

test('REGRESSION: splitting a movement across entries no longer dodges diminishing returns', () => {
  const asOne = scoreSession([entry(1, 150)], resolve, 0);
  const asTwo = scoreSession([entry(1, 75), entry(1, 75)], resolve, 0);
  assert.equal(asTwo.xp, asOne.xp, 'the same 150 reps must be worth the same either way');
  assert.ok(asOne.xp < 150, 'and the penalty must actually apply');
});

test('volume under the threshold is untouched', () => {
  assert.equal(volumeMultiplier(DIMINISHING_THRESHOLD), 1);
  assert.equal(volumeMultiplier(0), 1);
  const s = scoreSession([entry(4, 12)], resolve, 0);
  assert.equal(s.xp, 48, 'an ordinary session is not penalised');
});

test('different movements are judged independently', () => {
  const DIP = { ...PUSH_UP, id: 'dip', name: 'Dip', xpPerUnit: 1 };
  const two = scoreSession(
    [entry(1, 80), { ...entry(1, 80), exerciseId: 'dip', exerciseName: 'Dip' }],
    (id) => (id === 'push_up' ? PUSH_UP : id === 'dip' ? DIP : undefined),
    0,
  );
  assert.equal(two.xp, 160, '80 of each is under the threshold for both');
});

test('session scoring is finite whatever the entries hold', () => {
  const junk = [{ exerciseId: 'push_up', unit: 'reps', volume: NaN, xp: undefined },
                { exerciseId: 'ghost', unit: 'reps', volume: Infinity, xp: 'x' }];
  const s = scoreSession(junk, resolve, NaN);
  assert.ok(Number.isFinite(s.xp) && s.xp >= 0);
  assert.ok(Number.isFinite(s.coins) && s.coins >= 0);
  for (const v of Object.values(s.statGains)) assert.ok(Number.isFinite(v));
});

test('coins are finite and never negative', () => {
  for (const v of [undefined, null, NaN, -100, 'x', 1e9]) {
    const c = coinsForSession(v);
    assert.ok(Number.isFinite(c) && c >= 15);
  }
});

/* -------------------------------------------------------------------------- */
/* The assessment cannot hand out a rank                                       */
/* -------------------------------------------------------------------------- */

test('REGRESSION: the best possible assessment lands in Gold, not Legend', () => {
  const maxed = baselineStats({
    maxPullUps: LIMITS.MAX_ASSESS_PULL_UPS,
    maxPushUps: LIMITS.MAX_ASSESS_PUSH_UPS,
    plankSeconds: LIMITS.MAX_ASSESS_PLANK,
    bodyFat: LIMITS.MIN_BODY_FAT,
  });
  const avg = (maxed.strength + maxed.endurance + maxed.aesthetics + maxed.discipline) / 4;
  const tier = tierForStats(maxed);
  assert.ok(avg <= ASSESSMENT_STAT_CEILING, `average stat ${avg} exceeded the ceiling`);
  assert.ok(tier.min <= 45, `assessment alone reached ${tier.name}`);
  assert.notEqual(tier.name, 'Legend');
});

test('a beginner still starts at the bottom', () => {
  const beginner = baselineStats({ maxPullUps: 0, maxPushUps: 5, plankSeconds: 20, bodyFat: 25 });
  assert.equal(tierForStats(beginner).name, 'Uninitiated');
});

test('assessment stats are finite for hostile input', () => {
  for (const bad of [{}, { maxPullUps: NaN, maxPushUps: 'x', plankSeconds: -5, bodyFat: Infinity }]) {
    const s = baselineStats(bad);
    for (const v of Object.values(s)) assert.ok(Number.isFinite(v) && v >= 0);
  }
});

/* -------------------------------------------------------------------------- */
/* Display names must satisfy the security rules                              */
/* -------------------------------------------------------------------------- */

const HOSTILE_NAMES = [
  undefined, null, 42, {}, [], '', '   ', '\n\t ',
  'A'.repeat(200),
  '🏋️'.repeat(60),
  '  Ada   Lovelace  ',
  'Bartholomew Maximilian Featherstonehaugh-Cholmondeley III',
];

test('REGRESSION: a display name can never exceed the rules bound', () => {
  for (const name of HOSTILE_NAMES) {
    const out = sanitizeDisplayName(name);
    assert.ok(typeof out === 'string' && out.length >= 1, `empty for ${String(name)}`);
    assert.ok(out.length <= MAX_DISPLAY_NAME, `"${out}" is ${out.length} units long`);
    assert.ok(!/[\uD800-\uDBFF]$/.test(out), 'left a dangling surrogate');
  }
});

test('a blank name falls back to the placeholder', () => {
  for (const name of [undefined, null, '', '   ', ' ']) {
    assert.equal(sanitizeDisplayName(name), UNNAMED_ATHLETE);
  }
});

test('whitespace is collapsed rather than preserved', () => {
  assert.equal(sanitizeDisplayName('  Ada   Lovelace  '), 'Ada Lovelace');
});

test('sanitising twice changes nothing', () => {
  for (const name of HOSTILE_NAMES) {
    const once = sanitizeDisplayName(name);
    assert.equal(sanitizeDisplayName(once), once);
  }
});

test('REGRESSION: a long Google name cannot break profile creation', () => {
  const profile = newProfile({
    uid: 'u1',
    displayName: 'A'.repeat(60),
    email: 'someone@example.com',
    photoURL: '',
  });
  assert.equal(profile.displayName.length, MAX_DISPLAY_NAME);
});
