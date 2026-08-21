/**
 * Replay every real write path in `src/lib/data.ts` against the live rules.
 *
 * The rules suite proves each *rule* works. This proves the *application* can
 * still write — which is a different question, and the one that breaks when a
 * rule is tightened. It caught two genuine regressions while slice 8 was being
 * written: a `hasOnly` allow-list that blew Firestore's 1,000-expression
 * request budget and denied onboarding outright, and a pair of additions that
 * together tipped the same budget over on any session carrying two body
 * measurements.
 *
 * Run with:  firebase emulators:exec --only firestore "node scripts/check-write-paths.mjs"
 */
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-write-paths',
  firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});
const A = 'alice';
const alice = testEnv.authenticatedContext(A).firestore();

// Exactly what newProfile writes, minus the four keys ensureProfile strips.
const fresh = {
  displayName: 'Alice',
  email: 'a@example.com',
  photoURL: '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  onboarded: false,
  assessment: null,
  level: 1,
  xpVoided: 0,
  totalXp: 0,
  coins: 100,
  coinsPeak: 100,
  stats: { strength: 0, endurance: 0, aesthetics: 0, discipline: 0 },
  tier: 'Uninitiated',
  identity: 'Fading',
  bodyFat: 0,
  measurements: null,
  unitSystem: 'metric',
  gymBroMode: true,
  streak: {
    current: 0,
    best: 0,
    lastWorkoutDay: null,
    shieldsUsed: 0,
    weekKey: null,
    daysThisWeek: 0,
    model: 'daily',
  },
  inventory: { streakShields: 0, cosmetics: [], unlocks: [] },
  activeCosmetic: null,
  personalBests: {},
  customExercises: [],
  routines: [],
  goals: [],
  workoutCount: 0,
  totalReps: 0,
  muscleVolume: {},
  season: { id: '2026-S3', xp: 0, sessions: 0, startedAt: Date.now() },
  seasonHistory: [],
  recentDays: [],
};

/**
 * The same account after a few months of training.
 *
 * The baseline used to be `fresh` — an empty profile — and that is precisely
 * why this suite stayed green through an outage that rejected every write in
 * the live app. Firestore's 1,000-expression budget is spent on the *rules*,
 * not on the data, but a clause that short-circuits on an absent or one-key
 * field costs nothing on an empty document and a hundred expressions on a real
 * one. `measurements: null` alone was the difference between passing here and
 * failing for every athlete who had ever picked up a tape measure.
 *
 * So the baseline is now a lived-in account: every optional field present,
 * every measurement site filled in, collections populated.
 */
const lived = {
  ...fresh,
  onboarded: true,
  photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocKq1234567890abcdefghij=s96-c',
  assessment: {
    maxPullUps: 8,
    maxPushUps: 30,
    plankSeconds: 90,
    bodyFat: 20,
    completedAt: Date.now(),
  },
  level: 5,
  totalXp: 2400,
  coins: 107,
  coinsPeak: 340,
  stats: { strength: 24.5, endurance: 18.2, aesthetics: 15.9, discipline: 12.4 },
  tier: 'Gold',
  identity: 'Stirring',
  bodyFat: 20,
  measurements: {
    values: {
      bodyweight: 80,
      chest: 105,
      back: 110,
      waist: 95.2,
      biceps: 41,
      thighs: 62,
      calves: 39,
    },
    recordedAt: Date.now(),
  },
  streak: {
    current: 4,
    best: 11,
    lastWorkoutDay: '2026-08-20',
    shieldsUsed: 1,
    weekKey: '2026-08-17',
    daysThisWeek: 3,
    model: 'daily',
  },
  inventory: { streakShields: 1, cosmetics: ['neon_name'], unlocks: ['unlock_muscle_up'] },
  activeCosmetic: 'neon_name',
  personalBests: Object.fromEntries(
    [
      'push_up',
      'pull_up',
      'dip',
      'squat',
      'plank',
      'chin_up',
      'lunge',
      'burpee',
      'row',
      'leg_raise',
    ].map((id) => [
      id,
      { exerciseId: id, exerciseName: id, unit: 'reps', value: 30, achievedAt: Date.now() },
    ]),
  ),
  customExercises: [
    { id: 'c1', name: 'Vest Push-up', unit: 'reps', xpPerUnit: 1.6, category: 'push' },
  ],
  routines: [{ id: 'r1', name: 'Day A', items: [], createdAt: Date.now(), updatedAt: Date.now() }],
  goals: [1, 2, 3].map((i) => ({ id: `g${i}`, templateId: `t${i}`, target: 500, progress: 120 })),
  workoutCount: 24,
  totalReps: 4120,
  muscleVolume: Object.fromEntries(
    [
      'chest',
      'shoulders',
      'triceps',
      'biceps',
      'forearms',
      'lats',
      'upper_back',
      'abs',
      'obliques',
      'lower_back',
      'glutes',
      'quads',
      'hamstrings',
      'calves',
    ].map((m) => [m, 1234.5]),
  ),
  season: { id: '2026-S3', xp: 900, sessions: 6, startedAt: Date.now() },
  seasonHistory: [
    {
      id: '2026-S2',
      xp: 1200,
      sessions: 20,
      rank: 3,
      entrants: 11,
      pending: false,
      endedAt: Date.now(),
    },
  ],
  recentDays: ['2026-08-20', '2026-08-19', '2026-08-17'],
};

const results = [];
// Each path is checked from the same known baseline: a stateful sequence makes
// one failure cascade into four and hides which write is actually at fault.
async function reset(overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', A), { ...lived, ...overrides });
  });
}
async function step(label, fn, overrides) {
  await reset(overrides);
  try {
    await fn();
    results.push(['OK  ', label]);
  } catch (e) {
    results.push(['FAIL', label + ' :: ' + String(e.message).slice(0, 180)]);
  }
}

await step('ensureProfile create (newProfile shape)', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(ctx.firestore(), 'users', A));
  });
  await setDoc(doc(alice, 'users', A), fresh);
});
await step('ensureProfile repair patch', () =>
  updateDoc(doc(alice, 'users', A), {
    displayName: 'Alice',
    nameFixedAt: Date.now(),
    photoURL: '',
    updatedAt: Date.now(),
  }),
);
await step('completeAssessment update', () =>
  updateDoc(doc(alice, 'users', A), {
    onboarded: true,
    assessment: {
      maxPullUps: 5,
      maxPushUps: 20,
      plankSeconds: 60,
      bodyFat: 18,
      completedAt: Date.now(),
    },
    stats: { strength: 10, endurance: 8, aesthetics: 6, discipline: 4 },
    tier: 'Bronze',
    bodyFat: 18,
    identity: 'Fading',
    goals: [],
    measurements: {
      values: {
        bodyweight: 82,
        chest: 104,
        back: 109,
        waist: 96,
        biceps: 40,
        thighs: 61,
        calves: 38,
      },
      recordedAt: Date.now(),
    },
    updatedAt: Date.now(),
  }),
);
// The widest write the app makes: sixteen validated fields in one update, on
// top of the lived-in baseline. If anything is ever going to hit the
// expression budget, it is this.
await step('logWorkout update', () =>
  updateDoc(doc(alice, 'users', A), {
    totalXp: 2470,
    level: 5,
    coins: 127,
    coinsPeak: 340,
    stats: { strength: 25, endurance: 19, aesthetics: 16, discipline: 13 },
    tier: 'Gold',
    identity: 'Stirring',
    streak: {
      current: 5,
      best: 11,
      lastWorkoutDay: '2026-08-21',
      shieldsUsed: 1,
      weekKey: '2026-08-17',
      daysThisWeek: 4,
      model: 'daily',
    },
    personalBests: {
      push_up: {
        exerciseId: 'push_up',
        exerciseName: 'Push-up',
        unit: 'reps',
        value: 41,
        achievedAt: Date.now(),
      },
    },
    goals: [{ id: 'g1', templateId: 't1', target: 500, progress: 260 }],
    workoutCount: 25,
    totalReps: 4174,
    muscleVolume: { chest: 1300, triceps: 900 },
    season: { id: '2026-S3', xp: 970, sessions: 7, startedAt: Date.now() },
    seasonHistory: [{ id: '2026-S2', xp: 1200, sessions: 20, rank: 3, entrants: 11 }],
    recentDays: ['2026-08-21', '2026-08-20'],
    updatedAt: Date.now(),
  }),
);
await step(
  'voidWorkout update',
  () =>
    updateDoc(doc(alice, 'users', A), {
      xpVoided: 100,
      level: 2,
      coins: 120,
      stats: { strength: 12, endurance: 10, aesthetics: 7, discipline: 5 },
      tier: 'Bronze',
      totalReps: 30,
      workoutCount: 0,
      muscleVolume: {},
      updatedAt: Date.now(),
    }),
  // A correction only ever runs against a profile that has XP to give back.
  { totalXp: 5000, level: 5, coins: 200 },
);
await step('updateBodyFat update', () =>
  updateDoc(doc(alice, 'users', A), {
    bodyFat: 16,
    stats: { strength: 12, endurance: 10, aesthetics: 9, discipline: 5 },
    tier: 'Bronze',
    updatedAt: Date.now(),
  }),
);
await step('recordMeasurements update', () =>
  updateDoc(doc(alice, 'users', A), {
    measurements: {
      values: {
        bodyweight: 83,
        chest: 106,
        back: 111,
        waist: 94,
        biceps: 42,
        thighs: 63,
        calves: 40,
      },
      recordedAt: Date.now(),
    },
    updatedAt: Date.now(),
  }),
);
await step('updatePreferences update', () =>
  updateDoc(doc(alice, 'users', A), {
    unitSystem: 'imperial',
    gymBroMode: false,
    updatedAt: Date.now(),
  }),
);
await step('saveRoutine update', () =>
  updateDoc(doc(alice, 'users', A), {
    routines: [
      {
        id: 'r1',
        name: 'Day A',
        items: [{ exerciseId: 'push_up', reps: [10] }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    updatedAt: Date.now(),
  }),
);
await step('addCustomExercise update', () =>
  updateDoc(doc(alice, 'users', A), {
    customExercises: [
      { id: 'c1', name: 'Sled Push', unit: 'reps', xpPerUnit: 1, category: 'conditioning' },
    ],
    updatedAt: Date.now(),
  }),
);
await step('purchase (cosmetic) update', () =>
  updateDoc(doc(alice, 'users', A), {
    coins: 20,
    inventory: { streakShields: 0, cosmetics: ['neon_name'], unlocks: [] },
    activeCosmetic: 'neon_name',
    updatedAt: Date.now(),
  }),
);
await step('background recalculation patch', () =>
  updateDoc(doc(alice, 'users', A), {
    tier: 'Bronze',
    identity: 'Stirring',
    season: { id: '2026-S4', xp: 0, sessions: 0, startedAt: Date.now() },
    seasonHistory: [
      {
        id: '2026-S3',
        xp: 400,
        sessions: 1,
        rank: 0,
        entrants: 0,
        pending: true,
        endedAt: Date.now(),
      },
    ],
    updatedAt: Date.now(),
  }),
);

for (const [tag, msg] of results) console.log(tag, msg);
console.log(
  results.some(([t]) => t === 'FAIL') ? '>>> SOME WRITE PATHS BROKEN' : '>>> ALL WRITE PATHS OK',
);
await testEnv.cleanup();
process.exit(results.some(([t]) => t === 'FAIL') ? 1 : 0);
