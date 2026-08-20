/**
 * Firestore security rules tests.
 *
 * These run against the Firestore emulator, which executes the real rules
 * engine — the rules are not merely inspected, they are enforced.
 *
 * Run with:
 *   npm run test:rules
 *
 * That wraps the emulator, so it needs the Firebase CLI available (the same
 * `firebase-tools` used to deploy) and a JVM, which the emulator requires.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';

const PROJECT_ID = 'barxp-rules-test';
const ALICE = 'alice';
const BOB = 'bob';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}`);
    console.log(`      ${error?.message?.split('\n')[0] ?? error}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** A complete, valid user document. Tests override single fields from this. */
function userDoc(overrides = {}) {
  return {
    displayName: 'Alice',
    email: 'alice@example.com',
    photoURL: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    onboarded: true,
    level: 1,
    totalXp: 0,
    coins: 100,
    stats: { strength: 10, endurance: 10, aesthetics: 10, discipline: 10 },
    tier: 'Bronze',
    identity: 'Fading',
    bodyFat: 18,
    streak: { current: 0, best: 0, lastWorkoutDay: null, shieldsUsed: 0 },
    inventory: { streakShields: 0, cosmetics: [], unlocks: [] },
    activeCosmetic: null,
    personalBests: {},
    customExercises: [],
    routines: [],
    goals: [],
    workoutCount: 0,
    totalReps: 0,
    muscleVolume: {},
    ...overrides,
  };
}

function publicDoc(overrides = {}) {
  return {
    displayName: 'Alice',
    photoURL: '',
    level: 1,
    totalXp: 0,
    tier: 'Bronze',
    streak: 0,
    activeCosmetic: null,
    cosmetics: [],
    updatedAt: Date.now(),
    ...overrides,
  };
}

function workoutDoc(uid, overrides = {}) {
  return {
    uid,
    day: '2026-08-17',
    createdAt: Date.now(),
    entries: [
      { exerciseId: 'push_up', exerciseName: 'Push-up', unit: 'reps', sets: 3, amount: 10, volume: 30, xp: 30 },
    ],
    xpEarned: 30,
    coinsEarned: 17,
    totalVolume: 30,
    totalReps: 30,
    presetId: null,
    ...overrides,
  };
}

function snapshotDoc(uid, overrides = {}) {
  return {
    uid,
    createdAt: Date.now(),
    day: '2026-08-17',
    stats: { strength: 10, endurance: 10, aesthetics: 10, discipline: 10 },
    level: 1,
    totalXp: 0,
    tier: 'Bronze',
    bodyFat: 18,
    totalReps: 0,
    streak: 0,
    source: 'workout',
    ...overrides,
  };
}

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

const alice = testEnv.authenticatedContext(ALICE).firestore();
const bob = testEnv.authenticatedContext(BOB).firestore();
const anon = testEnv.unauthenticatedContext().firestore();

/* -------------------------------------------------------------------------- */

section('users — privacy');

await test('owner can create their own profile', async () => {
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), userDoc()));
});

await test('owner can read their own profile', async () => {
  await assertSucceeds(getDoc(doc(alice, 'users', ALICE)));
});

await test('another signed-in user CANNOT read your profile', async () => {
  // This is the regression guard: the profile holds email, body fat, the
  // assessment, personal bests and per-muscle volume.
  await assertFails(getDoc(doc(bob, 'users', ALICE)));
});

await test('anonymous users cannot read a profile', async () => {
  await assertFails(getDoc(doc(anon, 'users', ALICE)));
});

await test('another user cannot write to your profile', async () => {
  await assertFails(setDoc(doc(bob, 'users', ALICE), userDoc({ displayName: 'Pwned' })));
});

await test('profiles cannot be created for someone else', async () => {
  await assertFails(setDoc(doc(bob, 'users', ALICE), userDoc()));
});

section('users — validation');

await test('XP cannot be reduced', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', ALICE), userDoc({ totalXp: 5000 }));
  });
  await assertFails(updateDoc(doc(alice, 'users', ALICE), { totalXp: 100 }));
});

await test('XP can increase', async () => {
  await assertSucceeds(updateDoc(doc(alice, 'users', ALICE), { totalXp: 6000 }));
});

await test('rejects a non-numeric stat', async () => {
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ stats: { strength: 'lots', endurance: 1, aesthetics: 1, discipline: 1 } })),
  );
});

await test('rejects a missing stat key', async () => {
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ stats: { strength: 1, endurance: 1, aesthetics: 1 } })),
  );
});

await test('rejects negative coins', async () => {
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ coins: -50 })));
});

await test('rejects a level above the cap', async () => {
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ level: 500 })));
});

await test('rejects body fat outside the accepted range', async () => {
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ bodyFat: 95 })));
});

await test('rejects more streak shields than the shop allows', async () => {
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ inventory: { streakShields: 99, cosmetics: [], unlocks: [] } })),
  );
});

await test('rejects a malformed lastWorkoutDay', async () => {
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ streak: { current: 1, best: 1, lastWorkoutDay: 'yesterday', shieldsUsed: 0 } })),
  );
});

await test('accepts a well-formed lastWorkoutDay', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, streak: { current: 1, best: 1, lastWorkoutDay: '2026-08-17', shieldsUsed: 0 } })),
  );
});

await test('rejects an empty display name', async () => {
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ displayName: '' })));
});

await test('accepts a display name at the 40-character limit', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, displayName: 'x'.repeat(40) })),
  );
});

await test('rejects a display name one character over the limit', async () => {
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, displayName: 'x'.repeat(41) })),
  );
});

await test('the nameFixedAt repair marker is accepted on the user document', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, nameFixedAt: Date.now() })),
  );
});

await test('accepts a routine list', async () => {
  const routines = [
    {
      id: 'routine_abc',
      name: 'Push Day',
      items: [{ exerciseId: 'push_up', reps: [12, 10, 8] }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, routines })));
});

await test('rejects more routines than the limit', async () => {
  const routines = Array.from({ length: 13 }, (_, i) => ({
    id: `routine_${i}`,
    name: `Day ${i}`,
    items: [{ exerciseId: 'push_up', reps: [10] }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, routines })));
});

await test('a document without routines is still valid', async () => {
  // The live-data guarantee: no account has this field until it saves one.
  const withoutRoutines = userDoc({ totalXp: 6000 });
  delete withoutRoutines.routines;
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), withoutRoutines));
});

await test('profiles cannot be deleted', async () => {
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(doc(alice, 'users', ALICE)));
});

section('users — body measurements and preferences');

await test('accepts a well-formed measurement block', async () => {
  await assertSucceeds(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({
        totalXp: 6000,
        measurements: { values: { bodyweight: 82.4, chest: 104 }, recordedAt: Date.now() },
      }),
    ),
  );
});

await test('rejects a measurement outside the sanity bounds', async () => {
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ totalXp: 6000, measurements: { values: { bodyweight: 900 }, recordedAt: Date.now() } }),
    ),
  );
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ totalXp: 6000, measurements: { values: { chest: 300 }, recordedAt: Date.now() } }),
    ),
  );
});

await test('rejects an unknown measurement site', async () => {
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ totalXp: 6000, measurements: { values: { neck: 40 }, recordedAt: Date.now() } }),
    ),
  );
});

await test('rejects an extra key on the measurement block', async () => {
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ totalXp: 6000, measurements: { values: {}, recordedAt: Date.now(), note: 'x' } }),
    ),
  );
});

await test('accepts the display preferences, rejects junk in them', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, gymBroMode: false, unitSystem: 'imperial' })),
  );
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, gymBroMode: 'yes' })));
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 6000, unitSystem: 'furlongs' })));
});

await test('a document predating measurements still validates', async () => {
  // `userDoc()` deliberately carries none of the three new keys, so every other
  // assertion in this file doubles as a legacy-compatibility check. This one
  // says so explicitly.
  const legacy = userDoc({ totalXp: 6000 });
  assert.ok(!('measurements' in legacy));
  assert.ok(!('gymBroMode' in legacy));
  assert.ok(!('unitSystem' in legacy));
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), legacy));
});

section('public_profiles — the leaderboard projection');

await test('owner can write their own public row', async () => {
  await assertSucceeds(setDoc(doc(alice, 'public_profiles', ALICE), publicDoc()));
});

await test('other signed-in users CAN read it (leaderboard)', async () => {
  await assertSucceeds(getDoc(doc(bob, 'public_profiles', ALICE)));
});

await test('the leaderboard query works', async () => {
  await assertSucceeds(getDocs(query(collection(bob, 'public_profiles'), orderBy('totalXp', 'desc'))));
});

await test('anonymous users cannot read the leaderboard', async () => {
  await assertFails(getDoc(doc(anon, 'public_profiles', ALICE)));
});

await test('you cannot write someone else\'s public row', async () => {
  await assertFails(setDoc(doc(bob, 'public_profiles', ALICE), publicDoc({ displayName: 'Pwned' })));
});

await test('private fields cannot be smuggled into the public row', async () => {
  // The `hasOnly` allow-list is what makes this fail.
  await assertFails(setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ email: 'alice@example.com' })));
});

await test('body fat cannot be smuggled into the public row', async () => {
  await assertFails(setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ bodyFat: 12 })));
});

await test('measurements cannot be smuggled into the public row', async () => {
  await assertFails(
    setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ measurements: { waist: 82 } })),
  );
});

await test('rejects an over-long display name in the public row', async () => {
  await assertFails(setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ displayName: 'x'.repeat(120) })));
});

section('workouts — private and immutable');

await test('owner can create a workout', async () => {
  await assertSucceeds(setDoc(doc(alice, 'workouts', 'w1'), workoutDoc(ALICE)));
});

await test('accepts a workout entry carrying a per-set ladder', async () => {
  const entries = [
    { exerciseId: 'push_up', exerciseName: 'Push-up', unit: 'reps',
      sets: 3, amount: 12, volume: 30, reps: [12, 10, 8], xp: 30 },
  ];
  await assertSucceeds(
    setDoc(doc(alice, 'workouts', 'w_ladder'), workoutDoc(ALICE, { entries })),
  );
});

await test('owner can read their own workout', async () => {
  await assertSucceeds(getDoc(doc(alice, 'workouts', 'w1')));
});

await test('another user cannot read your workouts', async () => {
  await assertFails(getDoc(doc(bob, 'workouts', 'w1')));
});

await test('workouts cannot be edited once written', async () => {
  await assertFails(updateDoc(doc(alice, 'workouts', 'w1'), { xpEarned: 999999 }));
});

await test('workouts cannot be deleted', async () => {
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(doc(alice, 'workouts', 'w1')));
});

await test('cannot create a workout owned by someone else', async () => {
  await assertFails(setDoc(doc(bob, 'workouts', 'w2'), workoutDoc(ALICE)));
});

section('workouts — anti-cheat bounds mirror validation.ts');

await test('rejects total volume above the session cap', async () => {
  await assertFails(setDoc(doc(alice, 'workouts', 'w3'), workoutDoc(ALICE, { totalVolume: 999999 })));
});

await test('rejects more than 12 exercises', async () => {
  const entries = Array.from({ length: 13 }, () => ({
    exerciseId: 'push_up', exerciseName: 'Push-up', unit: 'reps', sets: 1, amount: 1, volume: 1, xp: 1,
  }));
  await assertFails(setDoc(doc(alice, 'workouts', 'w4'), workoutDoc(ALICE, { entries })));
});

await test('rejects an empty session', async () => {
  await assertFails(setDoc(doc(alice, 'workouts', 'w5'), workoutDoc(ALICE, { entries: [] })));
});

await test('rejects a malformed day key', async () => {
  await assertFails(setDoc(doc(alice, 'workouts', 'w6'), workoutDoc(ALICE, { day: '17/08/2026' })));
});

await test('rejects negative XP', async () => {
  await assertFails(setDoc(doc(alice, 'workouts', 'w7'), workoutDoc(ALICE, { xpEarned: -5 })));
});

section('stats_history — private, append-only');

await test('owner can create a snapshot', async () => {
  await assertSucceeds(setDoc(doc(alice, 'stats_history', 's1'), snapshotDoc(ALICE)));
});

await test('another user cannot read your snapshots', async () => {
  await assertFails(getDoc(doc(bob, 'stats_history', 's1')));
});

await test('snapshots cannot be edited', async () => {
  await assertFails(updateDoc(doc(alice, 'stats_history', 's1'), { totalXp: 999999 }));
});

await test('rejects an unknown source', async () => {
  await assertFails(setDoc(doc(alice, 'stats_history', 's2'), snapshotDoc(ALICE, { source: 'hacked' })));
});

await test('accepts a measurement snapshot', async () => {
  await assertSucceeds(
    setDoc(
      doc(alice, 'stats_history', 's3'),
      snapshotDoc(ALICE, { source: 'measurement', measurements: { waist: 82 } }),
    ),
  );
});

await test('rejects an out-of-range measurement on a snapshot', async () => {
  await assertFails(
    setDoc(
      doc(alice, 'stats_history', 's4'),
      snapshotDoc(ALICE, { source: 'measurement', measurements: { waist: 900 } }),
    ),
  );
});

section('everything else is denied');

await test('unknown collections are closed', async () => {
  await assertFails(setDoc(doc(alice, 'admin_secrets', 'x'), { anything: true }));
  await assertFails(getDoc(doc(alice, 'admin_secrets', 'x')));
});

/* -------------------------------------------------------------------------- */

await testEnv.cleanup();

console.log(`\n${'='.repeat(48)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log('='.repeat(48));

assert.equal(failed, 0, `${failed} security rule test(s) failed`);
