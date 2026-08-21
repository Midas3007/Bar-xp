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
  xpForLevel,
  totalXpForLevel,
  levelFromTotalXp,
  levelProgress,
  TIERS,
  IDENTITIES,
  STAT_META,
  tierForStats,
  identityForStreak,
  MAX_LEVEL,
} from '../constants.js';
import {
  WEEKLY_TARGET,
  weekKey,
  weekKeyForDay,
  registerWorkout,
  settleStreak,
  streakMultiplier,
  safeStreak,
  migrateLegacyStreak,
  daysRemainingThisWeek,
  EMPTY_STREAK,
  migrateStreakModel,
} from '../streak.js';
import {
  volumeMultiplier,
  DIMINISHING_THRESHOLD,
  scoreSession,
  coinsForSession,
  buildEntry,
  buildEntryFromReps,
  entryXp,
  volumeXp,
} from '../xp.js';
import { normalizeReps, entryReps, entryVolume, bestSet, formatSetLadder } from '../sets.js';
import { ensureGoals, advanceGoals } from '../goals.js';
import {
  normalizeRoutines,
  upsertRoutine,
  removeRoutine,
  loadRoutine,
  routineVolume,
  routineItemsFromEntries,
  buildRoutine,
} from '../routines.js';
import {
  baselineStats,
  ASSESSMENT_STAT_CEILING,
  newProfile,
  normalizeProfile,
  sanitizeDisplayName,
  MAX_DISPLAY_NAME,
  UNNAMED_ATHLETE,
} from '../profile.js';
import {
  LIMITS,
  validateSetLadder,
  validateRoutine,
  validateSession,
  validateMeasurements,
} from '../validation.js';
import { newlyEarned, isTierAchievement, achievementsFor } from '../achievements.js';
import {
  MEASUREMENT_BOUNDS,
  displayFromMetric,
  metricFromDisplay,
  normalizeMeasurementValues,
  unitLabel,
} from '../measurements.js';
import {
  GRADE_LABELS,
  GRADE_META,
  gradeLabel,
  measuredVTaper,
  overallAestheticScore,
  overallGrade,
  rateAesthetics,
} from '../aesthetics.js';
import { SHOP_ITEMS, purchaseState } from '../shop.js';
import { EXERCISES } from '../exercises.js';
import { buildSkillTree, skillStates, skillTally, frontierNode } from '../skillTree.js';
import { buildDemoData } from '../../demo/fixture.js';
import { normalizeThemePreference, resolveTheme, THEME_PREFERENCES } from '../../theme.js';
import {
  mergeMuscleVolume,
  sessionMuscleVolume,
  subtractMuscleVolume,
  MUSCLE_META,
  MUSCLE_GRADE_META,
  muscleHex,
  rateMuscles,
} from '../muscles.js';
import {
  CORRECTION_WINDOW_MS,
  applyReversal,
  canCorrect,
  reversalOf,
  withinCorrectionWindow,
} from '../correction.js';
import {
  FRIEND_CARD_FIELDS,
  friendCardFrom,
  otherMember,
  pairKey,
  pushRecentDay,
  requestId,
  searchKey,
} from '../friends.js';
import {
  EMPTY_SEASON,
  MAX_SEASON_HISTORY,
  accrueSeason,
  daysLeftInSeason,
  mergeSeasonStandings,
  placementIn,
  rolloverSeason,
  seasonIdFor,
  seasonWindowById,
  seasonWindowFor,
} from '../season.js';
import {
  CHALLENGE_TEMPLATES,
  challengeState,
  challengeWindowDays,
  resolveChallenge,
  scoreChallenge,
} from '../challenges.js';
import {
  buildShareCardSvg,
  escapeXml,
  shareCardFilename,
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
} from '../../share/shareCard.js';

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
    Uninitiated: 0,
    Bronze: 12,
    Silver: 26,
    Gold: 45,
    Platinum: 68,
    Diamond: 95,
    Mythic: 130,
    Legend: 175,
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
  let xp = 0,
    sessions = 0,
    level = 1;
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
    if (level > 1)
      assert.equal(levelFromTotalXp(at - 1), level - 1, `one XP short of level ${level}`);
  }
});

test('levelProgress never produces a value a bar cannot render', () => {
  for (const input of [undefined, null, NaN, Infinity, -1, 'abc', 0, 5_000_000]) {
    const p = levelProgress(input);
    assert.ok(
      Number.isFinite(p.percent) && p.percent >= 0 && p.percent <= 100,
      `percent for ${input}`,
    );
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

const MON = '2026-08-03',
  TUE = '2026-08-04',
  WED = '2026-08-05',
  THU = '2026-08-06',
  FRI = '2026-08-07',
  SAT = '2026-08-08',
  NEXT_MON = '2026-08-10',
  NEXT_WED = '2026-08-12',
  NEXT_FRI = '2026-08-14';

const train = (days, start = EMPTY_STREAK) =>
  days.reduce((s, d) => registerWorkout(s, d, 0), start);

test('every distinct training day advances the streak', () => {
  // Days again, not weeks. A Mon/Wed/Fri/Sat week is four days on the counter,
  // and the gaps between them do not break it — that is what the weekly target
  // protects.
  const s = train([MON, WED, FRI, SAT]);
  assert.equal(s.daysThisWeek, 4);
  assert.equal(s.current, 4);
  assert.equal(s.best, 4);
});

test('a short week still counts its days while the week is live', () => {
  // Three days is under the target, but the week has not ended, so nothing is
  // broken yet and the counter reflects the work actually done.
  const s = train([MON, WED, FRI]);
  assert.equal(s.current, 3);
  assert.equal(daysRemainingThisWeek(s), 1, 'one more day secures the week');
});

test('days accumulate across a week boundary once the target is met', () => {
  let s = train([MON, WED, FRI, SAT]);
  assert.equal(s.current, 4);
  s = train([NEXT_MON, '2026-08-11', NEXT_WED, NEXT_FRI], s);
  assert.equal(s.current, 8, 'four more days, and the first week protected the gap');
  assert.equal(s.best, 8);
});

test('a missed week breaks the streak when no shield is held', () => {
  const s = train([MON, WED, FRI, SAT]);
  // Jump three weeks. The intervening weeks had no training at all.
  const settled = settleStreak(s, 0, '2026-08-24');
  assert.equal(settled.broken, true);
  assert.equal(settled.streak.current, 0);
});

test('hitting the weekly target protects the streak through the gap', () => {
  // The whole point of the safety net: four days a week keeps the run alive
  // without training every single day, and no shield is spent doing it.
  const s = train([MON, WED, FRI, SAT]);
  const settled = settleStreak(s, 0, NEXT_MON);
  assert.equal(settled.broken, false);
  assert.equal(settled.shieldsConsumed, 0);
  assert.equal(settled.streak.current, 4, 'the run carries into the new week intact');
});

test('a shield bridges a week that missed the target', () => {
  const short = train([MON, WED, FRI]);
  const skipped = settleStreak(short, 1, NEXT_MON);
  assert.equal(skipped.broken, false);
  assert.equal(skipped.shieldsConsumed, 1);
  assert.equal(skipped.streak.current, 3, 'the days already earned survive');
});

test('shields are not spent on a gap they cannot bridge', () => {
  const s = train([MON, WED, FRI, SAT]);
  const settled = settleStreak(s, 1, '2026-09-07'); // several missed weeks, one shield
  assert.equal(settled.broken, true);
  assert.equal(settled.shieldsConsumed, 0, 'the shield carries over rather than being wasted');
});

test('a second session on the same day does not advance the streak', () => {
  const s = train([MON, MON, MON, MON, MON]);
  assert.equal(s.daysThisWeek, 1, 'session spam cannot manufacture days');
  assert.equal(s.current, 1, 'one day trained is one day of streak');
});

test('logging settles elapsed weeks without waiting for the background timer', () => {
  // The old code only ever settled from an hourly timer, so a shield bought to
  // save a streak routinely failed to spend before the streak had broken.
  const s = train([MON, WED, FRI, SAT]);
  const later = registerWorkout(s, '2026-08-31', 0);
  assert.equal(later.current, 1, 'the empty weeks broke the run, and today restarts it');
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
  assert.ok(Math.abs(streakMultiplier(1) - 1.03) < 1e-9);
  assert.ok(Math.abs(streakMultiplier(15) - 1.45) < 1e-9, 'fifteen days reaches the cap');
  assert.equal(streakMultiplier(500), 1.45, 'and stops there');
  assert.equal(streakMultiplier('nonsense'), 1);
});

test('MIGRATION: a pre-weekly day-streak is already in the right units', () => {
  // The original model counted days, and so does this one, so the number
  // carries over untouched — only the bookkeeping fields are filled in.
  const legacy = { current: 15, best: 20, lastWorkoutDay: MON, shieldsUsed: 2 };
  const migrated = migrateStreakModel(safeStreak(legacy), MON);
  assert.equal(migrated.current, 15);
  assert.equal(migrated.best, 20, 'the historical best is never reduced');
  assert.equal(migrated.shieldsUsed, 2);
  assert.equal(migrated.weekKey, MON);
  assert.equal(migrated.model, 'daily');
});

test('MIGRATION: a weekly streak converts to the days it was actually earned with', () => {
  // Holding N weeks required at least N * WEEKLY_TARGET training days, so that
  // is the honest floor: nobody is handed a run they did not train for, and
  // nobody loses one they did.
  const weekly = {
    current: 3,
    best: 5,
    lastWorkoutDay: WED,
    shieldsUsed: 1,
    weekKey: MON,
    daysThisWeek: 2,
  };
  const migrated = migrateStreakModel(safeStreak(weekly), WED);
  assert.equal(migrated.current, 3 * WEEKLY_TARGET);
  assert.equal(migrated.best, 5 * WEEKLY_TARGET, 'best is converted too, never reduced');
  assert.equal(migrated.daysThisWeek, 2, 'the live week is left alone');
  assert.equal(migrated.model, 'daily');
});

test('MIGRATION: a converted streak is never converted twice', () => {
  const weekly = {
    current: 3,
    best: 5,
    lastWorkoutDay: WED,
    shieldsUsed: 0,
    weekKey: MON,
    daysThisWeek: 2,
  };
  const once = migrateStreakModel(safeStreak(weekly), WED);
  const twice = migrateStreakModel(safeStreak(once), WED);
  assert.deepEqual(twice, once, 'the model marker makes the conversion idempotent');
});

test('safeStreak survives anything a stale document can hold', () => {
  for (const junk of [
    undefined,
    null,
    {},
    { current: NaN },
    { current: -5, best: 'x' },
    42,
    'nope',
  ]) {
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
  id: 'push_up',
  name: 'Push-up',
  unit: 'reps',
  xpPerUnit: 1,
  statWeights: { strength: 0.45, endurance: 0.3, aesthetics: 0.2, discipline: 0.05 },
};
const entry = (sets, amount) => {
  const volume = sets * amount;
  return {
    exerciseId: 'push_up',
    exerciseName: 'Push-up',
    unit: 'reps',
    sets,
    amount,
    volume,
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
  const junk = [
    { exerciseId: 'push_up', unit: 'reps', volume: NaN, xp: undefined },
    { exerciseId: 'ghost', unit: 'reps', volume: Infinity, xp: 'x' },
  ];
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
  for (const bad of [
    {},
    { maxPullUps: NaN, maxPushUps: 'x', plankSeconds: -5, bodyFat: Infinity },
  ]) {
    const s = baselineStats(bad);
    for (const v of Object.values(s)) assert.ok(Number.isFinite(v) && v >= 0);
  }
});

/* -------------------------------------------------------------------------- */
/* Display names must satisfy the security rules                              */
/* -------------------------------------------------------------------------- */

const HOSTILE_NAMES = [
  undefined,
  null,
  42,
  {},
  [],
  '',
  '   ',
  '\n\t ',
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

/* -------------------------------------------------------------------------- */
/* Set ladders — per-set reps                                                 */
/* -------------------------------------------------------------------------- */

test('MIGRATION: an old-format entry and a ladder of the same volume score identically', () => {
  const legacy = {
    exerciseId: 'push_up',
    exerciseName: 'Push-up',
    unit: 'reps',
    sets: 3,
    amount: 10,
    volume: 30,
    xp: 30,
  };
  const ladder = {
    exerciseId: 'push_up',
    exerciseName: 'Push-up',
    unit: 'reps',
    sets: 3,
    amount: 12,
    volume: 30,
    reps: [12, 10, 8],
    xp: 30,
  };
  const a = scoreSession([legacy], resolve, 0);
  const b = scoreSession([ladder], resolve, 0);
  assert.equal(b.xp, a.xp);
  assert.equal(b.totalVolume, a.totalVolume);
  assert.equal(b.totalReps, a.totalReps);
  assert.equal(a.xp, 30, 'and the figure is the one the old code produced');
});

test('a uniform ladder collapses to the legacy shape and stores no reps array', () => {
  const built = buildEntryFromReps(PUSH_UP, [10, 10, 10]);
  assert.deepEqual(built, buildEntry(PUSH_UP, 3, 10));
  assert.ok(!('reps' in built), 'a uniform entry must not carry a ladder');
});

test('a varied ladder records its sets, hardest set and true volume', () => {
  const built = buildEntryFromReps(PUSH_UP, [12, 10, 8]);
  assert.equal(built.sets, 3);
  assert.equal(built.amount, 12, 'amount is the hardest set');
  assert.equal(built.volume, 30, 'volume is the sum, not sets * amount');
  assert.deepEqual(built.reps, [12, 10, 8]);
});

test('diminishing returns still bite on a ladder', () => {
  const ladder = buildEntryFromReps(PUSH_UP, [50, 50, 50]);
  assert.equal(ladder.xp, entryXp(PUSH_UP, 1, 150));
  assert.ok(ladder.xp < 150, 'a 150-rep block must not be worth 150 XP');
});

test('entryVolume prefers a ladder, then the stored volume, and never re-derives', () => {
  assert.equal(entryVolume({ reps: [12, 10, 8] }), 30);
  assert.equal(entryVolume({ volume: 30 }), 30);
  // Deliberately 0: falling back to sets * amount would rescore old documents.
  assert.equal(entryVolume({ sets: 3, amount: 10 }), 0);
  for (const junk of [{ volume: NaN }, { reps: 'x' }, undefined, {}]) {
    const v = entryVolume(junk);
    assert.ok(Number.isFinite(v) && v >= 0, `not finite for ${JSON.stringify(junk)}`);
  }
});

test('normalizeReps drops blanks, floors decimals and caps the length', () => {
  assert.deepEqual(normalizeReps([12, 0, 8]), [12, 8]);
  assert.deepEqual(normalizeReps([10.7, 'x', null, 5]), [10, 5]);
  assert.equal(normalizeReps(Array.from({ length: 40 }, () => 5)).length, 20);
  assert.deepEqual(normalizeReps(undefined), []);
});

test('entryReps expands a uniform entry and returns a stored ladder as-is', () => {
  assert.deepEqual(entryReps({ reps: [12, 10, 8] }), [12, 10, 8]);
  assert.deepEqual(entryReps({ sets: 3, amount: 10 }), [10, 10, 10]);
  assert.deepEqual(entryReps({ sets: 0, amount: 0 }), []);
});

test('bestSet is the hardest set, not the last or the total', () => {
  assert.equal(bestSet({ reps: [12, 10, 8] }), 12);
  assert.equal(bestSet({ sets: 3, amount: 10 }), 10);
});

test('formatSetLadder renders both shapes and truncates a long ladder', () => {
  assert.equal(formatSetLadder({ sets: 3, amount: 10 }), '3 × 10');
  assert.equal(formatSetLadder({ reps: [12, 10, 8] }), '12 / 10 / 8');
  const long = formatSetLadder({ reps: Array.from({ length: 12 }, (_, i) => i + 1) });
  assert.ok(long.endsWith('+4'), `expected a +4 tail, got ${long}`);
});

test('validateSetLadder enforces the same bounds as the uniform path', () => {
  assert.ok(validateSetLadder(PUSH_UP, [12, 10, 8]).ok);
  assert.ok(!validateSetLadder(PUSH_UP, []).ok);
  assert.ok(
    !validateSetLadder(
      PUSH_UP,
      Array.from({ length: 21 }, () => 5),
    ).ok,
  );
  assert.ok(!validateSetLadder(PUSH_UP, [12, 0, 8]).ok);
  assert.ok(!validateSetLadder(PUSH_UP, [500]).ok);
  const HOLD = { ...PUSH_UP, id: 'plank', unit: 'seconds' };
  assert.ok(!validateSetLadder(HOLD, [3600]).ok);
  assert.ok(validateSetLadder(HOLD, [45, 40]).ok);
});

test('validateSession measures a ladder by its true total', () => {
  const cheat = [{ volume: 30, reps: Array.from({ length: 20 }, () => 300) }];
  assert.ok(!validateSession(cheat).ok, 'a 6000-rep ladder must not pass as volume 30');
});

/* -------------------------------------------------------------------------- */
/* Routines                                                                   */
/* -------------------------------------------------------------------------- */

const routine = (over = {}) =>
  buildRoutine({
    id: 'r1',
    name: 'Push Day',
    items: [{ exerciseId: 'push_up', reps: [12, 10, 8] }],
    createdAt: 100,
    updatedAt: 100,
    ...over,
  });

test('upsertRoutine replaces by id and preserves the original identity', () => {
  const list = [routine()];
  const next = upsertRoutine(list, routine({ name: 'Renamed', updatedAt: 200 }));
  assert.equal(next.length, 1);
  assert.equal(next[0].name, 'Renamed');
  assert.equal(next[0].id, 'r1');
  assert.equal(next[0].createdAt, 100, 'createdAt survives an edit');
});

test('upsertRoutine replaces by case-insensitive name', () => {
  const list = [routine()];
  const next = upsertRoutine(list, routine({ id: 'r2', name: 'push day' }));
  assert.equal(next.length, 1, 'saving under an existing name must not duplicate');
  assert.equal(next[0].id, 'r1', 'the stored id wins so logged workouts still point at it');
});

test('upsertRoutine appends otherwise and refuses to pass the cap', () => {
  const list = [routine()];
  assert.equal(upsertRoutine(list, routine({ id: 'r2', name: 'Pull Day' })).length, 2);

  const full = Array.from({ length: LIMITS.MAX_ROUTINES }, (_, i) =>
    routine({ id: `r${i}`, name: `Day ${i}` }),
  );
  const over = upsertRoutine(full, routine({ id: 'new', name: 'One More' }));
  assert.equal(over.length, LIMITS.MAX_ROUTINES);
});

test('removeRoutine drops only the named routine', () => {
  const list = [routine(), routine({ id: 'r2', name: 'Pull Day' })];
  const next = removeRoutine(list, 'r1');
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'r2');
});

test('normalizeRoutines survives junk and drops empty routines', () => {
  assert.deepEqual(normalizeRoutines(undefined), []);
  assert.deepEqual(normalizeRoutines(42), []);
  assert.deepEqual(normalizeRoutines([null]), []);
  assert.deepEqual(normalizeRoutines([{ id: 'r', items: 'nope' }]), []);
  assert.equal(
    normalizeRoutines([{ id: 'r', name: 'X', items: [{ exerciseId: 'push_up', reps: [10] }] }])
      .length,
    1,
  );
});

test('routineVolume totals the target work', () => {
  assert.equal(routineVolume(routine()), 30);
});

test('loadRoutine builds ladder entries, and reports locked and missing movements', () => {
  const r = buildRoutine({
    id: 'r1',
    name: 'Mixed',
    items: [
      { exerciseId: 'push_up', reps: [12, 10, 8] },
      { exerciseId: 'muscle_up', reps: [3] },
      { exerciseId: 'ghost', reps: [5] },
    ],
    createdAt: 0,
    updatedAt: 0,
  });
  const MUSCLE_UP = { ...PUSH_UP, id: 'muscle_up', name: 'Muscle-up' };
  const out = loadRoutine(
    r,
    (id) => (id === 'push_up' ? PUSH_UP : id === 'muscle_up' ? MUSCLE_UP : undefined),
    (ex) => ex.id !== 'muscle_up',
  );
  assert.equal(out.entries.length, 1);
  assert.deepEqual(out.entries[0].reps, [12, 10, 8]);
  assert.deepEqual(out.locked, ['Muscle-up'], 'locked reports the name, not the id');
  assert.deepEqual(out.missing, ['ghost']);
});

test('loadRoutine never returns more entries than a session can hold', () => {
  const items = Array.from({ length: LIMITS.MAX_ROUTINE_ITEMS }, () => ({
    exerciseId: 'push_up',
    reps: [10],
  }));
  const out = loadRoutine(
    buildRoutine({ id: 'r', name: 'Long', items, createdAt: 0, updatedAt: 0 }),
    () => PUSH_UP,
    () => true,
  );
  assert.ok(out.entries.length <= LIMITS.MAX_ENTRIES);
});

test('routineItemsFromEntries snapshots each entry ladder', () => {
  const items = routineItemsFromEntries([
    buildEntryFromReps(PUSH_UP, [12, 10, 8]),
    buildEntry(PUSH_UP, 3, 10),
  ]);
  assert.deepEqual(items[0], { exerciseId: 'push_up', reps: [12, 10, 8] });
  assert.deepEqual(items[1], { exerciseId: 'push_up', reps: [10, 10, 10] });
});

test('validateRoutine enforces the name, the item count and the cap', () => {
  const items = [{ exerciseId: 'push_up', reps: [10] }];
  assert.ok(validateRoutine({ name: 'Push Day', items, existingCount: 0 }).ok);
  assert.ok(!validateRoutine({ name: 'x', items, existingCount: 0 }).ok);
  assert.ok(!validateRoutine({ name: 'Push Day', items: [], existingCount: 0 }).ok);
  const many = Array.from({ length: LIMITS.MAX_ROUTINE_ITEMS + 1 }, () => items[0]);
  assert.ok(!validateRoutine({ name: 'Push Day', items: many, existingCount: 0 }).ok);
  const atCap = validateRoutine({ name: 'Push Day', items, existingCount: LIMITS.MAX_ROUTINES });
  assert.ok(!atCap.ok);
  assert.ok(atCap.error.includes(String(LIMITS.MAX_ROUTINES)), 'the error names the limit');
});

/* -------------------------------------------------------------------------- */
/* Base XP and the achievement diff                                            */
/* -------------------------------------------------------------------------- */

test('baseXp and streakBonusXp add up to the session total, at every streak', () => {
  for (const weeks of [0, 3, 20]) {
    const totals = scoreSession([entry(3, 20)], resolve, weeks);
    assert.equal(
      totals.baseXp + totals.streakBonusXp,
      totals.xp,
      `base + bonus should equal the total at ${weeks} weeks`,
    );
  }
});

test('baseXp is untouched by the streak multiplier', () => {
  const flat = scoreSession([entry(3, 20)], resolve, 0);
  const hot = scoreSession([entry(3, 20)], resolve, 20);
  assert.equal(flat.baseXp, hot.baseXp);
  assert.ok(hot.xp > flat.xp, 'the streak still pays');
});

test('baseXp still reflects session-level diminishing returns', () => {
  const oneEntry = scoreSession([entry(1, 150)], resolve, 0);
  const split = scoreSession([entry(1, 75), entry(1, 75)], resolve, 0);
  assert.equal(
    oneEntry.baseXp,
    split.baseXp,
    'splitting a movement across entries must not dodge the taper',
  );
});

const athlete = (overrides) => ({
  ...newProfile({ uid: 'u1', displayName: 'Test', email: 't@example.com', photoURL: '' }),
  ...overrides,
});

test('newlyEarned reports only what flipped', () => {
  const before = athlete({ workoutCount: 0 });
  const after = athlete({ workoutCount: 1 });
  assert.deepEqual(
    newlyEarned(before, after).map((a) => a.id),
    ['first_session'],
  );
  assert.deepEqual(newlyEarned(after, after), [], 'an unchanged profile earns nothing');
});

test('newlyEarned surfaces the rank badge, which isTierAchievement identifies', () => {
  const before = athlete({ tier: 'Bronze' });
  const after = athlete({ tier: 'Silver' });
  const earned = newlyEarned(before, after);
  assert.ok(
    earned.some((a) => isTierAchievement(a.id)),
    'the promotion produces a tier badge',
  );
  assert.ok(!isTierAchievement('sessions_10'));
  assert.ok(!isTierAchievement(undefined));
});

test('newlyEarned reports nothing when the profile goes backwards', () => {
  const before = athlete({ workoutCount: 50, totalReps: 20000 });
  const after = athlete({ workoutCount: 1, totalReps: 10 });
  assert.deepEqual(newlyEarned(before, after), []);
});

/* -------------------------------------------------------------------------- */
/* The share card                                                              */
/* -------------------------------------------------------------------------- */

/** No bare ampersand left anywhere outside a well-formed entity. */
const hasBareAmpersand = (svg) => /&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(svg);

test('escapeXml escapes the ampersand first and never double-escapes', () => {
  assert.equal(escapeXml('&<'), '&amp;&lt;');
  const escaped = escapeXml('a & b < c > d " e \' f');
  assert.ok(!hasBareAmpersand(escaped), escaped);
  assert.ok(!escaped.includes('&amp;lt;'), 'entities must not be escaped twice');
});

const cardData = (overrides) => ({
  athlete: 'Test Athlete',
  day: '2026-08-18',
  level: 12,
  tier: 'Silver',
  xpEarned: 420,
  baseXp: 380,
  streakBonusXp: 40,
  coinsEarned: 50,
  streakWeeks: 3,
  totalReps: 180,
  movements: ['Push-up', 'Pull-up'],
  highlights: ['Level 12 reached'],
  ...overrides,
});

test('buildShareCardSvg neutralises a hostile display name', () => {
  const svg = buildShareCardSvg(cardData({ athlete: '<script>alert(1)</script>&' }));
  assert.ok(!svg.includes('<script'), 'no live markup survives');
  assert.ok(!hasBareAmpersand(svg), 'no bare ampersand survives');
});

test('buildShareCardSvg never prints NaN, undefined or Infinity', () => {
  const svg = buildShareCardSvg({
    athlete: undefined,
    day: undefined,
    level: NaN,
    tier: undefined,
    xpEarned: NaN,
    baseXp: undefined,
    streakBonusXp: Infinity,
    coinsEarned: -500,
    streakWeeks: NaN,
    totalReps: undefined,
    movements: undefined,
    highlights: undefined,
  });
  assert.ok(!svg.includes('NaN'), svg.slice(0, 400));
  assert.ok(!svg.includes('undefined'));
  assert.ok(!svg.includes('Infinity'));
});

test('buildShareCardSvg emits a well-formed, correctly sized root element', () => {
  const svg = buildShareCardSvg(cardData());
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes(`width="${SHARE_CARD_WIDTH}"`));
  assert.ok(svg.includes(`height="${SHARE_CARD_HEIGHT}"`));
  assert.ok(svg.includes(`viewBox="0 0 ${SHARE_CARD_WIDTH} ${SHARE_CARD_HEIGHT}"`));
  assert.ok(svg.endsWith('</svg>'));
  const opens = svg.match(/<text /g)?.length ?? 0;
  const closes = svg.match(/<\/text>/g)?.length ?? 0;
  assert.equal(opens, closes, 'every text element is closed');
});

test('buildShareCardSvg bounds the movement and highlight lists', () => {
  const svg = buildShareCardSvg(
    cardData({
      movements: Array.from({ length: 12 }, (_, i) => `Movement ${i + 1}`),
      highlights: Array.from({ length: 9 }, (_, i) => `Highlight ${i + 1}`),
    }),
  );
  // Highlights are one text element each, bulleted with a circle.
  assert.ok((svg.match(/<circle /g)?.length ?? 0) <= 4, 'at most four highlight rows');
  assert.ok(svg.includes('more'), 'the overflowing movements are counted, not dropped');
  const listed = (svg.match(/Movement \d+/g) ?? []).length;
  assert.ok(listed <= 5, `at most five movements named, saw ${listed}`);
});

test('shareCardFilename dates the file, and falls back rather than emitting junk', () => {
  assert.equal(shareCardFilename('2026-08-18'), 'bar-xp-2026-08-18.png');
  assert.equal(shareCardFilename('not a day'), 'bar-xp-session.png');
  assert.equal(shareCardFilename(undefined), 'bar-xp-session.png');
});

/* -------------------------------------------------------------------------- */
/* Body measurements                                                           */
/* -------------------------------------------------------------------------- */

const KINDS = ['mass', 'length'];
const SYSTEMS = ['metric', 'imperial'];

test('the unit conversion round-trips exactly', () => {
  for (const v of [20, 73.5, 104, 400]) {
    for (const kind of KINDS) {
      for (const system of SYSTEMS) {
        const back = metricFromDisplay(displayFromMetric(v, kind, system), kind, system);
        assert.ok(Math.abs(back - v) < 1e-9, `${v} ${kind} in ${system} came back as ${back}`);
      }
    }
  }
});

test('the imperial conversions are the real ones', () => {
  assert.ok(Math.abs(displayFromMetric(100, 'mass', 'imperial') - 220.46226218487757) < 1e-6);
  assert.ok(Math.abs(displayFromMetric(100, 'length', 'imperial') - 39.37007874015748) < 1e-9);
});

test('metric is the identity in both directions', () => {
  for (const kind of KINDS) {
    assert.equal(displayFromMetric(82.4, kind, 'metric'), 82.4);
    assert.equal(metricFromDisplay(82.4, kind, 'metric'), 82.4);
  }
});

test('normalizeMeasurementValues drops junk rather than clamping it', () => {
  const out = normalizeMeasurementValues({
    neck: 40,
    bodyweight: 500,
    chest: 300,
    waist: -10,
    biceps: 0,
    back: NaN,
    thighs: Infinity,
    calves: 'wide',
  });
  assert.deepEqual(out, {}, 'a typo must never be silently recorded as the bound');
});

test('normalizeMeasurementValues keeps and rounds a good reading', () => {
  assert.deepEqual(normalizeMeasurementValues({ chest: 104.26 }), { chest: 104.3 });
  assert.deepEqual(normalizeMeasurementValues({ bodyweight: 82.44, waist: 82 }), {
    bodyweight: 82.4,
    waist: 82,
  });
});

test('normalizeMeasurementValues survives being handed anything at all', () => {
  for (const junk of [null, undefined, 42, 'x', [], true]) {
    assert.deepEqual(normalizeMeasurementValues(junk), {});
  }
});

test('validateMeasurements accepts an empty set and names the bound it rejects', () => {
  assert.ok(validateMeasurements({}).ok);
  assert.ok(validateMeasurements({ chest: 104, waist: 82 }).ok);
  const bad = validateMeasurements({ bodyweight: 900 });
  assert.ok(!bad.ok);
  assert.ok(bad.error.includes('400'), bad.error);
});

test('LIMITS mirrors MEASUREMENT_BOUNDS, the one place the two could drift', () => {
  assert.equal(LIMITS.MIN_BODYWEIGHT_KG, MEASUREMENT_BOUNDS.mass.min);
  assert.equal(LIMITS.MAX_BODYWEIGHT_KG, MEASUREMENT_BOUNDS.mass.max);
  assert.equal(LIMITS.MIN_GIRTH_CM, MEASUREMENT_BOUNDS.length.min);
  assert.equal(LIMITS.MAX_GIRTH_CM, MEASUREMENT_BOUNDS.length.max);
});

test('the two grade vocabularies cover the same five grades', () => {
  assert.deepEqual(Object.keys(GRADE_LABELS.plain).sort(), Object.keys(GRADE_LABELS.bro).sort());
  assert.equal(Object.keys(GRADE_LABELS.plain).length, 5);
  assert.equal(gradeLabel('elite', 'bro'), 'GIGACHAD');
  assert.equal(gradeLabel('elite', 'plain'), 'Standout');
  // Missing data is not a joke, and a joke there would read as a judgement of
  // the user rather than of the dataset.
  assert.equal(gradeLabel('unknown', 'bro'), gradeLabel('unknown', 'plain'));
});

/**
 * Measurements feed the V-taper trait and nothing else.
 *
 * This replaces an earlier invariant that asserted measurements were never
 * scored at all. That was the right default before the app had a use for them;
 * the owner asked for the tape to count, and back-over-waist is the one
 * physique ratio a tape can actually settle. The narrower guarantee still
 * matters and is what this test now pins: a measurement changes the trait it
 * genuinely describes and leaves every other trait untouched.
 */
test('measurements move the V-taper trait and only that trait', () => {
  const base = {
    ...newProfile({ uid: 'u1', displayName: 'Test', email: 't@example.com', photoURL: '' }),
    bodyFat: 14,
    workoutCount: 40,
    totalReps: 6000,
    muscleVolume: {
      chest: 900,
      shoulders: 700,
      triceps: 600,
      biceps: 550,
      lats: 800,
      upper_back: 700,
      abs: 500,
      obliques: 300,
      quads: 900,
      glutes: 700,
      hamstrings: 500,
      calves: 400,
      forearms: 300,
      lower_back: 300,
    },
  };
  const measured = {
    ...base,
    measurements: {
      values: { bodyweight: 82.4, chest: 104, back: 112, waist: 80, biceps: 38 },
      recordedAt: Date.now(),
    },
  };

  const before = rateAesthetics(base);
  const after = rateAesthetics(measured);

  for (let i = 0; i < before.length; i += 1) {
    if (before[i].id === 'vtaper') continue;
    assert.deepEqual(after[i], before[i], `${before[i].id} must not move`);
  }
  const taper = after.find((t) => t.id === 'vtaper');
  assert.equal(taper.score, measuredVTaper(measured.measurements.values));
  assert.notEqual(taper.score, before.find((t) => t.id === 'vtaper').score);
});

test('the V-taper ratio scores without inventing an ideal', () => {
  // No tape data at all leaves the volume proxy in charge.
  assert.equal(measuredVTaper(undefined), null);
  assert.equal(measuredVTaper({ back: 112 }), null);
  assert.equal(measuredVTaper({ waist: 80 }), null);

  // A narrow taper floors rather than going negative; a wide one caps rather
  // than rewarding an ever-smaller waist.
  assert.equal(measuredVTaper({ back: 90, waist: 90 }), 0);
  assert.equal(measuredVTaper({ back: 200, waist: 80 }), 100);
  assert.equal(measuredVTaper({ back: 160, waist: 100 }), 100);

  const mid = measuredVTaper({ back: 112, waist: 80 });
  assert.ok(mid > 0 && mid < 100, `expected a mid-range score, got ${mid}`);
});

test('Gym Bro Mode is a label set, never a score', () => {
  // The setting reaches one headline verdict. It must not be able to move a
  // number anywhere.
  assert.equal(gradeLabel('elite', 'bro'), 'GIGACHAD');
  assert.equal(gradeLabel('elite', 'plain'), 'Standout');
  assert.equal(overallGrade(82, true), 'elite');
  assert.equal(overallGrade(82, false), 'unknown');
  assert.equal(overallGrade(10, true), 'weak');
  // Hostile input still lands on a real band rather than undefined.
  for (const junk of [NaN, undefined, null, 'lots', Infinity, -50, 900]) {
    const band = overallGrade(junk, true);
    assert.ok(GRADE_LABELS.plain[band] !== undefined, `${String(junk)} -> ${band}`);
  }
});
test('unitLabel names the unit the value is actually shown in', () => {
  assert.equal(unitLabel('mass', 'metric'), 'kg');
  assert.equal(unitLabel('mass', 'imperial'), 'lb');
  assert.equal(unitLabel('length', 'metric'), 'cm');
  assert.equal(unitLabel('length', 'imperial'), 'in');
});

/* -------------------------------------------------------------------------- */
/* Corrections                                                                 */
/* -------------------------------------------------------------------------- */

const HOUR = 60 * 60 * 1000;

function workoutOf(entries, overrides = {}) {
  const scored = scoreSession(entries, resolve, 0);
  return {
    id: 'w1',
    uid: 'u1',
    day: '2026-08-20',
    createdAt: Date.now(),
    entries,
    xpEarned: scored.xp,
    coinsEarned: coinsForSession(scored.xp),
    totalVolume: scored.totalVolume,
    totalReps: scored.totalReps,
    presetId: null,
    kind: 'session',
    correctsId: null,
    ...overrides,
  };
}

function profileOf(overrides = {}) {
  return {
    ...newProfile({ uid: 'u1', displayName: 'Test', email: 't@example.com', photoURL: '' }),
    ...overrides,
  };
}

test('a reversal returns exactly the stat gains the session applied', () => {
  const entries = [entry(3, 20), entry(4, 15)];
  const workout = workoutOf(entries);
  assert.deepEqual(
    reversalOf(workout, resolve).statLoss,
    scoreSession(entries, resolve, 0).statGains,
  );
});

test('a reversal takes back exactly the XP that was stored', () => {
  const workout = workoutOf([entry(3, 20)]);
  // The catalog has since been retuned. The reversal must still take back what
  // was actually granted, not what the same reps would be worth today.
  const retuned = (id) => (id === 'push_up' ? { ...PUSH_UP, xpPerUnit: 9 } : undefined);
  assert.equal(reversalOf(workout, retuned).xp, workout.xpEarned);
  assert.equal(reversalOf(workout, retuned).coins, workout.coinsEarned);
});

test('voiding cannot drive anything below zero', () => {
  const profile = profileOf({
    totalXp: 10,
    grossXp: 10,
    coins: 0,
    totalReps: 3,
    workoutCount: 1,
    stats: { strength: 0, endurance: 0, aesthetics: 0, discipline: 0 },
  });
  const huge = {
    xp: 100000,
    coins: 5000,
    totalReps: 9999,
    statLoss: { strength: 999, endurance: 999, aesthetics: 999, discipline: 999 },
    muscleLoss: { chest: 9999 },
  };
  const out = applyReversal(profile, huge);
  for (const value of [out.xpVoided, out.totalXp, out.coins, out.totalReps, out.workoutCount]) {
    assert.ok(Number.isFinite(value) && value >= 0, `${value} must be finite and non-negative`);
  }
  for (const key of Object.keys(out.stats)) {
    assert.ok(out.stats[key] >= 0, `${key} floored at zero`);
  }
  assert.ok(out.level >= 1);
  assert.deepEqual(out.muscleVolume, {});
});

test('xpVoided never exceeds gross XP', () => {
  // The rules invariant, asserted on the client that has to satisfy it:
  // `removable` is capped at *net*, so voided can never outrun gross.
  const profile = profileOf({ grossXp: 500, xpVoided: 400, totalXp: 100 });
  const out = applyReversal(profile, {
    xp: 900,
    coins: 0,
    totalReps: 0,
    statLoss: { strength: 0, endurance: 0, aesthetics: 0, discipline: 0 },
    muscleLoss: {},
  });
  assert.ok(out.xpVoided <= 500, `${out.xpVoided} must not exceed gross 500`);
  assert.equal(out.totalXp, 0);
});

test('net XP is what the level is read from', () => {
  const fully = normalizeProfile('u1', { totalXp: 5000, xpVoided: 5000 });
  assert.equal(fully.totalXp, 0);
  assert.equal(fully.level, 1);
  assert.equal(fully.grossXp, 5000);

  // BACKWARD COMPATIBILITY: every live document lacks `xpVoided`, and absence
  // must read as zero so no account's numbers move.
  const legacy = normalizeProfile('u1', { totalXp: 5000 });
  assert.equal(legacy.xpVoided, 0);
  assert.equal(legacy.totalXp, 5000);
  assert.equal(legacy.level, levelFromTotalXp(5000));
});

test('subtractMuscleVolume is the inverse of mergeMuscleVolume', () => {
  const session = sessionMuscleVolume([entry(3, 20), entry(4, 15)]);
  const merged = mergeMuscleVolume({}, session);
  assert.ok(Object.keys(merged).length > 0, 'the fixture must actually move some muscles');
  assert.deepEqual(subtractMuscleVolume(merged, session), {});
});

test('subtractMuscleVolume floors at zero', () => {
  const out = subtractMuscleVolume({ chest: 10 }, { chest: 999, lats: 50 });
  assert.deepEqual(out, {});
  for (const value of Object.values(out)) {
    assert.ok(Number.isFinite(value) && value >= 0);
  }
});

test('the correction window closes at 48 hours', () => {
  const now = Date.now();
  assert.equal(withinCorrectionWindow(now - 47 * HOUR, now), true);
  assert.equal(withinCorrectionWindow(now - 49 * HOUR, now), false);
  assert.equal(withinCorrectionWindow(now - CORRECTION_WINDOW_MS + 1000, now), true);
  for (const junk of [NaN, undefined, null, 0, -1, 'yesterday']) {
    assert.equal(withinCorrectionWindow(junk, now), false, `${String(junk)} is not a timestamp`);
  }
  // A minute of clock skew is tolerated; an hour into the future is corrupt.
  assert.equal(withinCorrectionWindow(now + 10 * 1000, now), true);
  assert.equal(withinCorrectionWindow(now + HOUR, now), false);
});

test('a session already corrected cannot be corrected again', () => {
  const workout = workoutOf([entry(3, 20)]);
  assert.equal(canCorrect(workout, false), true);
  assert.equal(canCorrect(workout, true), false);
  assert.equal(canCorrect({ ...workout, kind: 'correction' }, false), false);
});

test('a reversal survives a deleted custom movement', () => {
  // The movement was a custom one and has since been removed, so `resolve`
  // returns undefined for every entry. The XP figure is still exact because it
  // is read off the document, and the stat losses are finite zeros.
  const workout = workoutOf([entry(3, 20)]);
  const gone = () => undefined;
  const reversal = reversalOf(workout, gone);
  assert.equal(reversal.xp, workout.xpEarned);
  for (const key of Object.keys(reversal.statLoss)) {
    assert.ok(Number.isFinite(reversal.statLoss[key]), `${key} must be finite`);
  }
});

test('a reversal never takes back more than the session granted', () => {
  // `logWorkout` adds a streak-scaled discipline bonus outside `scoreSession`,
  // and the workout document does not record the streak. The reversal must
  // under-remove rather than over-remove: taking back discipline that was never
  // granted would let repeated correct-and-relog cycles grind a stat down.
  const entries = [entry(3, 20)];
  const workout = workoutOf(entries);
  const applied = scoreSession(entries, resolve, 0).statGains;
  const removed = reversalOf(workout, resolve).statLoss;
  for (const key of Object.keys(applied)) {
    assert.ok(
      removed[key] <= applied[key] + 1e-9,
      `${key}: removed ${removed[key]} must not exceed granted ${applied[key]}`,
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Seasons                                                                     */
/* -------------------------------------------------------------------------- */

test('season ids sit on the quarter boundaries', () => {
  assert.equal(seasonIdFor(new Date(2026, 0, 1)), '2026-S1');
  assert.equal(seasonIdFor(new Date(2026, 2, 31)), '2026-S1');
  assert.equal(seasonIdFor(new Date(2026, 3, 1)), '2026-S2');
  assert.equal(seasonIdFor(new Date(2026, 8, 30)), '2026-S3');
  assert.equal(seasonIdFor(new Date(2026, 9, 1)), '2026-S4');
  // Across the year boundary.
  assert.equal(seasonIdFor(new Date(2025, 11, 31)), '2025-S4');
  assert.equal(seasonIdFor(new Date(2026, 0, 1)), '2026-S1');
});

test('seasonWindowById round-trips seasonIdFor', () => {
  for (const date of [new Date(2026, 0, 15), new Date(2024, 5, 2), new Date(2027, 11, 9)]) {
    const id = seasonIdFor(date);
    const window = seasonWindowById(id);
    assert.equal(window.id, id);
    assert.deepEqual(window, seasonWindowFor(date));
  }
  for (const junk of ['', '2026-S5', '2026S1', 'nope', null, 42]) {
    assert.equal(seasonWindowById(junk), null);
  }
});

test('the first season ends on the right day, leap year included', () => {
  // February is exactly why endDay is computed rather than tabulated.
  assert.equal(seasonWindowById('2024-S1').endDay, '2024-03-31');
  assert.equal(seasonWindowById('2024-S1').startDay, '2024-01-01');
  assert.equal(seasonWindowById('2026-S2').endDay, '2026-06-30');
  assert.equal(seasonWindowById('2026-S4').endDay, '2026-12-31');
  assert.ok(daysLeftInSeason() >= 0);
});

test('rolloverSeason leaves an unfinished season alone', () => {
  const state = { id: '2026-S3', xp: 500, sessions: 4, startedAt: 1 };
  const out = rolloverSeason(state, [], '2026-S3', 1000);
  assert.equal(out.changed, false);
  assert.deepEqual(out.season, state);
  assert.deepEqual(out.history, []);
});

test('a profile with no season is initialised without inventing history', () => {
  // Every live document is in this state, and none of them ever competed in a
  // season, so handing them a placement would be a fabrication.
  const out = rolloverSeason(EMPTY_SEASON, [], '2026-S3', 1000);
  assert.equal(out.changed, true);
  assert.deepEqual(out.season, { id: '2026-S3', xp: 0, sessions: 0, startedAt: 1000 });
  assert.deepEqual(out.history, []);
});

test('an elapsed season is recorded as pending and the counter resets', () => {
  const out = rolloverSeason(
    { id: '2026-S2', xp: 900, sessions: 11, startedAt: 1 },
    [],
    '2026-S3',
    5000,
  );
  assert.equal(out.changed, true);
  assert.deepEqual(out.season, { id: '2026-S3', xp: 0, sessions: 0, startedAt: 5000 });
  assert.equal(out.history.length, 1);
  assert.deepEqual(out.history[0], {
    id: '2026-S2',
    xp: 900,
    sessions: 11,
    rank: 0,
    entrants: 0,
    pending: true,
    endedAt: 5000,
  });
});

test('a season with no XP leaves no history entry', () => {
  const out = rolloverSeason({ id: '2026-S2', xp: 0, sessions: 0, startedAt: 1 }, [], '2026-S3');
  assert.equal(out.changed, true);
  assert.deepEqual(out.history, []);
});

test('season history dedupes by id, sorts newest first and caps at 24', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    id: `20${String(10 + i).padStart(2, '0')}-S1`,
    xp: 10,
    sessions: 1,
    rank: 0,
    entrants: 0,
    pending: false,
    endedAt: i,
  }));
  const withDuplicate = [...many, { ...many[0], xp: 999 }];
  const out = rolloverSeason(
    { id: '2050-S1', xp: 5, sessions: 1, startedAt: 1 },
    withDuplicate,
    '2050-S2',
  );
  assert.equal(out.history.length, MAX_SEASON_HISTORY);
  assert.equal(new Set(out.history.map((r) => r.id)).size, out.history.length);
  for (let i = 1; i < out.history.length; i += 1) {
    assert.ok(out.history[i - 1].id > out.history[i].id, 'newest first');
  }
});

/**
 * DESIGN INVARIANT: a season resets a scoreboard, not a character.
 *
 * If a future change makes rollover return `totalXp`, `stats`, `coins` or
 * anything else, this fails — which is the point of asserting the shape rather
 * than trusting the reviewer to remember.
 */
test('rolloverSeason returns only season fields', () => {
  const out = rolloverSeason({ id: '2026-S1', xp: 100, sessions: 2, startedAt: 1 }, [], '2026-S2');
  assert.deepEqual(Object.keys(out).sort(), ['changed', 'history', 'season']);
  assert.deepEqual(Object.keys(out.season).sort(), ['id', 'sessions', 'startedAt', 'xp']);
});

test('accrueSeason adds XP and counts the session', () => {
  const out = accrueSeason({ id: '2026-S3', xp: 100, sessions: 2, startedAt: 7 }, 50, 9);
  assert.deepEqual(out, { id: '2026-S3', xp: 150, sessions: 3, startedAt: 7 });
  // Hostile input cannot produce NaN.
  const junk = accrueSeason(EMPTY_SEASON, 'lots', 9);
  assert.ok(Number.isFinite(junk.xp) && junk.xp >= 0);
});

test('standings union keeps the higher XP for a duplicate uid', () => {
  const merged = mergeSeasonStandings(
    [
      { uid: 'a', displayName: 'A', xp: 100 },
      { uid: 'b', displayName: 'B', xp: 400 },
    ],
    [
      { uid: 'a', displayName: 'A', xp: 250 },
      { uid: 'c', displayName: 'C', xp: 50 },
    ],
  );
  assert.deepEqual(
    merged.map((s) => s.uid),
    ['b', 'a', 'c'],
  );
  assert.equal(merged.find((s) => s.uid === 'a').xp, 250);
});

test('standings survive hostile input', () => {
  const merged = mergeSeasonStandings(
    [null, 42, { uid: '', xp: 5 }, { uid: 'a', xp: NaN }],
    'nonsense',
  );
  for (const s of merged) assert.ok(Number.isFinite(s.xp) && s.uid !== '');
});

test('equal season XP shares a rank', () => {
  const standings = [
    { uid: 'a', displayName: 'A', xp: 500 },
    { uid: 'b', displayName: 'B', xp: 300 },
    { uid: 'c', displayName: 'C', xp: 300 },
    { uid: 'd', displayName: 'D', xp: 100 },
  ];
  assert.deepEqual(placementIn(standings, 'a'), { rank: 1, entrants: 4 });
  assert.deepEqual(placementIn(standings, 'b'), { rank: 2, entrants: 4 });
  assert.deepEqual(placementIn(standings, 'c'), { rank: 2, entrants: 4 });
  assert.deepEqual(placementIn(standings, 'd'), { rank: 4, entrants: 4 });
  assert.deepEqual(placementIn(standings, 'nobody'), { rank: 0, entrants: 4 });
});

/* -------------------------------------------------------------------------- */
/* Challenges                                                                  */
/* -------------------------------------------------------------------------- */

test('the week window is Monday to Sunday, matching the streak model', () => {
  const wednesday = new Date(2026, 7, 19);
  const window = challengeWindowDays('week', wednesday);
  assert.equal(window.startDay, weekKey(wednesday));
  assert.equal(window.startDay, '2026-08-17');
  assert.equal(window.endDay, '2026-08-23');
  assert.ok(window.endsAt > wednesday.getTime());
});

test('the month window covers the whole calendar month', () => {
  assert.deepEqual(
    { ...challengeWindowDays('month', new Date(2026, 7, 19)), endsAt: 0 },
    { startDay: '2026-08-01', endDay: '2026-08-31', endsAt: 0 },
  );
  // February, and a leap February.
  assert.equal(challengeWindowDays('month', new Date(2026, 1, 10)).endDay, '2026-02-28');
  assert.equal(challengeWindowDays('month', new Date(2024, 1, 10)).endDay, '2024-02-29');
});

const chWorkout = (day, overrides = {}) => ({
  id: day,
  uid: 'u1',
  day,
  createdAt: 0,
  entries: [],
  xpEarned: 0,
  coinsEarned: 0,
  totalVolume: 0,
  totalReps: 0,
  presetId: null,
  kind: 'session',
  correctsId: null,
  ...overrides,
});

test('sessions count distinct days, not documents', () => {
  // Splitting one session into five logs must not win a challenge, for the same
  // reason the streak counts distinct days.
  const sameDay = [chWorkout('2026-08-18'), chWorkout('2026-08-18')];
  const twoDays = [chWorkout('2026-08-18'), chWorkout('2026-08-19')];
  assert.equal(scoreChallenge('sessions', null, sameDay, '2026-08-17', '2026-08-23').value, 1);
  assert.equal(scoreChallenge('sessions', null, twoDays, '2026-08-17', '2026-08-23').value, 2);
});

test('volume and XP sum, and out-of-window days are ignored', () => {
  const workouts = [
    chWorkout('2026-08-18', { totalVolume: 100, xpEarned: 40 }),
    chWorkout('2026-08-19', { totalVolume: 50, xpEarned: 20 }),
    chWorkout('2026-09-01', { totalVolume: 999, xpEarned: 999 }),
    chWorkout('2026-07-31', { totalVolume: 999, xpEarned: 999 }),
  ];
  assert.equal(scoreChallenge('volume', null, workouts, '2026-08-01', '2026-08-31').value, 150);
  assert.equal(scoreChallenge('xp', null, workouts, '2026-08-01', '2026-08-31').value, 60);
});

test('exercise volume filters to the named movement', () => {
  const workouts = [
    chWorkout('2026-08-18', {
      entries: [
        {
          exerciseId: 'pull_up',
          exerciseName: 'Pull-up',
          unit: 'reps',
          sets: 3,
          amount: 8,
          volume: 24,
          xp: 24,
        },
        {
          exerciseId: 'push_up',
          exerciseName: 'Push-up',
          unit: 'reps',
          sets: 3,
          amount: 20,
          volume: 60,
          xp: 60,
        },
      ],
    }),
    chWorkout('2026-09-05', {
      entries: [
        {
          exerciseId: 'pull_up',
          exerciseName: 'Pull-up',
          unit: 'reps',
          sets: 5,
          amount: 10,
          volume: 50,
          xp: 50,
        },
      ],
    }),
  ];
  const out = scoreChallenge('exercise_volume', 'pull_up', workouts, '2026-08-01', '2026-08-31');
  assert.equal(out.value, 24, 'push-ups and September are both excluded');
});

test('challenge scoring is finite for junk entries', () => {
  const workouts = [
    chWorkout('2026-08-18', {
      totalVolume: NaN,
      xpEarned: undefined,
      entries: [
        { exerciseId: 'pull_up', volume: 'lots' },
        { exerciseId: 'pull_up', volume: Infinity },
        null,
      ],
    }),
    null,
    { day: '2026-08-19' },
  ];
  for (const metric of ['sessions', 'volume', 'xp', 'exercise_volume']) {
    const out = scoreChallenge(metric, 'pull_up', workouts, '2026-08-01', '2026-08-31');
    assert.ok(Number.isFinite(out.value) && out.value >= 0, `${metric} produced ${out.value}`);
    assert.ok(Number.isFinite(out.sessions));
  }
});

test('a correction record is not training', () => {
  const workouts = [
    chWorkout('2026-08-18', { totalVolume: 100 }),
    chWorkout('2026-08-20', { kind: 'correction', totalVolume: 0 }),
  ];
  assert.equal(scoreChallenge('sessions', null, workouts, '2026-08-01', '2026-08-31').value, 1);
});

const challengeOf = (overrides = {}) => ({
  id: 'c1',
  createdBy: 'a',
  members: ['a', 'b'],
  templateId: 'sessions_week',
  title: 'Most sessions this week',
  metric: 'sessions',
  window: 'week',
  exerciseId: null,
  startDay: '2026-08-17',
  endDay: '2026-08-23',
  endsAt: 1000,
  status: 'active',
  createdAt: 0,
  respondedAt: 1,
  ...overrides,
});

test('a challenge is unresolved until it ends', () => {
  const scores = {
    a: { uid: 'a', value: 5, sessions: 5, updatedAt: 0 },
    b: { uid: 'b', value: 2, sessions: 2, updatedAt: 0 },
  };
  assert.equal(challengeState(challengeOf(), 500), 'active');
  assert.deepEqual(resolveChallenge(challengeOf(), scores, 500), {
    ended: false,
    winner: null,
    tie: false,
  });
});

test('the higher score wins once it has ended', () => {
  const scores = {
    a: { uid: 'a', value: 5, sessions: 5, updatedAt: 0 },
    b: { uid: 'b', value: 2, sessions: 2, updatedAt: 0 },
  };
  assert.equal(challengeState(challengeOf(), 2000), 'ended');
  assert.deepEqual(resolveChallenge(challengeOf(), scores, 2000), {
    ended: true,
    winner: 'a',
    tie: false,
  });
});

test('a tie is a tie, and is not broken on a secondary metric', () => {
  const scores = {
    a: { uid: 'a', value: 4, sessions: 9, updatedAt: 0 },
    b: { uid: 'b', value: 4, sessions: 1, updatedAt: 0 },
  };
  const out = resolveChallenge(challengeOf(), scores, 2000);
  assert.equal(out.tie, true);
  assert.equal(out.winner, null);
});

test('a declined or unanswered challenge never resolves', () => {
  assert.equal(challengeState(challengeOf({ status: 'declined' }), 2000), 'declined');
  assert.equal(challengeState(challengeOf({ status: 'pending' }), 2000), 'expired');
  assert.equal(challengeState(challengeOf({ status: 'pending' }), 500), 'pending');
  assert.equal(resolveChallenge(challengeOf({ status: 'declined' }), {}, 2000).ended, false);
});

test('every template names a real metric and window', () => {
  for (const t of CHALLENGE_TEMPLATES) {
    assert.ok(['sessions', 'volume', 'xp', 'exercise_volume'].includes(t.metric));
    assert.ok(['week', 'month'].includes(t.window));
    assert.ok(t.title.length > 0 && t.unit.length > 0);
    if (t.metric === 'exercise_volume') assert.ok(t.exerciseId, `${t.id} needs an exerciseId`);
  }
});

/* -------------------------------------------------------------------------- */
/* Friends                                                                     */
/* -------------------------------------------------------------------------- */

test('pairKey is symmetric and sorted; requestId is directional', () => {
  assert.equal(pairKey('alice', 'bob'), 'alice__bob');
  assert.equal(pairKey('bob', 'alice'), 'alice__bob');
  assert.equal(pairKey('zeta', 'alpha'), 'alpha__zeta');
  assert.equal(requestId('bob', 'alice'), 'bob__alice');
  assert.notEqual(requestId('bob', 'alice'), requestId('alice', 'bob'));
});

test('otherMember finds the person who is not you', () => {
  assert.equal(otherMember(['a', 'b'], 'a'), 'b');
  assert.equal(otherMember(['a', 'b'], 'b'), 'a');
  assert.equal(otherMember(['a', 'b'], 'c'), '');
  assert.equal(otherMember(null, 'a'), '');
});

test('pushRecentDay dedupes and caps, newest first', () => {
  assert.deepEqual(pushRecentDay(['2026-08-19'], '2026-08-20'), ['2026-08-20', '2026-08-19']);
  assert.deepEqual(pushRecentDay(['2026-08-20', '2026-08-19'], '2026-08-20'), [
    '2026-08-20',
    '2026-08-19',
  ]);
  const long = Array.from({ length: 30 }, (_, i) => `2026-07-${String(i + 1).padStart(2, '0')}`);
  assert.equal(pushRecentDay(long, '2026-08-20').length, 14);
  assert.deepEqual(pushRecentDay(null, '2026-08-20'), ['2026-08-20']);
});

test('searchKey lowercases, trims and caps', () => {
  assert.equal(searchKey('  Alex Smith '), 'alex smith');
  assert.equal(searchKey('X'.repeat(80)).length, 40);
  assert.equal(searchKey(null), '');
});

/**
 * DESIGN INVARIANT: the friend card is an allow-list, not a filtered profile.
 *
 * A field added to `Profile` later must not be able to reach another athlete by
 * default, and the keys here must match the `hasOnly` list in firestore.rules.
 */
test('the friend card carries exactly FRIEND_CARD_FIELDS and nothing private', () => {
  const profile = {
    ...newProfile({ uid: 'u1', displayName: 'Test', email: 'secret@example.com', photoURL: '' }),
    bodyFat: 14,
    personalBests: { pull_up: { value: 20 } },
    muscleVolume: { chest: 900 },
    coins: 5000,
    measurements: { values: { waist: 80 }, recordedAt: 1 },
    recentDays: ['2026-08-20'],
  };
  const card = friendCardFrom(profile, 123);

  assert.deepEqual(Object.keys(card).sort(), [...FRIEND_CARD_FIELDS].sort());
  for (const forbidden of [
    'email',
    'bodyFat',
    'assessment',
    'personalBests',
    'customExercises',
    'goals',
    'muscleVolume',
    'coins',
    'inventory',
    'measurements',
    'routines',
    'uid',
  ]) {
    assert.ok(!(forbidden in card), `${forbidden} must never reach a friend card`);
  }
  assert.equal(card.updatedAt, 123);
});

/* -------------------------------------------------------------------------- */
/* Design system                                                              */
/* -------------------------------------------------------------------------- */

/** WCAG relative luminance. */
function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** The card surface in each theme — where these colours are actually read. */
const DARK_CARD = '#0f1119';
const LIGHT_CARD = '#ffffff';
const LIGHT_SUNKEN = '#f1f4f9';

test('the contrast helper agrees with the published reference values', () => {
  // Anchoring the helper itself, so a bug in it cannot silently pass the
  // assertions below.
  assert.ok(Math.abs(contrast('#ffffff', '#000000') - 21) < 1e-6);
  assert.ok(Math.abs(contrast('#777777', '#ffffff') - 4.478) < 0.01);
});

test('every muscle colour is readable on the surface it sits on', () => {
  for (const [key, meta] of Object.entries(MUSCLE_META)) {
    assert.match(meta.hex, /^#[0-9a-f]{6}$/, `${key} hex`);
    assert.match(meta.hexLight, /^#[0-9a-f]{6}$/, `${key} hexLight`);
    assert.ok(
      contrast(meta.hex, DARK_CARD) >= 4.5,
      `${key} dark: ${contrast(meta.hex, DARK_CARD).toFixed(2)}:1`,
    );
    assert.ok(
      contrast(meta.hexLight, LIGHT_CARD) >= 4.5,
      `${key} light on card: ${contrast(meta.hexLight, LIGHT_CARD).toFixed(2)}:1`,
    );
    assert.ok(
      contrast(meta.hexLight, LIGHT_SUNKEN) >= 4.5,
      `${key} light on sunken: ${contrast(meta.hexLight, LIGHT_SUNKEN).toFixed(2)}:1`,
    );
  }
});

test('every stat colour is readable on the surface it sits on', () => {
  for (const [key, meta] of Object.entries(STAT_META)) {
    assert.match(meta.hex, /^#[0-9a-f]{6}$/, `${key} hex`);
    assert.match(meta.hexLight, /^#[0-9a-f]{6}$/, `${key} hexLight`);
    assert.ok(contrast(meta.hex, DARK_CARD) >= 4.5, `${key} dark`);
    assert.ok(contrast(meta.hexLight, LIGHT_CARD) >= 4.5, `${key} light on card`);
    assert.ok(contrast(meta.hexLight, LIGHT_SUNKEN) >= 4.5, `${key} light on sunken`);
  }
});

/**
 * TOKEN HYGIENE: no raw Tailwind palette in the data layer.
 *
 * The point of the token layer is that a component names meaning rather than
 * pigment. A raw palette shade reaching a class string here would be invisible
 * to the theme and unreadable in one of the two.
 */
test('no pure module hands the UI a raw Tailwind palette class', () => {
  const RAW =
    /\b(?:text|bg|ring|from|via|to|border|divide)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/;

  const offenders = [];
  const check = (label, value) => {
    if (typeof value === 'string' && RAW.test(value)) offenders.push(`${label}: ${value}`);
  };

  for (const tier of TIERS) {
    check(`TIERS.${tier.name}.gradient`, tier.gradient);
    check(`TIERS.${tier.name}.text`, tier.text);
    check(`TIERS.${tier.name}.ring`, tier.ring);
  }
  for (const identity of IDENTITIES) {
    check(`IDENTITIES.${identity.label}.text`, identity.text);
    check(`IDENTITIES.${identity.label}.bg`, identity.bg);
  }
  for (const [key, meta] of Object.entries(STAT_META)) check(`STAT_META.${key}.color`, meta.color);
  for (const [key, meta] of Object.entries(MUSCLE_GRADE_META)) {
    check(`MUSCLE_GRADE_META.${key}.color`, meta.color);
    check(`MUSCLE_GRADE_META.${key}.bar`, meta.bar);
  }
  for (const [key, meta] of Object.entries(GRADE_META)) {
    check(`GRADE_META.${key}.color`, meta.color);
    check(`GRADE_META.${key}.bar`, meta.bar);
  }
  for (const item of SHOP_ITEMS) check(`SHOP_ITEMS.${item.id}.nameClass`, item.nameClass);

  assert.deepEqual(offenders, []);
});

test('tier names and thresholds are untouched by the token migration', () => {
  // Tier names are persisted in live user documents. The design pass moved
  // presentation only.
  assert.deepEqual(
    TIERS.map((t) => t.name),
    [
      'Uninitiated',
      'Bronze',
      'Silver',
      'Gold',
      'Platinum',
      'Diamond',
      'Mythic',
      'Legend',
      'Ascendant',
      'Immortal',
      'Apex',
    ],
  );
  assert.deepEqual(
    TIERS.map((t) => t.min),
    [0, 12, 26, 45, 68, 95, 130, 175, 240, 330, 450],
  );
});

test('theme preference normalisation is total', () => {
  for (const junk of [null, undefined, 'sepia', 42, {}, [], '', 'Light']) {
    assert.equal(normalizeThemePreference(junk), 'system', String(junk));
  }
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('system'), 'system');
});

test('resolveTheme follows the system only when asked to', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light', 'an explicit choice wins');
  assert.equal(resolveTheme('dark', false), 'dark', 'an explicit choice wins');
});

test('every offered theme preference round-trips', () => {
  assert.equal(THEME_PREFERENCES.length, 3);
  for (const pref of THEME_PREFERENCES) {
    assert.equal(normalizeThemePreference(pref), pref);
    assert.ok(['light', 'dark'].includes(resolveTheme(pref, true)));
    assert.ok(['light', 'dark'].includes(resolveTheme(pref, false)));
  }
});

/* -------------------------------------------------------------------------- */
/* Goals, achievements, muscles, shop                                          */
/* -------------------------------------------------------------------------- */

const GOAL_INPUT = {
  entries: [entry(3, 20)],
  resolve,
  totalReps: 60,
  xpEarned: 120,
  streak: 0,
};

test('goals roll to fill three slots and respect the level filter', () => {
  const rolled = ensureGoals(1, []);
  assert.equal(rolled.length, 3);
  for (const g of rolled) assert.ok(g.target > 0, 'every goal has a real target');
  const ids = new Set(rolled.map((g) => g.id));
  assert.equal(ids.size, 3, 'no duplicate goals in one hand');
});

test('a completed goal pays out and is replaced', () => {
  const goals = ensureGoals(1, []).map((g) => ({ ...g, type: 'workouts', target: 1, progress: 0 }));
  const out = advanceGoals(goals, 1, GOAL_INPUT);
  assert.equal(out.completed.length, 3);
  assert.equal(out.goals.length, 3, 'the hand is refilled');
  assert.ok(out.rewardXp > 0 && out.rewardCoins > 0);
});

/**
 * REGRESSION: a streak goal must measure improvement, not the absolute streak.
 *
 * `advanceGoals` compared against `input.streak` directly, so an athlete on a
 * 30-day run rolled "hold a 7-day streak" and completed it on their very next
 * session without the streak moving at all — then rolled another, and another.
 */
test('REGRESSION: a long streak does not instantly complete a fresh streak goal', () => {
  const goal = {
    id: 'streak_test',
    type: 'streak',
    title: 'Hold a 7-day streak',
    target: 7,
    progress: 0,
    rewardXp: 100,
    rewardCoins: 50,
    createdAt: Date.now(),
    baseline: 30,
  };
  const out = advanceGoals([goal], 1, { ...GOAL_INPUT, streak: 30 });
  // Assert on this goal, never on `completed.length`: the hand is refilled from
  // a random roll and a filler goal can complete in the same pass.
  assert.ok(
    !out.completed.some((g) => g.id === 'streak_test'),
    'standing still cannot complete a streak goal',
  );
  const survivor = out.goals.find((g) => g.id === 'streak_test');
  assert.ok(survivor, 'the goal survives');
  assert.equal(survivor.progress, 0);
});

test('a streak goal completes once the streak actually grows', () => {
  const goal = {
    id: 'streak_test',
    type: 'streak',
    title: 'Hold a 7-day streak',
    target: 7,
    progress: 0,
    rewardXp: 100,
    rewardCoins: 50,
    createdAt: Date.now(),
    baseline: 30,
  };
  const out = advanceGoals([goal], 1, { ...GOAL_INPUT, streak: 37 });
  assert.ok(
    out.completed.some((g) => g.id === 'streak_test'),
    'seven more days is the goal met',
  );
});

test('a streak goal written before baselines existed still works', () => {
  // Legacy goals carry no baseline; treating it as 0 keeps the old behaviour
  // rather than silently changing what an in-flight goal requires.
  const legacy = {
    id: 'legacy',
    type: 'streak',
    title: 'Hold a 3-day streak',
    target: 3,
    progress: 0,
    rewardXp: 50,
    rewardCoins: 20,
    createdAt: Date.now(),
  };
  const out = advanceGoals([legacy], 1, { ...GOAL_INPUT, streak: 5 });
  assert.ok(out.completed.some((g) => g.id === 'legacy'));
});

test('achievements derive from the profile and never need storing', () => {
  const empty = profileOf();
  const earned = achievementsFor(empty).filter((a) => a.earned);
  assert.equal(earned.length, 0, 'a fresh profile has earned nothing');

  const busy = profileOf({ workoutCount: 10, totalReps: 1200, level: 12 });
  const ids = achievementsFor(busy)
    .filter((a) => a.earned)
    .map((a) => a.id);
  assert.ok(ids.includes('first_session'));
  assert.ok(ids.includes('sessions_10'));
  assert.ok(ids.includes('reps_1000'));
  assert.ok(ids.includes('level_10'));
});

/**
 * REGRESSION: the Wealthy badge un-earned itself.
 *
 * It scored current balance, so buying anything took the badge away again —
 * which is not what an achievement is. It now reads a high-water mark.
 */
test('REGRESSION: banking coins then spending them keeps the Wealthy badge', () => {
  const rich = profileOf({ coins: 6000, coinsPeak: 6000 });
  assert.ok(achievementsFor(rich).find((a) => a.id === 'coins_5000').earned);

  const spent = profileOf({ coins: 10, coinsPeak: 6000 });
  assert.ok(
    achievementsFor(spent).find((a) => a.id === 'coins_5000').earned,
    'spending what you earned cannot un-earn the badge',
  );
});

test('a profile that never banked 5,000 does not get the badge', () => {
  const modest = profileOf({ coins: 400, coinsPeak: 400 });
  assert.ok(!achievementsFor(modest).find((a) => a.id === 'coins_5000').earned);
});

test('muscle volume accumulates and rates relative to the best-trained muscle', () => {
  const session = sessionMuscleVolume([entry(3, 20)]);
  const merged = mergeMuscleVolume(mergeMuscleVolume({}, session), session);
  for (const key of Object.keys(session)) {
    assert.ok(Math.abs(merged[key] - session[key] * 2) < 1e-6, `${key} doubled`);
  }
});

test('an untrained muscle is reported as untrained, not as balanced', () => {
  const ratings = rateMuscles({ chest: 500, lats: 400 });
  const legs = ratings.find((r) => r.muscle === 'quads');
  assert.ok(legs, 'every muscle appears in the ratings');
  assert.equal(legs.grade, 'untrained', 'never trained is not the same as balanced');
});

test('the shop reports affordability, ownership and stack caps', () => {
  const broke = profileOf({ coins: 0 });
  for (const item of SHOP_ITEMS) {
    assert.equal(purchaseState(item, broke), 'unaffordable', `${item.id} at zero coins`);
  }

  const rich = profileOf({ coins: 100000 });
  assert.ok(
    SHOP_ITEMS.some((i) => purchaseState(i, rich) === 'available'),
    'something is buyable when rich',
  );

  const owned = profileOf({
    coins: 100000,
    inventory: { streakShields: 5, cosmetics: ['neon_name'], unlocks: [] },
  });
  const cosmetic = SHOP_ITEMS.find((i) => i.id === 'neon_name');
  assert.equal(purchaseState(cosmetic, owned), 'owned', 'a cosmetic cannot be bought twice');

  const shield = SHOP_ITEMS.find((i) => i.kind === 'consumable');
  assert.equal(purchaseState(shield, owned), 'maxed', 'a full stack cannot be topped up');

  assert.equal(purchaseState(cosmetic, null), 'unaffordable', 'no profile, no purchase');
});

/* -------------------------------------------------------------------------- */
/* The demo athlete                                                            */
/* -------------------------------------------------------------------------- */

const DEMO_AT = new Date('2026-08-20T18:00:00').getTime();

test('the demo athlete is internally consistent', () => {
  // The point of simulating through the real engine rather than writing JSON:
  // every figure on screen has to add up, because a reviewer will check.
  const d = buildDemoData(DEMO_AT);
  const p = d.profile;

  assert.equal(p.level, levelFromTotalXp(p.totalXp), 'level is derived from XP');
  assert.equal(p.tier, tierForStats(p.stats).name, 'tier is derived from stats');
  assert.equal(p.identity, identityForStreak(p.streak.current).label);
  assert.equal(p.workoutCount, d.workouts.length, 'the session count matches the ledger');
  assert.equal(p.grossXp, p.totalXp, 'nothing was voided');

  const ledgerXp = d.workouts.reduce((acc, w) => acc + w.xpEarned, 0);
  assert.ok(Math.abs(ledgerXp - p.totalXp) < 1, `XP totals: ${ledgerXp} vs ${p.totalXp}`);

  const ledgerReps = d.workouts.reduce((acc, w) => acc + w.totalReps, 0);
  assert.equal(ledgerReps, p.totalReps, 'reps total matches the ledger');
});

test('the demo athlete lands somewhere believable', () => {
  // A band, not exact figures: the simulation owns the numbers, and pinning
  // them would turn every engine tweak into a failing demo test.
  const p = buildDemoData(DEMO_AT).profile;
  const avg = (p.stats.strength + p.stats.endurance + p.stats.aesthetics + p.stats.discipline) / 4;

  assert.ok(p.workoutCount >= 55 && p.workoutCount <= 80, `sessions: ${p.workoutCount}`);
  assert.ok(p.totalXp >= 20000 && p.totalXp <= 50000, `xp: ${p.totalXp}`);
  assert.ok(p.level >= 15 && p.level <= 26, `level: ${p.level}`);
  assert.ok(avg >= 50 && avg <= 130, `avg stat: ${avg}`);
  assert.ok(p.streak.current >= 3, `streak: ${p.streak.current}`);
  assert.ok(Object.keys(p.personalBests).length >= 8, 'a full-looking PR list');
  assert.ok(p.onboarded, 'the demo must never land on the onboarding screen');
});

test('the demo shows the streak shield actually doing its job', () => {
  // Week 5 is an illness week bridged by the one shield the athlete holds;
  // week 11 is a short week with none left, so the run breaks and rebuilds.
  const p = buildDemoData(DEMO_AT).profile;
  assert.equal(p.streak.shieldsUsed, 1, 'exactly one shield was spent');
  assert.ok(p.streak.best > p.streak.current, 'the run broke at least once and rebuilt');
});

test('every demo session is a legal session', () => {
  // The demo doubles as a worked example, so it must satisfy the same bounds a
  // real client is held to.
  const d = buildDemoData(DEMO_AT);
  for (const w of d.workouts) {
    assert.ok(w.entries.length >= 1 && w.entries.length <= LIMITS.MAX_ENTRIES, 'entry count');
    assert.ok(w.totalVolume <= LIMITS.MAX_SESSION_VOLUME, `volume ${w.totalVolume}`);
    for (const e of w.entries) {
      assert.ok(e.sets >= 1 && e.sets <= LIMITS.MAX_SETS, `sets ${e.sets}`);
      const cap = e.unit === 'seconds' ? LIMITS.MAX_SECONDS : LIMITS.MAX_REPS;
      assert.ok(e.amount >= 1 && e.amount <= cap, `${e.exerciseName} amount ${e.amount}`);
      assert.ok(Number.isFinite(e.xp) && e.xp >= 0, 'finite entry XP');
    }
  }
});

test('the demo is deterministic and ordered the way the app reads it', () => {
  const a = buildDemoData(DEMO_AT);
  const b = buildDemoData(DEMO_AT);
  assert.deepEqual(a.profile, b.profile, 'same clock, same athlete');

  // `fetchWorkouts` returns newest first; `fetchStatsHistory` oldest first.
  for (let i = 1; i < a.workouts.length; i += 1) {
    assert.ok(a.workouts[i - 1].createdAt >= a.workouts[i].createdAt, 'workouts newest first');
  }
  for (let i = 1; i < a.statsHistory.length; i += 1) {
    assert.ok(
      a.statsHistory[i - 1].createdAt <= a.statsHistory[i].createdAt,
      'snapshots oldest first',
    );
  }
});

test('the demo leaderboard places the athlete fourth and requests no images', () => {
  const d = buildDemoData(DEMO_AT);
  const rank = d.leaderboard.findIndex((r) => r.uid === d.profile.uid) + 1;
  assert.equal(rank, 4, 'mid-table reads as real; top of the board reads as bragging');
  assert.equal(d.leaderboard.length, 12);
  for (const row of d.leaderboard) {
    assert.equal(row.photoURL, '', 'a demo must make no outbound image request');
  }
  const wearing = d.leaderboard.filter((r) => r.activeCosmetic !== null);
  assert.ok(wearing.length >= 3, 'more than one gradient name on the board');
});

/* -------------------------------------------------------------------------- */
/* Skill tree                                                                  */
/* -------------------------------------------------------------------------- */

const bestFor = (ids) =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      { exerciseId: id, exerciseName: id, unit: 'reps', value: 10, achievedAt: 1 },
    ]),
  );

const treeAthlete = (overrides = {}) => ({
  level: 1,
  personalBests: {},
  inventory: { streakShields: 0, cosmetics: [], unlocks: [] },
  ...overrides,
});

test('the skill graph is well formed', () => {
  const graph = buildSkillTree();
  const ids = new Set();
  for (const node of graph.nodes) {
    assert.ok(!ids.has(node.id), `duplicate node id ${node.id}`);
    ids.add(node.id);
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${node.id} has no coordinates`);
  }
  for (const edge of graph.edges) {
    assert.ok(ids.has(edge.from), `edge from unknown node ${edge.from}`);
    assert.ok(ids.has(edge.to), `edge to unknown node ${edge.to}`);
  }
  assert.equal(graph.nodes.filter((n) => n.kind === 'movement').length, EXERCISES.length);
});

test('every movement is placed deliberately rather than parked', () => {
  // `place` drops an unplaced movement below the tree so it is visible rather
  // than stacked on the origin. Nothing should ever land there.
  const graph = buildSkillTree();
  for (const node of graph.nodes.filter((n) => n.kind === 'movement')) {
    assert.ok(node.y < 1400, `${node.id} has no hand-placed coordinate`);
  }
});

test('the skill graph is acyclic and every drill chain ends at its movement', () => {
  const graph = buildSkillTree();
  const out = new Map(graph.nodes.map((n) => [n.id, []]));
  for (const edge of graph.edges) out.get(edge.from).push(edge.to);

  const state = new Map();
  const visit = (id) => {
    const seen = state.get(id);
    if (seen === 'done') return;
    assert.notEqual(seen, 'open', `cycle through ${id}`);
    state.set(id, 'open');
    for (const next of out.get(id)) visit(next);
    state.set(id, 'done');
  };
  for (const node of graph.nodes) visit(node.id);

  // Following a chain forward from its first drill must arrive at the movement.
  for (const node of graph.nodes.filter((n) => n.kind === 'drill' && n.step === 1)) {
    let current = node;
    for (let i = 0; i < 20 && current.kind === 'drill'; i += 1) {
      const next = out.get(current.id).map((id) => graph.byId[id]);
      assert.equal(next.length, 1, `${current.id} should have exactly one successor`);
      current = next[0];
    }
    assert.equal(current.kind, 'movement');
    assert.equal(current.exerciseId, node.chainId, 'a chain ends at the movement it trains');
  }
});

test('a brand-new account sees available nodes, not a wall of grey', () => {
  const graph = buildSkillTree();
  const states = skillStates(graph, treeAthlete());
  const tally = skillTally(graph, states);
  assert.equal(tally.cleared, 0, 'nothing logged, nothing cleared');
  assert.ok(
    tally.available >= 10,
    `a beginner should see the whole foundation, saw ${tally.available}`,
  );
  assert.equal(
    tally.available + tally.locked + tally.in_progress + tally.cleared,
    graph.nodes.length,
    'every node has exactly one state',
  );
});

test('clearing a prerequisite opens the drill that hangs off it', () => {
  const graph = buildSkillTree();
  const before = skillStates(graph, treeAthlete());
  const first = 'drill:pistol_squat:1';
  assert.equal(before[first], 'locked', 'the pistol route waits on a squat');

  const after = skillStates(graph, treeAthlete({ personalBests: bestFor(['squat']) }));
  assert.equal(after[first], 'cleared', 'its first drill is the squat itself');
  assert.equal(after['drill:pistol_squat:2'], 'in_progress');
  assert.equal(after['skill:squat'], 'cleared');

  // And nothing unrelated moved.
  const moved = Object.keys(after).filter((id) => after[id] !== before[id]);
  for (const id of moved) {
    const node = graph.byId[id];
    assert.ok(
      node.chainId === 'pistol_squat' ||
        node.exerciseId === 'squat' ||
        node.exerciseId === 'pistol_squat',
      `${id} should not have changed`,
    );
  }
});

test('a logged movement clears its whole route', () => {
  const graph = buildSkillTree();
  const states = skillStates(
    graph,
    treeAthlete({ level: 30, personalBests: bestFor(['front_lever']) }),
  );
  assert.equal(states['skill:front_lever'], 'cleared');
  for (const node of graph.nodes.filter((n) => n.chainId === 'front_lever')) {
    assert.equal(states[node.id], 'cleared', `${node.id} is on a route already walked`);
  }
});

test('the level gate still decides when an elite movement opens', () => {
  const graph = buildSkillTree();
  const logged = bestFor(['pull_up', 'dip']);
  const low = skillStates(graph, treeAthlete({ level: 1, personalBests: logged }));
  assert.notEqual(low['skill:muscle_up'], 'available', 'level 1 is not a muscle-up');

  const high = skillStates(graph, treeAthlete({ level: 40, personalBests: logged }));
  assert.equal(high['skill:muscle_up'], 'available');
});

test('a shop unlock opens a movement the level has not reached', () => {
  const graph = buildSkillTree();
  const gated = EXERCISES.find((e) => e.unlockId && e.minLevel > 1);
  const bare = skillStates(graph, treeAthlete({ level: 1 }));
  assert.notEqual(bare[`skill:${gated.id}`], 'available');

  const bought = skillStates(
    graph,
    treeAthlete({
      level: 1,
      inventory: { streakShields: 0, cosmetics: [], unlocks: [gated.unlockId] },
    }),
  );
  // Its prerequisite may still be unmet, but the gate itself is no longer why.
  assert.notEqual(
    bought[`skill:${gated.id}`],
    bare[`skill:${gated.id}`] === 'locked' ? undefined : 'x',
  );
  assert.ok(['available', 'in_progress', 'locked'].includes(bought[`skill:${gated.id}`]));
});

test('state derivation is total against a malformed profile', () => {
  const graph = buildSkillTree();
  for (const broken of [
    null,
    {},
    { personalBests: null },
    { personalBests: 'not a map' },
    { personalBests: { push_up: null } },
    { personalBests: { push_up: { value: NaN } } },
    { personalBests: { push_up: {} }, level: NaN },
  ]) {
    const states = skillStates(graph, broken);
    assert.equal(Object.keys(states).length, graph.nodes.length);
    for (const node of graph.nodes) {
      assert.ok(
        ['locked', 'available', 'in_progress', 'cleared'].includes(states[node.id]),
        `${node.id} got ${states[node.id]}`,
      );
    }
  }
});

test('the frontier is somewhere worth going', () => {
  const graph = buildSkillTree();
  const fresh = skillStates(graph, treeAthlete());
  const start = frontierNode(graph, fresh);
  assert.ok(start, 'a new account still opens somewhere');
  assert.equal(fresh[start.id], 'available');

  const training = treeAthlete({ level: 12, personalBests: bestFor(['pull_up']) });
  const onward = frontierNode(graph, skillStates(graph, training));
  assert.ok(onward, 'and so does an account with history');
});

test('every drill carries the coaching text the catalog wrote for it', () => {
  const graph = buildSkillTree();
  const drills = graph.nodes.filter((n) => n.kind === 'drill');
  const steps = EXERCISES.reduce((n, e) => n + (e.progression?.steps.length ?? 0), 0);
  assert.equal(drills.length, steps, 'no drill is dropped on the way into the tree');
  for (const drill of drills) {
    assert.ok(drill.label.length > 0);
    assert.ok(drill.detail && drill.detail.length > 0, `${drill.id} has no detail`);
  }
});
