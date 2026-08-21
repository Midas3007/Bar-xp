import type {
  Goal,
  LeaderboardRow,
  Profile,
  Stats,
  StatsSnapshot,
  Workout,
  WorkoutEntry,
} from '../types';
import { round } from '../safe';
import { STAT_KEYS, identityForStreak, levelFromTotalXp, tierForStats } from '../game/constants';
import { aestheticsFromBodyFat, buildEntry, scoreSession } from '../game/xp';
import { EMPTY_STREAK, dayKey, registerWorkout, safeStreak, settleStreak } from '../game/streak';
import { baselineStats } from '../game/profile';
import { advanceGoals, ensureGoals } from '../game/goals';
import { exerciseById } from '../game/exercises';
import { mergeMuscleVolume, sessionMuscleVolume, type MuscleVolume } from '../game/muscles';
import { seasonIdFor } from '../game/season';

/**
 * The demo athlete.
 *
 * Not hand-written JSON: eighteen weeks of training are simulated *through the
 * real game functions*, so every number on screen is internally consistent by
 * construction. `totalXp` is the sum of the sessions, `level` is
 * `levelFromTotalXp` of it, the stat curve is the arithmetic `logWorkout`
 * performs, muscle volume comes from `sessionMuscleVolume`, and the streak is
 * whatever `registerWorkout` and `settleStreak` actually produce for this
 * schedule. A reviewer poking at the demo finds no seam.
 *
 * Pure: no React, no Firebase, no `import.meta`. That is what lets
 * `npm run test:game` compile it and assert the result lands somewhere
 * believable.
 */

export const DEMO_UID = 'demo-athlete';
export const DEMO_NAME = 'Ray Calder';

export interface DemoData {
  profile: Profile;
  /** Newest first — matches `fetchWorkouts`. */
  workouts: Workout[];
  /** Oldest first — matches `fetchStatsHistory`. */
  statsHistory: StatsSnapshot[];
  /** Highest XP first — matches `fetchLeaderboard`. */
  leaderboard: LeaderboardRow[];
}

/** Seeded PRNG, so the same `now` always yields the same athlete. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TemplateItem {
  id: string;
  sets: number;
  amount: number;
}

/**
 * Four rotating sessions. `plank`, `hollow_hold` and `jump_rope` are seconds
 * movements and the rest are reps — the XP rates differ by an order of
 * magnitude, so the units are not interchangeable.
 *
 * Every template stays inside `LIMITS`, since the demo doubles as a worked
 * example of a legal session.
 */
const TEMPLATES: TemplateItem[][] = [
  [
    { id: 'push_up', sets: 4, amount: 20 },
    { id: 'dip', sets: 4, amount: 8 },
    { id: 'pike_push_up', sets: 3, amount: 10 },
    { id: 'plank', sets: 3, amount: 50 },
  ],
  [
    { id: 'pull_up', sets: 5, amount: 6 },
    { id: 'australian_row', sets: 4, amount: 12 },
    { id: 'chin_up', sets: 3, amount: 6 },
    { id: 'hollow_hold', sets: 3, amount: 40 },
  ],
  [
    { id: 'squat', sets: 5, amount: 20 },
    { id: 'lunge', sets: 4, amount: 14 },
    { id: 'leg_raise', sets: 3, amount: 14 },
    { id: 'jump_rope', sets: 3, amount: 120 },
  ],
  [
    { id: 'push_up', sets: 4, amount: 22 },
    { id: 'pull_up', sets: 4, amount: 7 },
    { id: 'burpee', sets: 4, amount: 12 },
    { id: 'hanging_knee_raise', sets: 3, amount: 12 },
  ],
];

const WEEKS = 18;
/** Monday, Tuesday, Thursday, Saturday — four days, so an ordinary week holds the streak. */
const TRAINING_OFFSETS = [0, 1, 3, 5];

const resolve = (id: string) => exerciseById(id);

function toDayKey(date: Date): string {
  return dayKey(date);
}

/** Pure and deterministic given `now`. */
export function buildDemoData(now: number = Date.now()): DemoData {
  const rng = mulberry32(20260820);
  const today = new Date(now);
  today.setHours(18, 0, 0, 0);

  // Monday of the first week, 17 weeks back.
  const start = new Date(today);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday - (WEEKS - 1) * 7);

  const seed = { maxPullUps: 6, maxPushUps: 24, plankSeconds: 60, bodyFat: 21 };
  const stats: Stats = { ...baselineStats(seed) };
  let bodyFat = seed.bodyFat;
  let totalXp = 0;
  let coins = 100;
  let totalReps = 0;
  let workoutCount = 0;
  let shields = 1;
  let streak = { ...EMPTY_STREAK };
  let goals: Goal[] = ensureGoals(1, [], rng);
  let muscleVolume: MuscleVolume = {};

  const workouts: Workout[] = [];
  const statsHistory: StatsSnapshot[] = [];

  // The baseline snapshot, exactly as `completeAssessment` writes it.
  statsHistory.push({
    id: 'demo-s-assessment',
    uid: DEMO_UID,
    createdAt: start.getTime(),
    day: toDayKey(start),
    stats: { ...stats },
    level: 1,
    totalXp: 0,
    tier: tierForStats(stats).name,
    bodyFat,
    totalReps: 0,
    streak: 0,
    source: 'assessment',
    measurements: null,
  });

  for (let week = 0; week < WEEKS; week += 1) {
    // Week 5 is illness — two sessions, bridged by the one shield the athlete
    // holds, so `shieldsUsed` ends at 1 and the mechanic is visibly working.
    // Week 11 is another short week with no shield left, so the streak breaks
    // and rebuilds, which is what a real eighteen weeks looks like.
    const offsets = week === 4 || week === 10 ? TRAINING_OFFSETS.slice(0, 2) : TRAINING_OFFSETS;

    for (const offset of offsets) {
      const when = new Date(start);
      when.setDate(start.getDate() + week * 7 + offset);
      when.setHours(18, 30, 0, 0);
      if (when.getTime() > now) continue;

      const day = toDayKey(when);
      const template = TEMPLATES[(week * 4 + offset) % TEMPLATES.length];

      const entries: WorkoutEntry[] = [];
      for (const item of template) {
        const exercise = resolve(item.id);
        if (!exercise) continue;
        // Progressive overload plus jitter, on `amount` only.
        const amount = Math.max(
          1,
          Math.round(item.amount * (1 + 0.012 * week) * (0.94 + rng() * 0.12)),
        );
        entries.push(buildEntry(exercise, item.sets, amount));
      }
      if (entries.length === 0) continue;

      const before = safeStreak(streak);
      const totals = scoreSession(entries, resolve, before.current);

      // Settle first so shield consumption is observable, then register the day.
      const settled = settleStreak(before, shields, day);
      shields = Math.max(0, shields - settled.shieldsConsumed);
      streak = registerWorkout(settled.streak, day, shields);

      const goalOutcome = advanceGoals(goals, levelFromTotalXp(totalXp), {
        entries,
        resolve,
        xpEarned: totals.xp,
        totalReps: totals.totalReps,
        streak: streak.current,
        rng,
      });
      goals = goalOutcome.goals;

      const xpEarned = totals.xp + goalOutcome.rewardXp;
      const coinsEarned = totals.coins + goalOutcome.rewardCoins;
      totalXp += xpEarned;
      coins += coinsEarned;
      totalReps += totals.totalReps;
      workoutCount += 1;

      for (const key of STAT_KEYS) {
        stats[key] = round(stats[key] + totals.statGains[key], 3);
      }
      stats.discipline = round(stats.discipline + Math.min(streak.current * 0.05, 1.5), 3);
      muscleVolume = mergeMuscleVolume(muscleVolume, sessionMuscleVolume(entries));

      workouts.push({
        id: `demo-w-${workoutCount}`,
        uid: DEMO_UID,
        day,
        createdAt: when.getTime(),
        entries,
        xpEarned,
        coinsEarned,
        totalVolume: totals.totalVolume,
        totalReps: totals.totalReps,
        presetId: null,
        kind: 'session',
        correctsId: null,
      });

      statsHistory.push({
        id: `demo-s-${workoutCount}`,
        uid: DEMO_UID,
        createdAt: when.getTime(),
        day,
        stats: { ...stats },
        level: levelFromTotalXp(totalXp),
        totalXp,
        tier: tierForStats(stats).name,
        bodyFat,
        totalReps,
        streak: streak.current,
        source: 'workout',
        measurements: null,
      });
    }

    // A body-fat reading every fourth week, drifting 21% -> 14.5%, applied the
    // way `updateBodyFat` applies it.
    if (week > 0 && week % 4 === 0) {
      bodyFat = round(Math.max(14.5, 21 - (week / 4) * 1.65), 1);
      stats.aesthetics = aestheticsFromBodyFat(bodyFat, stats.aesthetics);
      const when = new Date(start);
      when.setDate(start.getDate() + week * 7 + 6);
      when.setHours(9, 0, 0, 0);
      if (when.getTime() <= now) {
        statsHistory.push({
          id: `demo-s-bf-${week}`,
          uid: DEMO_UID,
          createdAt: when.getTime(),
          day: toDayKey(when),
          stats: { ...stats },
          level: levelFromTotalXp(totalXp),
          totalXp,
          tier: tierForStats(stats).name,
          bodyFat,
          totalReps,
          streak: streak.current,
          source: 'assessment',
          measurements: null,
        });
      }
    }
  }

  // Personal bests: the best single-set amount per movement, scanned from the
  // sessions themselves. `mergePersonalBests` is module-private in `data.ts`
  // and a six-line derivation is cheaper than widening that API.
  const personalBests: Profile['personalBests'] = {};
  for (const workout of workouts) {
    for (const entry of workout.entries) {
      const current = personalBests[entry.exerciseId];
      if (current && current.value >= entry.amount) continue;
      personalBests[entry.exerciseId] = {
        exerciseId: entry.exerciseId,
        exerciseName: entry.exerciseName,
        unit: entry.unit,
        value: entry.amount,
        achievedAt: workout.createdAt,
      };
    }
  }

  // `templateToGoal` stamps ids from the wall clock, which the seeded RNG does
  // not control. Restamp deterministically so two builds at the same `now`
  // produce byte-identical profiles.
  goals = goals.map((g, i) => ({ ...g, id: `demo-goal-${i}`, createdAt: start.getTime() }));

  const level = levelFromTotalXp(totalXp);
  const tier = tierForStats(stats).name;
  const identity = identityForStreak(streak.current).label;

  const profile: Profile = {
    uid: DEMO_UID,
    displayName: DEMO_NAME,
    email: '',
    photoURL: '',
    createdAt: start.getTime(),
    updatedAt: now,

    onboarded: true,
    assessment: { ...seed, completedAt: start.getTime() },

    level,
    grossXp: totalXp,
    xpVoided: 0,
    totalXp,
    coins,

    stats,
    tier,
    identity,
    storedTier: tier,
    storedIdentity: identity,
    bodyFat,
    measurements: {
      values: {
        bodyweight: 78.4,
        chest: 104,
        back: 111,
        waist: 79,
        biceps: 37,
        thighs: 58,
        calves: 38,
      },
      recordedAt: now,
    },
    unitSystem: 'metric',
    gymBroMode: true,

    streak,
    inventory: { streakShields: shields, cosmetics: ['neon_name'], unlocks: ['unlock_muscle_up'] },
    activeCosmetic: 'neon_name',

    personalBests,
    customExercises: [
      {
        id: 'custom_demo',
        name: 'Weighted Vest Push-up',
        unit: 'reps',
        xpPerUnit: 1.6,
        category: 'push',
      },
    ],
    routines: [],
    goals,

    workoutCount,
    totalReps,
    muscleVolume: muscleVolume as Record<string, number>,

    season: {
      id: seasonIdFor(today),
      xp: Math.round(totalXp * 0.22),
      sessions: 14,
      startedAt: now,
    },
    seasonHistory: [],
    recentDays: workouts.slice(0, 14).map((w) => w.day),
    coinsPeak: coins,
  };

  return {
    profile,
    // `fetchWorkouts` orders newest first; `fetchStatsHistory` oldest first.
    workouts: [...workouts].reverse(),
    statsHistory,
    leaderboard: buildLeaderboard(profile),
  };
}

/**
 * Twelve rows with the demo athlete fourth.
 *
 * `photoURL` is empty on every row: a demo must not make an outbound image
 * request. Two other athletes wear a cosmetic, so the leaderboard shows more
 * than one gradient name.
 */
function buildLeaderboard(profile: Profile): LeaderboardRow[] {
  const others: Array<[string, number, string, number, string | null]> = [
    ['Mara Vance', 44200, 'Diamond', 22, 'ember_name'],
    ['Tobi Ashworth', 39850, 'Diamond', 9, null],
    ['Ines Okafor', 35900, 'Diamond', 31, 'void_name'],
    ['Dan Whitlock', 28980, 'Platinum', 5, null],
    ['Priya Raman', 21440, 'Gold', 12, null],
    ['Aksel Nordvik', 18760, 'Gold', 3, null],
    ['Chen Wei', 15230, 'Gold', 18, null],
    ['Sofia Marchetti', 12100, 'Silver', 7, null],
    ['Jonah Beck', 9440, 'Silver', 2, null],
    ['Layla Haddad', 7320, 'Silver', 11, null],
    ['Emeka Nwosu', 5180, 'Bronze', 4, null],
  ];

  const rows: LeaderboardRow[] = others.map(([displayName, xp, tier, streak, cosmetic], i) => ({
    uid: `demo-rival-${i}`,
    displayName,
    photoURL: '',
    level: levelFromTotalXp(xp),
    totalXp: xp,
    tier,
    streak,
    activeCosmetic: cosmetic,
    cosmetics: cosmetic ? [cosmetic] : [],
    seasonId: '',
    seasonXp: Math.round(xp * 0.2),
  }));

  rows.push({
    uid: profile.uid,
    displayName: profile.displayName,
    photoURL: '',
    level: profile.level,
    totalXp: profile.totalXp,
    tier: profile.tier,
    streak: profile.streak.current,
    activeCosmetic: profile.activeCosmetic,
    cosmetics: profile.inventory.cosmetics,
    seasonId: profile.season.id,
    seasonXp: profile.season.xp,
  });

  return rows.sort((a, b) => b.totalXp - a.totalXp);
}

let cached: DemoData | null = null;

/** Built once per page load; every view reads the same object. */
export function getDemoData(): DemoData {
  if (!cached) cached = buildDemoData();
  return cached;
}
