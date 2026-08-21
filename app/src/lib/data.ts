import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';

import { COLLECTIONS, getDbOrThrow } from './firebase';
import type {
  CustomExercise,
  Exercise,
  LeaderboardRow,
  MeasurementValues,
  PersonalBest,
  Profile,
  Routine,
  RoutineItem,
  StatsSnapshot,
  UnitSystem,
  Workout,
  WorkoutEntry,
} from './types';
import { arr, clamp, int, num, round, str } from './safe';
import { STAT_KEYS, identityForStreak, levelFromTotalXp, tierForStats } from './game/constants';
import {
  newProfile,
  normalizeProfile,
  baselineStats,
  sanitizeDisplayName,
  UNNAMED_ATHLETE,
  type AssessmentInput,
} from './game/profile';
import { dayKey, registerWorkout, safeStreak, type DecayResult } from './game/streak';
import { advanceGoals, ensureGoals } from './game/goals';
import { aestheticsFromBodyFat, scoreSession } from './game/xp';
import { findShopItem, type ShopItem } from './game/shop';
import { mergeMuscleVolume, sessionMuscleVolume } from './game/muscles';
import { bestSet, entryVolume, normalizeReps } from './game/sets';
import { newlyEarned, type Achievement } from './game/achievements';
import { normalizeMeasurementValues } from './game/measurements';
import { applyReversal, reversalOf } from './game/correction';
import { friendCardFrom, pushRecentDay, searchKey } from './game/friends';
import { accrueSeason, rolloverSeason, seasonIdFor } from './game/season';
import { buildRoutine, removeRoutine, upsertRoutine } from './game/routines';
import { LIMITS } from './game/validation';
import { assertNotDemo, isDemoActive } from './demo/state';
import { getDemoData } from './demo/fixture';

/* -------------------------------------------------------------------------- */
/* Profile lifecycle                                                           */
/* -------------------------------------------------------------------------- */

export function userDocRef(uid: string) {
  return doc(getDbOrThrow(), COLLECTIONS.users, uid);
}

export function publicProfileRef(uid: string) {
  return doc(getDbOrThrow(), COLLECTIONS.publicProfiles, uid);
}

/**
 * The public projection of a profile — exactly the fields the leaderboard
 * renders, and nothing else.
 *
 * Built by explicit allow-list rather than by deleting private keys from the
 * profile, so a field added to `Profile` later can never leak into the public
 * collection by default. The security rules enforce the same list with
 * `hasOnly`, so a hand-rolled client cannot widen it either.
 */
export function publicProfileFrom(profile: Profile): Record<string, unknown> {
  return {
    displayName: sanitizeDisplayName(profile.displayName),
    photoURL: str(profile.photoURL, ''),
    level: Math.max(1, int(profile.level, 1)),
    totalXp: Math.max(0, num(profile.totalXp, 0)),
    tier: str(profile.tier, 'Uninitiated'),
    streak: Math.max(0, int(profile.streak?.current, 0)),
    activeCosmetic: profile.activeCosmetic ?? null,
    cosmetics: arr<string>(profile.inventory?.cosmetics).slice(0, 20),
    // Lowercased name for prefix search: Firestore has no case-insensitive
    // comparison, so the searchable form has to be a stored field.
    searchName: searchKey(profile.displayName),
    seasonId: str(profile.season?.id, ''),
    seasonXp: Math.max(0, num(profile.season?.xp, 0)),
    // Keeps a finished season's ladder computable after its athletes have
    // rolled over into the next one.
    lastSeasonId: str(profile.seasonHistory?.[0]?.id, ''),
    lastSeasonXp: Math.max(0, num(profile.seasonHistory?.[0]?.xp, 0)),
    updatedAt: Date.now(),
  };
}

export function friendCardRef(uid: string) {
  return doc(getDbOrThrow(), COLLECTIONS.friendCards, uid);
}

/**
 * Mirror the friend projection — the richer view a friendship unlocks.
 *
 * Same swallow-and-log failure mode as `syncPublicProfile`: a stale friend card
 * is never worth failing the athlete's actual action over.
 */
export async function syncFriendCard(profile: Profile): Promise<void> {
  try {
    await setDoc(friendCardRef(profile.uid), friendCardFrom(profile));
  } catch (error) {
    console.error('[data] failed to sync friend card', error);
  }
}

/**
 * Mirror the leaderboard row.
 *
 * Deliberately written *after* the batch that updates the user document, never
 * inside it. The rules now cross-read the private document to prove the public
 * row is not inflated, and a rule's `get()` inside a batch sees the *pre-batch*
 * state — so a mirror batched alongside its own source would be compared
 * against the old figures and rejected every time.
 *
 * Failures are logged and swallowed: a stale leaderboard row is a cosmetic
 * problem, and it corrects itself on the next write. Losing a logged session
 * because the mirror failed would not be cosmetic.
 */
export async function syncPublicProfile(
  profile: Profile,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  try {
    await setDoc(publicProfileRef(profile.uid), {
      ...publicProfileFrom(profile),
      ...overrides,
    });
  } catch (error) {
    console.error('[data] failed to sync public profile', error);
  }
}

/**
 * Create the user document on first sign-in, or return the existing one.
 *
 * `preferredName` is the name typed on the sign-up form. It is passed in
 * explicitly because at first sign-in the Auth record has not been named yet —
 * relying on `user.displayName` there is what used to publish the local part of
 * people's email addresses to the leaderboard.
 */
export async function ensureProfile(user: User, preferredName?: string): Promise<Profile> {
  const ref = userDocRef(user.uid);
  const snapshot = await getDoc(ref);

  // Already legal, already truncated: safe to write without further thought.
  const authName = sanitizeDisplayName(preferredName ?? user.displayName);
  const emailLocal = str(user.email, '').split('@')[0].trim().toLowerCase();

  if (snapshot.exists()) {
    const raw = (snapshot.data() ?? {}) as Record<string, unknown>;
    const profile = normalizeProfile(user.uid, raw);

    const patch: Record<string, unknown> = {};
    const storedName = str(raw.displayName, '');
    const legalName = sanitizeDisplayName(storedName);

    // Legality repair. A document written before the length was enforced fails
    // `userFieldsAreValid` on every subsequent update, which locks the account
    // out of logging anything at all. Correcting the name inside the patch is
    // enough on its own: on an update the rules validate the merged document,
    // so this single write brings the whole document back into compliance.
    if (legalName !== storedName) patch.displayName = legalName;

    // Leak repair, once per account. `nameFixedAt` is the marker; a name the
    // athlete chose deliberately (see `updateDisplayName`) sets it too, so this
    // can never fight a user who genuinely wants to be called by their email
    // local part.
    const alreadyRepaired = num(raw.nameFixedAt, 0) > 0;
    const looksLeaked =
      legalName === UNNAMED_ATHLETE ||
      (emailLocal.length > 0 && legalName.toLowerCase() === emailLocal);

    if (
      !alreadyRepaired &&
      looksLeaked &&
      authName !== UNNAMED_ATHLETE &&
      authName.toLowerCase() !== emailLocal
    ) {
      patch.displayName = authName;
      patch.nameFixedAt = Date.now();
    }

    if (user.photoURL && user.photoURL !== profile.photoURL) patch.photoURL = user.photoURL;

    const repaired: Profile = {
      ...profile,
      displayName: typeof patch.displayName === 'string' ? patch.displayName : profile.displayName,
      photoURL: typeof patch.photoURL === 'string' ? patch.photoURL : profile.photoURL,
    };

    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await updateDoc(ref, patch);
    }

    // Mirror the *repaired* profile, not the one that was read — otherwise the
    // leaderboard keeps showing the leaked name until the next workout.
    await syncPublicProfile(repaired);
    // An account that has never logged a session still needs a readable card,
    // or a new friend sees nothing at all.
    await syncFriendCard(repaired);

    return repaired;
  }

  const fresh = newProfile({
    uid: user.uid,
    displayName: authName,
    email: str(user.email, ''),
    photoURL: str(user.photoURL, ''),
  });

  // `goals` starts empty; the first roll happens after onboarding so the
  // templates can respect the user's assessed level. `uid` is the document id,
  // `storedTier`/`storedIdentity` are client-side derivation helpers, and
  // `grossXp` is read back off the stored `totalXp` field rather than written
  // beside it — so none of them belong in the document body. `xpVoided` is a
  // genuine stored field and is written.
  const {
    uid: _uid,
    storedTier: _tier,
    storedIdentity: _identity,
    grossXp: _gross,
    ...document
  } = fresh;
  await setDoc(ref, stripUndefined(document));
  await syncPublicProfile(fresh);
  await syncFriendCard(fresh);
  return fresh;
}

/** Persist a background recalculation (streak decay, tier drift). */
export async function persistRecalculation(
  uid: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await updateDoc(userDocRef(uid), { ...stripUndefined(patch), updatedAt: Date.now() });
}

/* -------------------------------------------------------------------------- */
/* Onboarding assessment                                                       */
/* -------------------------------------------------------------------------- */

export interface AssessmentResult {
  stats: Profile['stats'];
  tier: string;
}

/** How long to wait for a server ack before calling a write "saved locally". */
const COMMIT_GRACE_MS = 1200;

/**
 * Commit a batch without hostage-taking the UI — but without lying about it.
 *
 * Firestore applies a batch to the local cache immediately and only settles the
 * returned promise once the server acknowledges it, which offline is never. So
 * a commit that has not settled inside the grace window is reported as
 * `pending`: the write is durable in IndexedDB and will replay on reconnect.
 *
 * A commit that *rejects* is something else entirely — rules, quota, invalid
 * data — and is rethrown. An earlier version swallowed rejections and returned
 * `false` for both cases, which turned every rejected write into a silent
 * success: the caller showed a success toast, the document never changed, and
 * onboarding sat on a spinner forever waiting for a snapshot that was never
 * coming. Never collapse "not yet" and "no" into the same value.
 */
async function commitBatch(batch: WriteBatch): Promise<boolean> {
  let settled = false;
  const commit = batch.commit().then(() => {
    settled = true;
    return true;
  });

  const timeout = new Promise<boolean>((resolve) => {
    window.setTimeout(() => resolve(false), COMMIT_GRACE_MS);
  });

  // `Promise.race` leaves the loser running. If the commit later rejects with
  // nobody awaiting it that is an unhandled rejection, so it is caught and
  // logged here — by then the caller has already been told the write is
  // pending, and a genuine failure will surface on the next read.
  commit.catch((error) => {
    if (!settled) console.error('[data] a pending write was rejected on sync', error);
  });

  return Promise.race([commit, timeout]);
}

/**
 * Save the onboarding assessment.
 *
 * Writes the baseline stats onto the profile and records the very first
 * `stats_history` snapshot so the progress charts have an origin point.
 */
export async function completeAssessment(
  profile: Profile,
  input: AssessmentInput,
  measurements: MeasurementValues = {},
): Promise<AssessmentResult> {
  assertNotDemo();
  const db = getDbOrThrow();
  const stats = baselineStats(input);
  const tier = tierForStats(stats).name;
  const bodyFat = clamp(num(input.bodyFat, 20), LIMITS.MIN_BODY_FAT, LIMITS.MAX_BODY_FAT);
  const now = Date.now();
  const today = dayKey();
  // Measurements are optional here. Skipping them produces byte-for-byte the
  // writes this function produced before the field existed.
  const values = normalizeMeasurementValues(measurements);
  const hasMeasurements = Object.keys(values).length > 0;

  const batch = writeBatch(db);

  batch.update(userDocRef(profile.uid), {
    onboarded: true,
    assessment: {
      maxPullUps: Math.max(0, int(input.maxPullUps, 0)),
      maxPushUps: Math.max(0, int(input.maxPushUps, 0)),
      plankSeconds: Math.max(0, int(input.plankSeconds, 0)),
      bodyFat,
      completedAt: now,
    },
    stats,
    tier,
    bodyFat,
    identity: identityForStreak(0).label,
    goals: ensureGoals(1, []),
    ...(hasMeasurements ? { measurements: { values, recordedAt: now } } : {}),
    updatedAt: now,
  });

  const snapshotRef = doc(collection(db, COLLECTIONS.statsHistory));
  batch.set(snapshotRef, {
    uid: profile.uid,
    createdAt: now,
    day: today,
    stats,
    level: 1,
    totalXp: 0,
    tier,
    bodyFat,
    totalReps: 0,
    streak: 0,
    source: 'assessment',
    ...(hasMeasurements ? { measurements: values } : {}),
  });

  await commitBatch(batch);
  await syncPublicProfile(profile, { tier, updatedAt: now });
  return { stats, tier };
}

/* -------------------------------------------------------------------------- */
/* Workout logging                                                             */
/* -------------------------------------------------------------------------- */

/** A personal best, plus what it beat. `previousValue` is never persisted. */
export interface PersonalBestGain extends PersonalBest {
  previousValue: number;
}

export interface CompletedGoalSummary {
  title: string;
  rewardXp: number;
  rewardCoins: number;
}

export interface LogWorkoutResult {
  /**
   * True when the write is durable on this device but the server has not
   * acknowledged it yet. Offline this is the normal outcome, not a failure.
   */
  pending: boolean;
  /** Everything banked: session XP, the streak bonus, and goal rewards. */
  xpEarned: number;
  /** Session XP before the streak multiplier and before goal rewards. */
  baseXp: number;
  streakBonusXp: number;
  goalRewardXp: number;
  /** Coins from the session itself; `coinsEarned` also includes goal rewards. */
  sessionCoins: number;
  goalRewardCoins: number;
  coinsEarned: number;

  totalXpBefore: number;
  totalXpAfter: number;
  levelBefore: number;
  newLevel: number;
  levelsGained: number;

  tierBefore: string;
  newTier: string;
  tierChanged: boolean;

  newPersonalBests: PersonalBestGain[];
  completedGoals: CompletedGoalSummary[];
  newAchievements: Achievement[];

  streakBefore: number;
  streak: number;
  totalReps: number;
  totalVolume: number;
  entryCount: number;
  /** Exercise names in session order, for the share card. */
  movementNames: string[];
  /** Local calendar day the session was filed under, `YYYY-MM-DD`. */
  day: string;
}

/**
 * Log a completed session.
 *
 * A single batched write covers all three collections so a session can never
 * half-commit: the workout document, the updated profile, and a fresh
 * `stats_history` snapshot for the charts.
 */
export async function logWorkout(
  profile: Profile,
  entries: WorkoutEntry[],
  resolve: (id: string) => Exercise | undefined,
  presetId: string | null = null,
): Promise<LogWorkoutResult> {
  assertNotDemo();
  const db = getDbOrThrow();
  const now = Date.now();
  const today = dayKey();

  const streakBefore = safeStreak(profile.streak);
  const totals = scoreSession(entries, resolve, streakBefore.current);

  // The streak advances first — the session's own XP already used the prior
  // multiplier, so today's increment applies from the next session onward.
  // Shields are passed in so an elapsed week is settled here, on the logging
  // path, rather than waiting for the hourly background pass — which is how a
  // shield bought to protect a streak used to expire before it could spend.
  const streakAfter = registerWorkout(
    streakBefore,
    today,
    int(profile.inventory?.streakShields, 0),
  );

  const goalOutcome = advanceGoals(profile.goals, profile.level, {
    entries,
    resolve,
    xpEarned: totals.xp,
    totalReps: totals.totalReps,
    streak: streakAfter.current,
  });

  const xpEarned = totals.xp + goalOutcome.rewardXp;
  const coinsEarned = totals.coins + goalOutcome.rewardCoins;

  // Net is what the game reads; gross is what the document stores. They differ
  // only once an account has corrected a session, and the two must not be mixed
  // up: writing net into `users.totalXp` would silently un-void a correction.
  const previousTotalXp = Math.max(0, num(profile.totalXp, 0));
  const newTotalXp = previousTotalXp + xpEarned;
  const grossAfter = Math.max(0, num(profile.grossXp, previousTotalXp)) + xpEarned;
  const previousLevel = levelFromTotalXp(previousTotalXp);

  // Season counters ride along in the same batch — no extra round trip, no
  // second commit. A rollover here touches nothing above it: lifetime XP,
  // level, coins, stats, personal bests, inventory and muscle volume are all
  // computed exactly as they were before seasons existed.
  const rolled = rolloverSeason(profile.season, profile.seasonHistory, seasonIdFor(), now);
  const season = accrueSeason(rolled.season, xpEarned, now);
  const recentDays = pushRecentDay(profile.recentDays, today);
  const newLevel = levelFromTotalXp(newTotalXp);

  // Stat growth, plus a discipline bonus that scales with the live streak.
  const stats = { ...profile.stats };
  for (const key of STAT_KEYS) {
    stats[key] = round(num(stats[key], 0) + num(totals.statGains[key], 0), 3);
  }
  stats.discipline = round(stats.discipline + Math.min(streakAfter.current * 0.05, 1.5), 3);

  const tierAfter = tierForStats(stats);
  const identityAfter = identityForStreak(streakAfter.current);

  const { personalBests, fresh } = mergePersonalBests(profile.personalBests, entries);

  // Per-muscle lifetime volume, which drives the muscle ratings and the
  // balance analysis on the profile.
  const muscleVolume = mergeMuscleVolume(profile.muscleVolume, sessionMuscleVolume(entries));

  const workoutRef = doc(collection(db, COLLECTIONS.workouts));
  const snapshotRef = doc(collection(db, COLLECTIONS.statsHistory));
  const totalReps = Math.max(0, int(profile.totalReps, 0)) + totals.totalReps;

  const batch = writeBatch(db);

  batch.set(workoutRef, {
    uid: profile.uid,
    day: today,
    createdAt: now,
    entries: entries.map((e) => {
      const reps = normalizeReps(e.reps);
      return {
        exerciseId: str(e.exerciseId, ''),
        exerciseName: str(e.exerciseName, ''),
        unit: e.unit === 'seconds' ? 'seconds' : 'reps',
        sets: Math.max(0, int(e.sets, 0)),
        amount: Math.max(0, int(e.amount, 0)),
        volume: Math.max(0, int(entryVolume(e))),
        // A single-set ladder carries no information the uniform shape lacks,
        // so it is stored without the array and the document stays identical
        // to one written before this field existed.
        ...(reps.length > 1 ? { reps } : {}),
        xp: Math.max(0, int(e.xp, 0)),
      };
    }),
    xpEarned,
    coinsEarned,
    totalVolume: Math.max(0, int(totals.totalVolume, 0)),
    totalReps: Math.max(0, int(totals.totalReps, 0)),
    presetId: presetId ?? null,
  });

  batch.update(userDocRef(profile.uid), {
    // Gross. The leaderboard row and the snapshot below both take net.
    totalXp: grossAfter,
    level: newLevel,
    coins: Math.max(0, int(profile.coins, 0)) + coinsEarned,
    coinsPeak: Math.max(
      Math.max(0, int(profile.coinsPeak, 0)),
      Math.max(0, int(profile.coins, 0)) + coinsEarned,
    ),
    stats,
    tier: tierAfter.name,
    identity: identityAfter.label,
    streak: streakAfter,
    personalBests,
    goals: goalOutcome.goals,
    workoutCount: Math.max(0, int(profile.workoutCount, 0)) + 1,
    totalReps,
    muscleVolume,
    season,
    seasonHistory: rolled.history,
    recentDays,
    updatedAt: now,
  });

  // The profile as the batch will leave it. Achievements are derived, so the
  // only way to know what this session unlocked is to score both sides — and
  // it has to be built from the same locals the update writes, or the summary
  // would celebrate a badge the document does not back.
  const profileAfter: Profile = {
    ...profile,
    level: newLevel,
    totalXp: newTotalXp,
    coins: Math.max(0, int(profile.coins, 0)) + coinsEarned,
    stats,
    tier: tierAfter.name,
    identity: identityAfter.label,
    streak: streakAfter,
    personalBests,
    goals: goalOutcome.goals,
    workoutCount: Math.max(0, int(profile.workoutCount, 0)) + 1,
    totalReps,
    muscleVolume,
    season,
    seasonHistory: rolled.history,
    recentDays,
  };
  const newAchievements = newlyEarned(profile, profileAfter);

  // Fifth write: the friend projection, so a friend's head-to-head is current
  // the moment this session lands.
  batch.set(friendCardRef(profile.uid), friendCardFrom(profileAfter, now));

  batch.set(snapshotRef, {
    uid: profile.uid,
    createdAt: now,
    day: today,
    stats,
    level: newLevel,
    totalXp: newTotalXp,
    tier: tierAfter.name,
    bodyFat: clamp(num(profile.bodyFat, 0), 0, LIMITS.MAX_BODY_FAT),
    totalReps,
    streak: streakAfter.current,
    source: 'workout',
  });

  const acknowledged = await commitBatch(batch);

  // After the batch, never inside it — see `syncPublicProfile`.
  await syncPublicProfile(profile, {
    level: newLevel,
    totalXp: newTotalXp,
    tier: tierAfter.name,
    streak: streakAfter.current,
    seasonId: season.id,
    seasonXp: season.xp,
    ...(rolled.changed && rolled.history[0]
      ? { lastSeasonId: rolled.history[0].id, lastSeasonXp: rolled.history[0].xp }
      : {}),
    updatedAt: now,
  });

  return {
    pending: !acknowledged,
    xpEarned,
    baseXp: totals.baseXp,
    streakBonusXp: totals.streakBonusXp,
    goalRewardXp: goalOutcome.rewardXp,

    sessionCoins: totals.coins,
    goalRewardCoins: goalOutcome.rewardCoins,
    coinsEarned,

    totalXpBefore: previousTotalXp,
    totalXpAfter: newTotalXp,
    levelBefore: previousLevel,
    newLevel,
    levelsGained: Math.max(0, newLevel - previousLevel),

    tierBefore: str(profile.tier, ''),
    newTier: tierAfter.name,
    tierChanged: tierAfter.name !== profile.tier,

    newPersonalBests: fresh,
    completedGoals: goalOutcome.completed.map((g) => ({
      title: str(g.title, ''),
      rewardXp: Math.max(0, int(g.rewardXp, 0)),
      rewardCoins: Math.max(0, int(g.rewardCoins, 0)),
    })),
    newAchievements,

    streakBefore: streakBefore.current,
    streak: streakAfter.current,
    totalReps: totals.totalReps,
    totalVolume: totals.totalVolume,
    entryCount: entries.length,
    movementNames: entries.map((e) => str(e.exerciseName, '')).filter(Boolean),
    day: today,
  };
}

/** Merge a session's best sets into the stored PR map. */
function mergePersonalBests(
  existing: Profile['personalBests'],
  entries: WorkoutEntry[],
): { personalBests: Profile['personalBests']; fresh: PersonalBestGain[] } {
  const personalBests: Profile['personalBests'] = { ...existing };
  const fresh: PersonalBestGain[] = [];

  for (const entry of entries) {
    const id = str(entry.exerciseId, '');
    if (!id) continue;
    // A PR is the best *single set*, not the session total. With a ladder
    // stored that is the hardest set in it, not the last one performed.
    const value = bestSet(entry);
    if (value <= 0) continue;

    const current = personalBests[id];
    if (current && int(current.value, 0) >= value) continue;

    const record: PersonalBest = {
      exerciseId: id,
      exerciseName: str(entry.exerciseName, id),
      unit: entry.unit === 'seconds' ? 'seconds' : 'reps',
      value,
      achievedAt: Date.now(),
    };
    personalBests[id] = record;
    // Only announce a PR when there was something to beat. `previousValue` is a
    // display concern and is spread into a *copy*: pushing the same reference
    // would persist it into `personalBests` for every user, permanently.
    if (current) fresh.push({ ...record, previousValue: Math.max(0, int(current.value, 0)) });
  }

  return { personalBests, fresh };
}

/* -------------------------------------------------------------------------- */
/* Corrections                                                                 */
/* -------------------------------------------------------------------------- */

export interface VoidWorkoutResult {
  xpRemoved: number;
  newLevel: number;
  newTier: string;
  pending: boolean;
}

/**
 * Retract a logged session.
 *
 * The ledger stays append-only and gross XP stays monotonic: this appends a
 * `correction` document naming the session it voids, and moves the XP into
 * `xpVoided` rather than subtracting it from `totalXp`. Level, tier, charts and
 * the leaderboard read the difference of the two counters, which is free to
 * fall while neither counter ever does.
 *
 * Deliberately does not restore personal bests, streak days or goal progress —
 * see `correction.ts` for why each is impossible to reconstruct honestly from
 * the stored document.
 */
export async function voidWorkout(
  profile: Profile,
  workout: Workout,
  resolve: (id: string) => Exercise | undefined,
): Promise<VoidWorkoutResult> {
  assertNotDemo();
  const db = getDbOrThrow();
  const now = Date.now();

  const reversal = reversalOf(workout, resolve);
  const corrected = applyReversal(profile, reversal);

  const batch = writeBatch(db);

  const correctionRef = doc(collection(db, COLLECTIONS.workouts));
  batch.set(correctionRef, {
    uid: profile.uid,
    day: dayKey(),
    createdAt: now,
    kind: 'correction',
    correctsId: workout.id,
    // The rules require at least one entry; copying the originals makes the
    // ledger readable without a join.
    entries: arr<WorkoutEntry>(workout.entries).map((e) => {
      const reps = normalizeReps(e.reps);
      return {
        exerciseId: str(e.exerciseId, ''),
        exerciseName: str(e.exerciseName, 'Exercise'),
        unit: e.unit === 'seconds' ? 'seconds' : 'reps',
        sets: Math.max(0, int(e.sets, 0)),
        amount: Math.max(0, int(e.amount, 0)),
        volume: Math.max(0, int(e.volume, 0)),
        ...(reps.length > 1 ? { reps } : {}),
        xp: Math.max(0, int(e.xp, 0)),
      };
    }),
    xpEarned: 0,
    coinsEarned: 0,
    totalVolume: 0,
    totalReps: 0,
    presetId: null,
  });

  // Note the absence of `totalXp`: the stored field is gross lifetime XP and
  // must not move. `xpVoided` carries the retraction.
  batch.update(userDocRef(profile.uid), {
    xpVoided: corrected.xpVoided,
    level: corrected.level,
    coins: corrected.coins,
    stats: corrected.stats,
    tier: corrected.tier,
    totalReps: corrected.totalReps,
    workoutCount: corrected.workoutCount,
    muscleVolume: corrected.muscleVolume,
    updatedAt: now,
  });

  // A snapshot so the charts show the dip honestly rather than a mystery flat
  // spot between two readings.
  const snapshotRef = doc(collection(db, COLLECTIONS.statsHistory));
  batch.set(snapshotRef, {
    uid: profile.uid,
    createdAt: now,
    day: dayKey(),
    stats: corrected.stats,
    level: corrected.level,
    totalXp: corrected.totalXp,
    tier: corrected.tier,
    bodyFat: clamp(num(profile.bodyFat, 0), 0, LIMITS.MAX_BODY_FAT),
    totalReps: corrected.totalReps,
    streak: safeStreak(profile.streak).current,
    source: 'correction',
  });

  const acknowledged = await commitBatch(batch);

  await syncPublicProfile(profile, {
    level: corrected.level,
    totalXp: corrected.totalXp,
    tier: corrected.tier,
    updatedAt: now,
  });

  return {
    xpRemoved: Math.max(0, num(profile.totalXp, 0) - corrected.totalXp),
    newLevel: corrected.level,
    newTier: corrected.tier,
    pending: !acknowledged,
  };
}

/* -------------------------------------------------------------------------- */
/* Erasure                                                                     */
/* -------------------------------------------------------------------------- */

/** How many documents to delete per batch. Firestore's own limit is 500. */
const ERASE_PAGE = 400;

async function erasePage(uid: string, collectionName: string): Promise<number> {
  const db = getDbOrThrow();
  const snapshot = await getDocs(
    query(collection(db, collectionName), where('uid', '==', uid), fbLimit(ERASE_PAGE)),
  );
  if (snapshot.empty) return 0;

  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  // Awaited for real, unlike every other write in this file: an erasure that
  // only happened in the local cache is not an erasure.
  await batch.commit();
  return snapshot.size;
}

/**
 * Remove everything this account owns.
 *
 * The user document goes last on purpose: a failure part-way through leaves an
 * account that still loads and can retry, rather than an orphaned pile of
 * sessions belonging to a profile that no longer exists.
 */
export async function eraseAccountData(uid: string): Promise<void> {
  assertNotDemo();
  for (const name of [COLLECTIONS.workouts, COLLECTIONS.statsHistory]) {
    // Paged rather than recursive so a huge history cannot blow the stack.
    for (;;) {
      const removed = await erasePage(uid, name);
      if (removed < ERASE_PAGE) break;
    }
  }

  await deleteDoc(publicProfileRef(uid));
  await deleteDoc(userDocRef(uid));
}

/* -------------------------------------------------------------------------- */
/* Body composition                                                            */
/* -------------------------------------------------------------------------- */

/** Record a new body fat reading; aesthetics gets a floor from leanness. */
export async function updateBodyFat(profile: Profile, bodyFat: number): Promise<void> {
  assertNotDemo();
  const db = getDbOrThrow();
  const value = clamp(num(bodyFat, 20), LIMITS.MIN_BODY_FAT, LIMITS.MAX_BODY_FAT);
  const now = Date.now();

  const stats = {
    ...profile.stats,
    aesthetics: aestheticsFromBodyFat(value, profile.stats.aesthetics),
  };
  const tier = tierForStats(stats).name;

  const batch = writeBatch(db);

  batch.update(userDocRef(profile.uid), { bodyFat: value, stats, tier, updatedAt: now });

  const snapshotRef = doc(collection(db, COLLECTIONS.statsHistory));
  batch.set(snapshotRef, {
    uid: profile.uid,
    createdAt: now,
    day: dayKey(),
    stats,
    level: profile.level,
    totalXp: profile.totalXp,
    tier,
    bodyFat: value,
    totalReps: profile.totalReps,
    streak: safeStreak(profile.streak).current,
    source: 'assessment',
  });

  await commitBatch(batch);
  await syncPublicProfile(profile, { tier, updatedAt: now });
}

/**
 * Append a measurement recording.
 *
 * Deliberately does NOT touch `stats`, `tier` or `public_profiles`:
 * measurements are tracked and charted, never scored and never ranked. The
 * profile keeps a merged "latest per site" for the entry form; the snapshot
 * keeps only what was entered now, so a chart never draws a three-month-old
 * chest reading as if it were taken today.
 */
export async function recordMeasurements(
  profile: Profile,
  input: MeasurementValues,
): Promise<void> {
  assertNotDemo();
  const db = getDbOrThrow();
  const entered = normalizeMeasurementValues(input);
  if (Object.keys(entered).length === 0) return;

  const now = Date.now();
  const merged = { ...(profile.measurements?.values ?? {}), ...entered };

  const batch = writeBatch(db);

  batch.update(userDocRef(profile.uid), {
    measurements: { values: merged, recordedAt: now },
    updatedAt: now,
  });

  const snapshotRef = doc(collection(db, COLLECTIONS.statsHistory));
  batch.set(snapshotRef, {
    uid: profile.uid,
    createdAt: now,
    day: dayKey(),
    stats: profile.stats,
    level: profile.level,
    totalXp: profile.totalXp,
    tier: profile.tier,
    bodyFat: clamp(num(profile.bodyFat, 0), 0, LIMITS.MAX_BODY_FAT),
    totalReps: profile.totalReps,
    streak: safeStreak(profile.streak).current,
    source: 'measurement',
    measurements: entered,
  });

  await commitBatch(batch);
}

/* -------------------------------------------------------------------------- */
/* Shop                                                                        */
/* -------------------------------------------------------------------------- */

export type PurchaseOutcome = { ok: true; item: ShopItem } | { ok: false; error: string };

/** Spend Bar Coins on a shop item, applying it to the inventory. */
export async function purchaseItem(profile: Profile, itemId: string): Promise<PurchaseOutcome> {
  assertNotDemo();
  const item = findShopItem(itemId);
  if (!item) return { ok: false, error: 'That item does not exist.' };

  const coins = Math.max(0, int(profile.coins, 0));
  if (coins < item.price) {
    return { ok: false, error: `You need ${item.price - coins} more Bar Coins.` };
  }

  const inventory = {
    streakShields: Math.max(0, int(profile.inventory.streakShields, 0)),
    cosmetics: [...arr<string>(profile.inventory.cosmetics)],
    unlocks: [...arr<string>(profile.inventory.unlocks)],
  };

  const patch: Record<string, unknown> = {};

  switch (item.kind) {
    case 'consumable': {
      const max = item.maxStack ?? 99;
      if (inventory.streakShields >= max) {
        return { ok: false, error: `You already hold the maximum of ${max}.` };
      }
      inventory.streakShields += 1;
      break;
    }
    case 'cosmetic': {
      if (inventory.cosmetics.includes(item.id)) {
        return { ok: false, error: 'You already own that cosmetic.' };
      }
      inventory.cosmetics.push(item.id);
      // Newly bought cosmetics apply immediately — buying it is the intent.
      patch.activeCosmetic = item.id;
      break;
    }
    case 'unlock': {
      if (inventory.unlocks.includes(item.id)) {
        return { ok: false, error: 'That is already unlocked.' };
      }
      inventory.unlocks.push(item.id);
      break;
    }
  }

  await updateDoc(userDocRef(profile.uid), {
    ...patch,
    coins: coins - item.price,
    inventory,
    updatedAt: Date.now(),
  });

  if (item.kind === 'cosmetic') {
    await syncPublicProfile({
      ...profile,
      inventory,
      activeCosmetic: (patch.activeCosmetic as string | undefined) ?? profile.activeCosmetic,
    });
  }

  return { ok: true, item };
}

/** Equip or clear a name cosmetic. Only owned cosmetics can be equipped. */
export async function setActiveCosmetic(
  profile: Profile,
  cosmeticId: string | null,
): Promise<void> {
  assertNotDemo();
  if (cosmeticId && !arr<string>(profile.inventory.cosmetics).includes(cosmeticId)) return;
  await updateDoc(userDocRef(profile.uid), {
    activeCosmetic: cosmeticId,
    updatedAt: Date.now(),
  });
  await syncPublicProfile({ ...profile, activeCosmetic: cosmeticId });
}

/* -------------------------------------------------------------------------- */
/* Custom exercises                                                            */
/* -------------------------------------------------------------------------- */

export async function addCustomExercise(
  profile: Profile,
  exercise: Omit<CustomExercise, 'id'>,
): Promise<void> {
  assertNotDemo();
  const existing = arr<CustomExercise>(profile.customExercises);
  if (existing.length >= LIMITS.MAX_CUSTOM_EXERCISES) return;

  const entry: CustomExercise = {
    id: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: str(exercise.name, 'Custom Exercise').trim().slice(0, LIMITS.MAX_NAME_LENGTH),
    unit: exercise.unit === 'seconds' ? 'seconds' : 'reps',
    xpPerUnit: clamp(num(exercise.xpPerUnit, 1), LIMITS.MIN_CUSTOM_XP, LIMITS.MAX_CUSTOM_XP),
    category: exercise.category ?? 'conditioning',
  };

  await updateDoc(userDocRef(profile.uid), {
    customExercises: [...existing, entry],
    updatedAt: Date.now(),
  });
}

export async function removeCustomExercise(profile: Profile, id: string): Promise<void> {
  assertNotDemo();
  await updateDoc(userDocRef(profile.uid), {
    customExercises: arr<CustomExercise>(profile.customExercises).filter((e) => e.id !== id),
    updatedAt: Date.now(),
  });
}

/**
 * Insert or replace a routine.
 *
 * Matching by name as well as id is what makes "save under the same name" the
 * edit path: it overwrites rather than accumulating near-duplicates.
 */
export async function saveRoutine(
  profile: Profile,
  input: { id?: string; name: string; items: RoutineItem[] },
): Promise<void> {
  assertNotDemo();
  const existing = arr<Routine>(profile.routines);
  const now = Date.now();
  const matched =
    existing.find((r) => r.id === input.id) ??
    existing.find((r) => r.name.trim().toLowerCase() === input.name.trim().toLowerCase());

  const routine = buildRoutine({
    // Short by construction: `workouts.presetId` is capped at 40 characters in
    // the rules and this is about 21.
    id: matched?.id ?? `routine_${now.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: input.name,
    items: input.items,
    createdAt: matched?.createdAt ?? now,
    updatedAt: now,
  });

  await updateDoc(userDocRef(profile.uid), {
    routines: upsertRoutine(existing, routine),
    updatedAt: now,
  });
}

export async function deleteRoutine(profile: Profile, id: string): Promise<void> {
  assertNotDemo();
  await updateDoc(userDocRef(profile.uid), {
    routines: removeRoutine(profile.routines, id),
    updatedAt: Date.now(),
  });
}

/** Rename the athlete. Kept short so leaderboard rows stay tidy. */
export async function updateDisplayName(profile: Profile, name: string): Promise<void> {
  assertNotDemo();
  const requested = str(name, '').trim();
  if (requested.length < 2) return;
  const trimmed = sanitizeDisplayName(requested);
  await updateDoc(userDocRef(profile.uid), {
    displayName: trimmed,
    // A name the athlete chose is never second-guessed by the repair pass.
    nameFixedAt: Date.now(),
    updatedAt: Date.now(),
  });
  await syncPublicProfile({ ...profile, displayName: trimmed });
}

/** Persist the per-user display preferences. Never mirrored to the leaderboard. */
export async function updatePreferences(
  profile: Profile,
  patch: { unitSystem?: UnitSystem; gymBroMode?: boolean },
): Promise<void> {
  assertNotDemo();
  const next: Record<string, unknown> = { updatedAt: Date.now() };
  if (patch.unitSystem === 'metric' || patch.unitSystem === 'imperial') {
    next.unitSystem = patch.unitSystem;
  }
  if (typeof patch.gymBroMode === 'boolean') next.gymBroMode = patch.gymBroMode;
  await updateDoc(userDocRef(profile.uid), next);
}

/* -------------------------------------------------------------------------- */
/* History & leaderboard reads                                                 */
/* -------------------------------------------------------------------------- */

export async function fetchStatsHistory(uid: string, max = 120): Promise<StatsSnapshot[]> {
  if (isDemoActive()) return getDemoData().statsHistory.slice(-max);
  const db = getDbOrThrow();
  const q = query(
    collection(db, COLLECTIONS.statsHistory),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    fbLimit(max),
  );
  const snap = await getDocs(q);

  return snap.docs
    .map((d) => normalizeSnapshot(d.id, d.data()))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function fetchWorkouts(uid: string, max = 60): Promise<Workout[]> {
  if (isDemoActive()) return getDemoData().workouts.slice(0, max);
  const db = getDbOrThrow();
  const q = query(
    collection(db, COLLECTIONS.workouts),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    fbLimit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeWorkout(d.id, d.data()));
}

export async function fetchLeaderboard(max = 50): Promise<LeaderboardRow[]> {
  if (isDemoActive()) return getDemoData().leaderboard.slice(0, max);
  const db = getDbOrThrow();
  // Reads the public projection, never the user documents — those are private.
  const q = query(
    collection(db, COLLECTIONS.publicProfiles),
    orderBy('totalXp', 'desc'),
    fbLimit(max),
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const cosmetics = arr<string>(data.cosmetics);
    const active = str(data.activeCosmetic, '');
    return {
      uid: d.id,
      displayName: sanitizeDisplayName(data.displayName),
      photoURL: str(data.photoURL, ''),
      level: levelFromTotalXp(data.totalXp),
      totalXp: Math.max(0, int(data.totalXp, 0)),
      tier: str(data.tier, 'Uninitiated'),
      streak: Math.max(0, int(data.streak, 0)),
      // Only honour a cosmetic the row genuinely owns.
      activeCosmetic: active && cosmetics.includes(active) ? active : null,
      cosmetics,
      seasonId: str(data.seasonId, ''),
      seasonXp: Math.max(0, num(data.seasonXp, 0)),
    };
  });
}

function normalizeSnapshot(id: string, raw: unknown): StatsSnapshot {
  const data = (raw ?? {}) as Record<string, unknown>;
  const stats = (data.stats ?? {}) as Record<string, unknown>;
  return {
    id,
    uid: str(data.uid, ''),
    createdAt: num(data.createdAt, 0),
    day: str(data.day, ''),
    stats: {
      strength: Math.max(0, num(stats.strength, 0)),
      endurance: Math.max(0, num(stats.endurance, 0)),
      aesthetics: Math.max(0, num(stats.aesthetics, 0)),
      discipline: Math.max(0, num(stats.discipline, 0)),
    },
    level: Math.max(1, int(data.level, 1)),
    totalXp: Math.max(0, num(data.totalXp, 0)),
    tier: str(data.tier, 'Uninitiated'),
    bodyFat: Math.max(0, num(data.bodyFat, 0)),
    totalReps: Math.max(0, int(data.totalReps, 0)),
    streak: Math.max(0, int(data.streak, 0)),
    source:
      data.source === 'assessment' || data.source === 'measurement' || data.source === 'correction'
        ? data.source
        : 'workout',
    // Null rather than `{}` when the key is absent, so "no measurements were
    // taken" stays distinguishable from "the key exists but held junk".
    measurements: 'measurements' in data ? normalizeMeasurementValues(data.measurements) : null,
  };
}

function normalizeWorkout(id: string, raw: unknown): Workout {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    id,
    uid: str(data.uid, ''),
    day: str(data.day, ''),
    createdAt: num(data.createdAt, 0),
    entries: arr<Record<string, unknown>>(data.entries).map((e) => {
      const reps = normalizeReps(e.reps);
      return {
        exerciseId: str(e.exerciseId, ''),
        exerciseName: str(e.exerciseName, 'Exercise'),
        unit: e.unit === 'seconds' ? 'seconds' : ('reps' as const),
        sets: Math.max(0, int(e.sets, 0)),
        amount: Math.max(0, int(e.amount, 0)),
        volume: Math.max(0, int(e.volume, 0)),
        ...(reps.length > 1 ? { reps } : {}),
        xp: Math.max(0, int(e.xp, 0)),
      };
    }),
    xpEarned: Math.max(0, int(data.xpEarned, 0)),
    coinsEarned: Math.max(0, int(data.coinsEarned, 0)),
    totalVolume: Math.max(0, int(data.totalVolume, 0)),
    totalReps: Math.max(0, int(data.totalReps, 0)),
    presetId: str(data.presetId, '') || null,
    // Absent on every document written before corrections existed.
    kind: data.kind === 'correction' ? 'correction' : 'session',
    correctsId: str(data.correctsId, '') || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Firestore rejects `undefined` — drop those keys before any write. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Shape a streak-decay result into the profile patch it implies. */
export function decayPatch(result: DecayResult, shieldsHeld: number): Record<string, unknown> {
  const patch: Record<string, unknown> = { streak: result.streak };
  if (result.shieldsConsumed > 0) {
    patch['inventory.streakShields'] = Math.max(0, shieldsHeld - result.shieldsConsumed);
  }
  patch.identity = identityForStreak(result.streak.current).label;
  return patch;
}
