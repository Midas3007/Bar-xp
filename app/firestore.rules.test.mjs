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
import { doc, deleteDoc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy, writeBatch } from 'firebase/firestore';

const PROJECT_ID = 'barxp-rules-test';
const ALICE = 'alice';
const BOB = 'bob';
const CAROL = 'carol';

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

/**
 * Put Alice's document back to a known baseline, with rules disabled.
 *
 * This suite runs every assertion against one database, and an early test
 * leaves `totalXp` high. Because a `setDoc` over an existing document is
 * evaluated as an *update*, the monotonic-XP clause then rejects any later
 * fixture defaulting to zero **before the field under test is ever reached** —
 * so the test passes while proving nothing. Resetting is the fix; threading
 * `totalXp: 6000` through each fixture only hides the coupling until the next
 * person adds a test.
 */
async function resetAlice(overrides = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', ALICE), userDoc(overrides));
  });
}

/**
 * The leaderboard row, matching `userDoc()` field for field.
 *
 * The rules now cross-read the private document, so these two fixtures have to
 * agree — which is the whole guarantee: a row that disagrees with the profile
 * it claims to mirror is a forged row.
 */
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

function friendCardDoc(overrides = {}) {
  return {
    displayName: 'Alice',
    photoURL: '',
    level: 3,
    totalXp: 4200,
    tier: 'Bronze',
    stats: { strength: 10, endurance: 10, aesthetics: 10, discipline: 10 },
    totalReps: 900,
    workoutCount: 12,
    streak: 2,
    bestStreak: 5,
    seasonId: '2026-S3',
    seasonXp: 800,
    recentDays: ['2026-08-19', '2026-08-17'],
    updatedAt: Date.now(),
    ...overrides,
  };
}

function challengeDoc(overrides = {}) {
  return {
    createdBy: ALICE,
    members: [ALICE, BOB],
    templateId: 'sessions_week',
    title: 'Most sessions this week',
    metric: 'sessions',
    window: 'week',
    exerciseId: null,
    startDay: '2026-08-17',
    endDay: '2026-08-23',
    endsAt: Date.now() + 86400000,
    status: 'pending',
    createdAt: Date.now(),
    respondedAt: null,
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
const carol = testEnv.authenticatedContext(CAROL).firestore();
const anon = testEnv.unauthenticatedContext().firestore();

/* -------------------------------------------------------------------------- */

section('users — privacy');

await test('owner can create their own profile', async () => {
  await resetAlice();
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
  await resetAlice();
  await assertFails(setDoc(doc(bob, 'users', ALICE), userDoc({ displayName: 'Pwned' })));
});

await test('profiles cannot be created for someone else', async () => {
  await resetAlice();
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
  await resetAlice();
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ stats: { strength: 'lots', endurance: 1, aesthetics: 1, discipline: 1 } })),
  );
});

await test('rejects a missing stat key', async () => {
  await resetAlice();
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ stats: { strength: 1, endurance: 1, aesthetics: 1 } })),
  );
});

await test('rejects negative coins', async () => {
  await resetAlice();
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ coins: -50 })));
});

await test('rejects a level above the cap', async () => {
  await resetAlice();
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ level: 500 })));
});

await test('rejects body fat outside the accepted range', async () => {
  await resetAlice();
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ bodyFat: 95 })));
});

await test('rejects more streak shields than the shop allows', async () => {
  await resetAlice();
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ inventory: { streakShields: 99, cosmetics: [], unlocks: [] } })),
  );
});

await test('rejects a malformed lastWorkoutDay', async () => {
  await resetAlice();
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ streak: { current: 1, best: 1, lastWorkoutDay: 'yesterday', shieldsUsed: 0 } })),
  );
});

await test('accepts a well-formed lastWorkoutDay', async () => {
  await resetAlice();
  await assertSucceeds(
    setDoc(doc(alice, 'users', ALICE), userDoc({ streak: { current: 1, best: 1, lastWorkoutDay: '2026-08-17', shieldsUsed: 0 } })),
  );
});

await test('rejects an empty display name', async () => {
  await resetAlice();
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ displayName: '' })));
});

await test('accepts a display name at the 40-character limit', async () => {
  await resetAlice();
  await assertSucceeds(
    setDoc(doc(alice, 'users', ALICE), userDoc({ displayName: 'x'.repeat(40) })),
  );
});

await test('rejects a display name one character over the limit', async () => {
  await resetAlice();
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ displayName: 'x'.repeat(41) })),
  );
});

await test('the nameFixedAt repair marker is accepted on the user document', async () => {
  await resetAlice();
  await assertSucceeds(
    setDoc(doc(alice, 'users', ALICE), userDoc({ nameFixedAt: Date.now() })),
  );
});

await test('accepts a routine list', async () => {
  await resetAlice();
  const routines = [
    {
      id: 'routine_abc',
      name: 'Push Day',
      items: [{ exerciseId: 'push_up', reps: [12, 10, 8] }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), userDoc({ routines })));
});

await test('rejects more routines than the limit', async () => {
  await resetAlice();
  const routines = Array.from({ length: 13 }, (_, i) => ({
    id: `routine_${i}`,
    name: `Day ${i}`,
    items: [{ exerciseId: 'push_up', reps: [10] }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ routines })));
});

await test('a document without routines is still valid', async () => {
  // The live-data guarantee: no account has this field until it saves one.
  const withoutRoutines = userDoc();
  delete withoutRoutines.routines;
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), withoutRoutines));
});

await test('only the owner can delete their profile', async () => {
  // Erasure is deliberate: an athlete must be able to remove their own account
  // from inside the app. It is still nobody else's to remove.
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(doc(bob, 'users', ALICE)));
  await assertSucceeds(deleteDoc(doc(alice, 'users', ALICE)));
  // Later assertions in this file write to the document again, and an update
  // against a missing document is a create.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', ALICE), userDoc());
  });
});

await test('a profile cannot be created already carrying XP', async () => {
  // The create-time clauses were never exercised: every earlier test wrote over
  // an existing document, which is an update.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(ctx.firestore(), 'users', ALICE));
  });
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ totalXp: 500 })));
});

await test('a profile cannot be created already rich', async () => {
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ coins: 5000 })));
});

await test('a clean profile can be created', async () => {
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), userDoc()));
});

await test('an unknown field on the user document is ACCEPTED, and that is known', async () => {
  // Documenting a real limitation rather than pretending it is closed. A
  // `hasOnly` allow-list here costs about (32 document keys x 32 list entries)
  // expressions against Firestore's 1,000-per-request budget, which denied
  // onboarding outright. The residual risk is an athlete filling their own
  // private document, bounded by Firestore's 1 MiB limit — per-account, and
  // not reachable by anyone else.
  await resetAlice();
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), userDoc({ isAdmin: true })));
  // What matters is that it buys nothing: the field is unreadable by others...
  await assertFails(getDoc(doc(bob, 'users', ALICE)));
  // ...and cannot reach the leaderboard, which has its own allow-list.
  await assertFails(setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ isAdmin: true })));
});

await test('XP cannot leap by more than a session could earn', async () => {
  await resetAlice({ totalXp: 1000, level: 4 });
  await assertFails(updateDoc(doc(alice, 'users', ALICE), { totalXp: 1000 + 100000 }));
  await assertSucceeds(updateDoc(doc(alice, 'users', ALICE), { totalXp: 1000 + 30000 }));
});

await test('coins cannot leap by more than a session could earn', async () => {
  await resetAlice({ coins: 100 });
  await assertFails(updateDoc(doc(alice, 'users', ALICE), { coins: 100 + 50000 }));
  await assertSucceeds(updateDoc(doc(alice, 'users', ALICE), { coins: 100 + 2000 }));
});

await test('photoURL is restricted to the provider image host', async () => {
  await resetAlice();
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), userDoc({ photoURL: '' })));
  await assertSucceeds(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ photoURL: 'https://lh3.googleusercontent.com/a/ACg8ocK123' }),
    ),
  );
  // An arbitrary host would receive an HTTP request from every athlete who
  // opened the leaderboard.
  await assertFails(
    setDoc(doc(alice, 'users', ALICE), userDoc({ photoURL: 'https://tracker.example.com/p.gif' })),
  );
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ photoURL: 'https://lh3.googleusercontent.com.evil.test/x' }),
    ),
  );
});

section('users — body measurements and preferences');

await test('accepts a well-formed measurement block', async () => {
  await resetAlice();
  await assertSucceeds(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({
        measurements: { values: { bodyweight: 82.4, chest: 104 }, recordedAt: Date.now() },
      }),
    ),
  );
});

await test('rejects a measurement outside the sanity bounds', async () => {
  await resetAlice();
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ measurements: { values: { bodyweight: 900 }, recordedAt: Date.now() } }),
    ),
  );
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ measurements: { values: { chest: 300 }, recordedAt: Date.now() } }),
    ),
  );
});

await test('rejects an unknown measurement site', async () => {
  await resetAlice();
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ measurements: { values: { neck: 40 }, recordedAt: Date.now() } }),
    ),
  );
});

await test('rejects an extra key on the measurement block', async () => {
  await resetAlice();
  await assertFails(
    setDoc(
      doc(alice, 'users', ALICE),
      userDoc({ measurements: { values: {}, recordedAt: Date.now(), note: 'x' } }),
    ),
  );
});

await test('accepts the display preferences, rejects junk in them', async () => {
  await resetAlice();
  await assertSucceeds(
    setDoc(doc(alice, 'users', ALICE), userDoc({ gymBroMode: false, unitSystem: 'imperial' })),
  );
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ gymBroMode: 'yes' })));
  await assertFails(setDoc(doc(alice, 'users', ALICE), userDoc({ unitSystem: 'furlongs' })));
});

await test('a document predating measurements still validates', async () => {
  // `userDoc()` deliberately carries none of the three new keys, so every other
  // assertion in this file doubles as a legacy-compatibility check. This one
  // says so explicitly.
  const legacy = userDoc();
  assert.ok(!('measurements' in legacy));
  assert.ok(!('gymBroMode' in legacy));
  assert.ok(!('unitSystem' in legacy));
  await assertSucceeds(setDoc(doc(alice, 'users', ALICE), legacy));
});

await test('xpVoided cannot be reduced', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', ALICE), userDoc({ totalXp: 5000, xpVoided: 1000 }));
  });
  await assertFails(updateDoc(doc(alice, 'users', ALICE), { xpVoided: 0 }));
});

await test('xpVoided cannot exceed gross XP', async () => {
  await assertFails(updateDoc(doc(alice, 'users', ALICE), { xpVoided: 6000 }));
});

await test('a correction can retract XP', async () => {
  await assertSucceeds(updateDoc(doc(alice, 'users', ALICE), { xpVoided: 1200 }));
});

await test('gross XP still cannot be reduced by a correction', async () => {
  // The whole design in one assertion: retracting moves `xpVoided` up, never
  // `totalXp` down.
  await assertFails(updateDoc(doc(alice, 'users', ALICE), { totalXp: 3000, xpVoided: 1200 }));
});

section('public_profiles — the leaderboard projection');

await test('owner can write their own public row', async () => {
  await resetAlice();
  await assertSucceeds(setDoc(doc(alice, 'public_profiles', ALICE), publicDoc()));
});

await test('a public row cannot claim more XP than the profile holds', async () => {
  // The forged-leaderboard case. Before the cross-read this succeeded and put
  // the writer straight to the top without touching their real profile.
  await resetAlice();
  await assertFails(
    setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ totalXp: 999999, level: 100 })),
  );
});

await test('a public row cannot claim a different name, tier or streak', async () => {
  await resetAlice();
  await assertFails(setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ tier: 'Apex' })));
  await assertFails(setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ streak: 500 })));
  await assertFails(
    setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ displayName: 'Someone Else' })),
  );
});

await test('a public row cannot wear a cosmetic the profile does not own', async () => {
  await resetAlice();
  await assertFails(
    setDoc(
      doc(alice, 'public_profiles', ALICE),
      publicDoc({ activeCosmetic: 'neon_name', cosmetics: ['neon_name'] }),
    ),
  );
  await resetAlice({ inventory: { streakShields: 0, cosmetics: ['neon_name'], unlocks: [] } });
  await assertSucceeds(
    setDoc(
      doc(alice, 'public_profiles', ALICE),
      publicDoc({ activeCosmetic: 'neon_name', cosmetics: ['neon_name'] }),
    ),
  );
});

await test('a public row tracks net XP after a correction', async () => {
  // The private document keeps gross lifetime XP; the mirror shows the net
  // figure. Comparing against the raw field would lock out every athlete who
  // has ever corrected a session.
  await resetAlice({ totalXp: 5000, xpVoided: 1200, level: 5 });
  await assertSucceeds(
    setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ totalXp: 3800, level: 5 })),
  );
  await assertFails(
    setDoc(doc(alice, 'public_profiles', ALICE), publicDoc({ totalXp: 5000, level: 5 })),
  );
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


await test('cannot create a workout owned by someone else', async () => {
  await assertFails(setDoc(doc(bob, 'workouts', 'w2'), workoutDoc(ALICE)));
});

await test('a correction document is accepted', async () => {
  await assertSucceeds(
    setDoc(
      doc(alice, 'workouts', 'c1'),
      workoutDoc(ALICE, {
        kind: 'correction',
        correctsId: 'w1',
        xpEarned: 0,
        coinsEarned: 0,
        totalVolume: 0,
        totalReps: 0,
      }),
    ),
  );
});

await test('a correction cannot also grant XP', async () => {
  // Without `correctionIsInert` a client could mark a paying session as a
  // correction and keep the XP.
  await assertFails(
    setDoc(
      doc(alice, 'workouts', 'c2'),
      workoutDoc(ALICE, {
        kind: 'correction',
        correctsId: 'w1',
        xpEarned: 50,
        coinsEarned: 0,
        totalVolume: 0,
        totalReps: 0,
      }),
    ),
  );
});

await test('a correction must name what it corrects', async () => {
  await assertFails(
    setDoc(
      doc(alice, 'workouts', 'c3'),
      workoutDoc(ALICE, {
        kind: 'correction',
        xpEarned: 0,
        coinsEarned: 0,
        totalVolume: 0,
        totalReps: 0,
      }),
    ),
  );
});

await test('an unknown workout kind is rejected', async () => {
  await assertFails(setDoc(doc(alice, 'workouts', 'c4'), workoutDoc(ALICE, { kind: 'bonus' })));
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

await test('only the owner can delete their own workout', async () => {
  // Deletion exists for account erasure. It destroys history and cannot
  // inflate anything, since XP is monotonic and `xpVoided` only grows.
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(doc(bob, 'workouts', 'w1')));
  await assertSucceeds(deleteDoc(doc(alice, 'workouts', 'w1')));
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

await test('a correction snapshot is accepted', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'stats_history', 's5'), snapshotDoc(ALICE, { source: 'correction' })),
  );
});

await test('another user cannot delete your snapshots', async () => {
  const { deleteDoc } = await import('firebase/firestore');
  await assertFails(deleteDoc(doc(bob, 'stats_history', 's1')));
  await assertSucceeds(deleteDoc(doc(alice, 'stats_history', 's1')));
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


/* -------------------------------------------------------------------------- */
/* Social                                                                      */
/* -------------------------------------------------------------------------- */

/** Every social test needs real public rows to point at. */
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const uid of [ALICE, BOB, CAROL]) {
    await setDoc(doc(db, 'public_profiles', uid), publicDoc({ displayName: uid }));
  }
});

section('friend_requests — existence is the pending state');

await test('the sender can create their own request', async () => {
  await assertSucceeds(
    setDoc(doc(alice, 'friend_requests', `${ALICE}__${BOB}`), {
      from: ALICE,
      to: BOB,
      createdAt: Date.now(),
    }),
  );
});

await test('both parties can read it, a stranger cannot', async () => {
  await assertSucceeds(getDoc(doc(alice, 'friend_requests', `${ALICE}__${BOB}`)));
  await assertSucceeds(getDoc(doc(bob, 'friend_requests', `${ALICE}__${BOB}`)));
  await assertFails(getDoc(doc(carol, 'friend_requests', `${ALICE}__${BOB}`)));
});

await test('you cannot forge a request from someone else', async () => {
  // This is the forgery that would otherwise let you accept on their behalf.
  await assertFails(
    setDoc(doc(alice, 'friend_requests', `${BOB}__${ALICE}`), {
      from: BOB,
      to: ALICE,
      createdAt: Date.now(),
    }),
  );
});

await test('the document id must match from__to', async () => {
  await assertFails(
    setDoc(doc(alice, 'friend_requests', 'something_else'), {
      from: ALICE,
      to: BOB,
      createdAt: Date.now(),
    }),
  );
});

await test('you cannot request yourself, or a non-existent athlete', async () => {
  await assertFails(
    setDoc(doc(alice, 'friend_requests', `${ALICE}__${ALICE}`), {
      from: ALICE,
      to: ALICE,
      createdAt: Date.now(),
    }),
  );
  await assertFails(
    setDoc(doc(alice, 'friend_requests', `${ALICE}__ghost`), {
      from: ALICE,
      to: 'ghost',
      createdAt: Date.now(),
    }),
  );
});

await test('a request cannot be edited', async () => {
  await assertFails(updateDoc(doc(alice, 'friend_requests', `${ALICE}__${BOB}`), { to: CAROL }));
});

section('friendships — acceptance is proved by the opposite request');

await test('you cannot accept your own request', async () => {
  // Alice sent it, so only Bob can turn it into a friendship. Without this the
  // whole consent model collapses.
  await assertFails(
    setDoc(doc(alice, 'friendships', `${ALICE}__${BOB}`), {
      members: [ALICE, BOB],
      createdAt: Date.now(),
    }),
  );
});

await test('a friendship at a non-canonical id is denied', async () => {
  await assertFails(
    setDoc(doc(bob, 'friendships', `${BOB}__${ALICE}`), {
      members: [ALICE, BOB],
      createdAt: Date.now(),
    }),
  );
});

await test('the recipient can accept, deleting the request in the same batch', async () => {
  // Rules `exists()` inside a batch sees the pre-batch state, so the friendship
  // check passes even though this batch removes the request it checks for.
  const batch = writeBatch(bob);
  batch.set(doc(bob, 'friendships', `${ALICE}__${BOB}`), {
    members: [ALICE, BOB],
    createdAt: Date.now(),
  });
  batch.delete(doc(bob, 'friend_requests', `${ALICE}__${BOB}`));
  await assertSucceeds(batch.commit());
});

await test('members can read the friendship, a stranger cannot', async () => {
  await assertSucceeds(getDoc(doc(alice, 'friendships', `${ALICE}__${BOB}`)));
  await assertSucceeds(getDoc(doc(bob, 'friendships', `${ALICE}__${BOB}`)));
  await assertFails(getDoc(doc(carol, 'friendships', `${ALICE}__${BOB}`)));
});

await test('a friendship cannot be edited', async () => {
  await assertFails(
    updateDoc(doc(alice, 'friendships', `${ALICE}__${BOB}`), { members: [ALICE, CAROL] }),
  );
});

section('friend_cards — the consent-gated projection');

await test('the owner can write their own card', async () => {
  await assertSucceeds(setDoc(doc(alice, 'friend_cards', ALICE), friendCardDoc()));
});

await test('a friend can read it; a stranger cannot', async () => {
  await assertSucceeds(getDoc(doc(bob, 'friend_cards', ALICE)));
  await assertFails(getDoc(doc(carol, 'friend_cards', ALICE)));
});

await test('a friend cannot write your card', async () => {
  await assertFails(setDoc(doc(bob, 'friend_cards', ALICE), friendCardDoc({ totalXp: 999999 })));
});

await test('private fields cannot be smuggled into a friend card', async () => {
  // `hasOnly` is the guard, and it is the same allow-list FRIEND_CARD_FIELDS
  // declares on the client.
  for (const extra of [
    { email: 'alice@example.com' },
    { bodyFat: 12 },
    { personalBests: {} },
    { measurements: { waist: 82 } },
  ]) {
    await assertFails(setDoc(doc(alice, 'friend_cards', ALICE), friendCardDoc(extra)));
  }
});

section('challenges — between friends, with no stored result');

await test('a friend can create a challenge', async () => {
  await assertSucceeds(setDoc(doc(alice, 'challenges', 'ch1'), challengeDoc()));
});

await test('a challenge against a non-friend is denied', async () => {
  await assertFails(
    setDoc(doc(alice, 'challenges', 'ch2'), challengeDoc({ members: [ALICE, CAROL] })),
  );
});

await test('a challenge cannot be created already active', async () => {
  await assertFails(setDoc(doc(alice, 'challenges', 'ch3'), challengeDoc({ status: 'active' })));
});

await test('members can read it, a stranger cannot', async () => {
  await assertSucceeds(getDoc(doc(bob, 'challenges', 'ch1')));
  await assertFails(getDoc(doc(carol, 'challenges', 'ch1')));
});

await test('the creator cannot accept their own challenge', async () => {
  await assertFails(
    updateDoc(doc(alice, 'challenges', 'ch1'), { status: 'active', respondedAt: Date.now() }),
  );
});

await test('the response cannot smuggle in other fields', async () => {
  await assertFails(
    updateDoc(doc(bob, 'challenges', 'ch1'), {
      status: 'active',
      respondedAt: Date.now(),
      metric: 'xp',
    }),
  );
  await assertFails(
    updateDoc(doc(bob, 'challenges', 'ch1'), {
      status: 'active',
      respondedAt: Date.now(),
      endsAt: Date.now() + 999999999,
    }),
  );
});

await test('the invited member can accept', async () => {
  await assertSucceeds(
    updateDoc(doc(bob, 'challenges', 'ch1'), { status: 'active', respondedAt: Date.now() }),
  );
});

await test('a challenge can only be responded to once', async () => {
  await assertFails(
    updateDoc(doc(bob, 'challenges', 'ch1'), { status: 'declined', respondedAt: Date.now() }),
  );
});

section('challenge scores — the document id is the rule');

await test('you can write your own score', async () => {
  await assertSucceeds(
    setDoc(doc(bob, 'challenges', 'ch1', 'scores', BOB), {
      uid: BOB,
      value: 12,
      sessions: 3,
      updatedAt: Date.now(),
    }),
  );
});

await test('you cannot write your opponent\u2019s score', async () => {
  // Nothing enforces that a score is *true* — it is self-reported by design.
  // What is enforced is that it is self-reported by the right self.
  await assertFails(
    setDoc(doc(bob, 'challenges', 'ch1', 'scores', ALICE), {
      uid: ALICE,
      value: 0,
      sessions: 0,
      updatedAt: Date.now(),
    }),
  );
});

await test('the score uid must match the document id', async () => {
  await assertFails(
    setDoc(doc(alice, 'challenges', 'ch1', 'scores', ALICE), {
      uid: BOB,
      value: 5,
      sessions: 1,
      updatedAt: Date.now(),
    }),
  );
});

await test('members can read scores, a stranger cannot', async () => {
  await assertSucceeds(getDoc(doc(alice, 'challenges', 'ch1', 'scores', BOB)));
  await assertFails(getDoc(doc(carol, 'challenges', 'ch1', 'scores', BOB)));
});

await test('scores cannot be deleted', async () => {
  await assertFails(deleteDoc(doc(bob, 'challenges', 'ch1', 'scores', BOB)));
});

section('friendship teardown');

await test('either member can remove the friendship', async () => {
  await assertFails(deleteDoc(doc(carol, 'friendships', `${ALICE}__${BOB}`)));
  await assertSucceeds(deleteDoc(doc(alice, 'friendships', `${ALICE}__${BOB}`)));
});

section('unauthenticated and cross-user writes');

await test('a signed-out client cannot write anything', async () => {
  const nobody = testEnv.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(nobody, 'users', ALICE), userDoc()));
  await assertFails(setDoc(doc(nobody, 'public_profiles', ALICE), publicDoc()));
  await assertFails(setDoc(doc(nobody, 'workouts', 'nope'), workoutDoc(ALICE)));
  await assertFails(setDoc(doc(nobody, 'stats_history', 'nope'), snapshotDoc(ALICE)));
});

await test('a snapshot cannot be created carrying another athlete\'s uid', async () => {
  await assertFails(setDoc(doc(bob, 'stats_history', 'forged'), snapshotDoc(ALICE)));
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
