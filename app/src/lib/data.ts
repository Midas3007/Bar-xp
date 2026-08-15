import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';

import { COLLECTIONS, getDbOrThrow } from './firebase';
import type {
  CustomExercise,
  Exercise,
  LeaderboardRow,
  PersonalBest,
  Profile,
  StatsSnapshot,
  Workout,
  WorkoutEntry,
} from './types';
import { arr, clamp, int, num, round, str } from './safe';
import { STAT_KEYS, identityForStreak, levelFromTotalXp, tierForStats } from './game/constants';
import { newProfile, normalizeProfile, baselineStats, type AssessmentInput } from './game/profile';
import { dayKey, registerWorkout, safeStreak, type DecayResult } from './game/streak';
import { advanceGoals, ensureGoals } from './game/goals';
import { aestheticsFromBodyFat, scoreSession } from './game/xp';
import { findShopItem, type ShopItem } from './game/shop';
import { LIMITS } from './game/validation';

/* -------------------------------------------------------------------------- */
/* Profile lifecycle                                                           */
/* -------------------------------------------------------------------------- */

export function userDocRef(uid: string) {
  return doc(getDbOrThrow(), COLLECTIONS.users, uid);
}

/** Create the user document on first sign-in, or return the existing one. */
export async function ensureProfile(user: User): Promise<Profile> {
  const ref = userDocRef(user.uid);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    const profile = normalizeProfile(user.uid, snapshot.data());

    // Keep the auth identity in sync if the provider details changed.
    const patch: Record<string, unknown> = {};
    const authName = str(user.displayName, '').trim();
    if (authName && authName !== profile.displayName && profile.displayName === 'Unnamed Athlete') {
      patch.displayName = authName;
    }
    if (user.photoURL && user.photoURL !== profile.photoURL) patch.photoURL = user.photoURL;
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = Date.now();
      await updateDoc(ref, patch);
    }

    return profile;
  }

  const fresh = newProfile({
    uid: user.uid,
    displayName: str(user.displayName, '') || str(user.email, '').split('@')[0] || 'Unnamed Athlete',
    email: str(user.email, ''),
    photoURL: str(user.photoURL, ''),
  });

  // `goals` starts empty; the first roll happens after onboarding so the
  // templates can respect the user's assessed level. `uid` is the document id
  // and `storedTier`/`storedIdentity` are client-side derivation helpers, so
  // none of them belong in the document body.
  const { uid: _uid, storedTier: _tier, storedIdentity: _identity, ...document } = fresh;
  await setDoc(ref, stripUndefined(document));
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

/**
 * Save the onboarding assessment.
 *
 * Writes the baseline stats onto the profile and records the very first
 * `stats_history` snapshot so the progress charts have an origin point.
 */
export async function completeAssessment(
  profile: Profile,
  input: AssessmentInput,
): Promise<AssessmentResult> {
  const db = getDbOrThrow();
  const stats = baselineStats(input);
  const tier = tierForStats(stats).name;
  const bodyFat = clamp(num(input.bodyFat, 20), LIMITS.MIN_BODY_FAT, LIMITS.MAX_BODY_FAT);
  const now = Date.now();
  const today = dayKey();

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
  });

  await batch.commit();
  return { stats, tier };
}

/* -------------------------------------------------------------------------- */
/* Workout logging                                                             */
/* -------------------------------------------------------------------------- */

export interface LogWorkoutResult {
  xpEarned: number;
  coinsEarned: number;
  levelsGained: number;
  newLevel: number;
  newTier: string;
  tierChanged: boolean;
  newPersonalBests: PersonalBest[];
  completedGoals: string[];
  goalRewardXp: number;
  goalRewardCoins: number;
  streak: number;
  totalReps: number;
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
  const db = getDbOrThrow();
  const now = Date.now();
  const today = dayKey();

  const streakBefore = safeStreak(profile.streak);
  const totals = scoreSession(entries, resolve, streakBefore.current);

  // The streak advances first — the session's own XP already used the prior
  // multiplier, so today's increment applies from the next session onward.
  const streakAfter = registerWorkout(streakBefore, today);

  const goalOutcome = advanceGoals(profile.goals, profile.level, {
    entries,
    resolve,
    xpEarned: totals.xp,
    totalReps: totals.totalReps,
    streak: streakAfter.current,
  });

  const xpEarned = totals.xp + goalOutcome.rewardXp;
  const coinsEarned = totals.coins + goalOutcome.rewardCoins;

  const previousTotalXp = Math.max(0, num(profile.totalXp, 0));
  const newTotalXp = previousTotalXp + xpEarned;
  const previousLevel = levelFromTotalXp(previousTotalXp);
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

  const workoutRef = doc(collection(db, COLLECTIONS.workouts));
  const snapshotRef = doc(collection(db, COLLECTIONS.statsHistory));
  const totalReps = Math.max(0, int(profile.totalReps, 0)) + totals.totalReps;

  const batch = writeBatch(db);

  batch.set(workoutRef, {
    uid: profile.uid,
    day: today,
    createdAt: now,
    entries: entries.map((e) => ({
      exerciseId: str(e.exerciseId, ''),
      exerciseName: str(e.exerciseName, ''),
      unit: e.unit === 'seconds' ? 'seconds' : 'reps',
      sets: Math.max(0, int(e.sets, 0)),
      amount: Math.max(0, int(e.amount, 0)),
      volume: Math.max(0, int(e.volume, 0)),
      xp: Math.max(0, int(e.xp, 0)),
    })),
    xpEarned,
    coinsEarned,
    totalVolume: Math.max(0, int(totals.totalVolume, 0)),
    totalReps: Math.max(0, int(totals.totalReps, 0)),
    presetId: presetId ?? null,
  });

  batch.update(userDocRef(profile.uid), {
    totalXp: newTotalXp,
    level: newLevel,
    coins: Math.max(0, int(profile.coins, 0)) + coinsEarned,
    stats,
    tier: tierAfter.name,
    identity: identityAfter.label,
    streak: streakAfter,
    personalBests,
    goals: goalOutcome.goals,
    workoutCount: Math.max(0, int(profile.workoutCount, 0)) + 1,
    totalReps,
    updatedAt: now,
  });

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

  await batch.commit();

  return {
    xpEarned,
    coinsEarned,
    levelsGained: Math.max(0, newLevel - previousLevel),
    newLevel,
    newTier: tierAfter.name,
    tierChanged: tierAfter.name !== profile.tier,
    newPersonalBests: fresh,
    completedGoals: goalOutcome.completed.map((g) => g.title),
    goalRewardXp: goalOutcome.rewardXp,
    goalRewardCoins: goalOutcome.rewardCoins,
    streak: streakAfter.current,
    totalReps: totals.totalReps,
  };
}

/** Merge a session's best sets into the stored PR map. */
function mergePersonalBests(
  existing: Profile['personalBests'],
  entries: WorkoutEntry[],
): { personalBests: Profile['personalBests']; fresh: PersonalBest[] } {
  const personalBests: Profile['personalBests'] = { ...existing };
  const fresh: PersonalBest[] = [];

  for (const entry of entries) {
    const id = str(entry.exerciseId, '');
    if (!id) continue;
    // A PR is the best *single set*, not the session total.
    const value = Math.max(0, int(entry.amount, 0));
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
    // Only announce a PR when there was something to beat.
    if (current) fresh.push(record);
  }

  return { personalBests, fresh };
}

/* -------------------------------------------------------------------------- */
/* Body composition                                                            */
/* -------------------------------------------------------------------------- */

/** Record a new body fat reading; aesthetics gets a floor from leanness. */
export async function updateBodyFat(profile: Profile, bodyFat: number): Promise<void> {
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

  await batch.commit();
}

/* -------------------------------------------------------------------------- */
/* Shop                                                                        */
/* -------------------------------------------------------------------------- */

export type PurchaseOutcome =
  | { ok: true; item: ShopItem }
  | { ok: false; error: string };

/** Spend Bar Coins on a shop item, applying it to the inventory. */
export async function purchaseItem(profile: Profile, itemId: string): Promise<PurchaseOutcome> {
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

  return { ok: true, item };
}

/** Equip or clear a name cosmetic. Only owned cosmetics can be equipped. */
export async function setActiveCosmetic(
  profile: Profile,
  cosmeticId: string | null,
): Promise<void> {
  if (cosmeticId && !arr<string>(profile.inventory.cosmetics).includes(cosmeticId)) return;
  await updateDoc(userDocRef(profile.uid), {
    activeCosmetic: cosmeticId,
    updatedAt: Date.now(),
  });
}

/* -------------------------------------------------------------------------- */
/* Custom exercises                                                            */
/* -------------------------------------------------------------------------- */

export async function addCustomExercise(
  profile: Profile,
  exercise: Omit<CustomExercise, 'id'>,
): Promise<void> {
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
  await updateDoc(userDocRef(profile.uid), {
    customExercises: arr<CustomExercise>(profile.customExercises).filter((e) => e.id !== id),
    updatedAt: Date.now(),
  });
}

/** Rename the athlete. Kept short so leaderboard rows stay tidy. */
export async function updateDisplayName(profile: Profile, name: string): Promise<void> {
  const trimmed = str(name, '').trim().slice(0, LIMITS.MAX_NAME_LENGTH);
  if (trimmed.length < 2) return;
  await updateDoc(userDocRef(profile.uid), { displayName: trimmed, updatedAt: Date.now() });
}

/* -------------------------------------------------------------------------- */
/* History & leaderboard reads                                                 */
/* -------------------------------------------------------------------------- */

export async function fetchStatsHistory(uid: string, max = 120): Promise<StatsSnapshot[]> {
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
  const db = getDbOrThrow();
  const q = query(
    collection(db, COLLECTIONS.users),
    orderBy('totalXp', 'desc'),
    fbLimit(max),
  );
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const cosmetics = arr<string>((data.inventory as { cosmetics?: unknown })?.cosmetics);
    const active = str(data.activeCosmetic, '');
    return {
      uid: d.id,
      displayName: str(data.displayName, '').trim() || 'Unnamed Athlete',
      photoURL: str(data.photoURL, ''),
      level: levelFromTotalXp(data.totalXp),
      totalXp: Math.max(0, int(data.totalXp, 0)),
      tier: str(data.tier, 'Uninitiated'),
      streak: Math.max(0, int((data.streak as { current?: unknown })?.current, 0)),
      // Only honour a cosmetic the row genuinely owns.
      activeCosmetic: active && cosmetics.includes(active) ? active : null,
      cosmetics,
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
    source: data.source === 'assessment' ? 'assessment' : 'workout',
  };
}

function normalizeWorkout(id: string, raw: unknown): Workout {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    id,
    uid: str(data.uid, ''),
    day: str(data.day, ''),
    createdAt: num(data.createdAt, 0),
    entries: arr<Record<string, unknown>>(data.entries).map((e) => ({
      exerciseId: str(e.exerciseId, ''),
      exerciseName: str(e.exerciseName, 'Exercise'),
      unit: e.unit === 'seconds' ? 'seconds' : 'reps',
      sets: Math.max(0, int(e.sets, 0)),
      amount: Math.max(0, int(e.amount, 0)),
      volume: Math.max(0, int(e.volume, 0)),
      xp: Math.max(0, int(e.xp, 0)),
    })),
    xpEarned: Math.max(0, int(data.xpEarned, 0)),
    coinsEarned: Math.max(0, int(data.coinsEarned, 0)),
    totalVolume: Math.max(0, int(data.totalVolume, 0)),
    totalReps: Math.max(0, int(data.totalReps, 0)),
    presetId: str(data.presetId, '') || null,
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
