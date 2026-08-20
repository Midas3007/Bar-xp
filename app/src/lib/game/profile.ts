import type { Assessment, CustomExercise, Goal, Inventory, Profile, Stats } from '../types';
import { arr, clamp, int, num, round, str } from '../safe';
import { EMPTY_STATS, identityForStreak, levelFromTotalXp, safeStats, tierForStats } from './constants';
import { EMPTY_STREAK, safeStreak } from './streak';
import { ensureGoals } from './goals';
import { LIMITS } from './validation';
import { normalizeMuscleVolume } from './muscles';
import { normalizeRoutines } from './routines';
import { normalizeMeasurements } from './measurements';
import { safeSeason, safeSeasonHistory, seasonIdFor } from './season';
import { RECENT_DAYS_KEPT } from './friends';

/** The placeholder shown when an athlete has no usable name. */
export const UNNAMED_ATHLETE = 'Unnamed Athlete';

/**
 * The longest display name the security rules accept.
 *
 * This is not a style preference — `firestore.rules` enforces
 * `isShortString(d.displayName, 40)` on both create and update, so a name over
 * this length makes *every* write to the document fail, not just the first.
 */
export const MAX_DISPLAY_NAME = LIMITS.MAX_NAME_LENGTH;

/**
 * Coerce anything into a display name the rules will accept.
 *
 * Total by construction: it always returns a non-empty string of at most
 * `MAX_DISPLAY_NAME` UTF-16 units, which can never exceed 40 characters as the
 * rules count them.
 */
export function sanitizeDisplayName(raw: unknown): string {
  const collapsed = str(raw, '')
    // Control characters render as nothing and wreck the leaderboard layout.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!collapsed) return UNNAMED_ATHLETE;

  let out = collapsed.slice(0, MAX_DISPLAY_NAME);
  // Slicing must never leave the dangling half of a surrogate pair behind.
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  out = out.trim();

  return out || UNNAMED_ATHLETE;
}

export const EMPTY_INVENTORY: Inventory = {
  streakShields: 0,
  cosmetics: [],
  unlocks: [],
};

/**
 * Normalise a raw Firestore document into a complete Profile.
 *
 * Every read goes through here. Documents written by an older schema, or
 * partially written by an interrupted transaction, still produce a fully
 * populated object with finite numbers — this is the single most important
 * guard against NaN reaching the UI.
 */
export function normalizeProfile(uid: string, raw: unknown): Profile {
  const data = (raw ?? {}) as Partial<Profile>;

  const stats = safeStats(data.stats);
  const streak = safeStreak(data.streak);
  // Two append-only counters, one honest net figure. The stored `totalXp` field
  // keeps its exact meaning — gross lifetime XP, only ever increasing — and a
  // correction adds to `xpVoided` rather than subtracting from it. Every
  // document written before corrections existed lacks the field, which reads as
  // 0, so net equals gross for every account today.
  const grossXp = Math.max(0, num(data.totalXp, 0));
  const xpVoided = clamp(num(data.xpVoided, 0), 0, grossXp);
  const totalXp = Math.max(0, grossXp - xpVoided);

  const inventoryRaw = (data.inventory ?? {}) as Partial<Inventory>;
  const inventory: Inventory = {
    streakShields: Math.max(0, int(inventoryRaw.streakShields, 0)),
    cosmetics: arr<string>(inventoryRaw.cosmetics).filter((c) => typeof c === 'string'),
    unlocks: arr<string>(inventoryRaw.unlocks).filter((u) => typeof u === 'string'),
  };

  // Level is always derived from *net* XP rather than trusted from the
  // document, so the two can never drift apart.
  const level = levelFromTotalXp(totalXp);

  return {
    uid,
    displayName: sanitizeDisplayName(data.displayName),
    email: str(data.email, ''),
    photoURL: str(data.photoURL, ''),
    createdAt: num(data.createdAt, Date.now()),
    updatedAt: num(data.updatedAt, Date.now()),

    onboarded: data.onboarded === true,
    assessment: normalizeAssessment(data.assessment),

    level,
    grossXp,
    xpVoided,
    totalXp,
    coins: Math.max(0, int(data.coins, 0)),
    // Monotonic by construction: an absent or stale stored value still reads as
    // at least the current balance, so the badge cannot un-earn itself.
    coinsPeak: Math.max(Math.max(0, int(data.coinsPeak, 0)), Math.max(0, int(data.coins, 0))),

    stats,
    // Tier and identity are *derived* for display rather than trusted from the
    // document, so a badge can never disagree with the rank bar beside it. The
    // raw stored values are kept below purely so the background recalculation
    // can spot drift and persist a correction for the leaderboard.
    tier: tierForStats(stats).name,
    identity: identityForStreak(streak.current).label,
    storedTier: str(data.tier, ''),
    storedIdentity: str(data.identity, ''),
    bodyFat: clamp(num(data.bodyFat, 0), 0, LIMITS.MAX_BODY_FAT),
    measurements: normalizeMeasurements(data.measurements),
    unitSystem: data.unitSystem === 'imperial' ? 'imperial' : 'metric',
    // Gym Bro Mode is on by default, so absence means on — only an explicit
    // `false` in the document turns it off. Every account created before this
    // slice therefore lands on the meme labels, which is the intent.
    gymBroMode: data.gymBroMode !== false,

    streak,
    inventory,
    activeCosmetic:
      typeof data.activeCosmetic === 'string' && inventory.cosmetics.includes(data.activeCosmetic)
        ? data.activeCosmetic
        : null,

    personalBests: normalizePersonalBests(data.personalBests),
    customExercises: normalizeCustomExercises(data.customExercises),
    routines: normalizeRoutines(data.routines),
    goals: normalizeGoals(data.goals, level),

    workoutCount: Math.max(0, int(data.workoutCount, 0)),
    totalReps: Math.max(0, int(data.totalReps, 0)),
    muscleVolume: normalizeMuscleVolume(data.muscleVolume) as Record<string, number>,

    // All three are absent on every document written before seasons existed.
    // `safeSeason` returns id '', which `rolloverSeason` then initialises
    // without inventing a placement for a season that never had a counter.
    season: safeSeason(data.season),
    seasonHistory: safeSeasonHistory(data.seasonHistory),
    recentDays: arr<unknown>(data.recentDays)
      .map((d) => str(d, ''))
      .filter((d) => d !== '')
      .slice(0, RECENT_DAYS_KEPT),
  };
}

function normalizeAssessment(raw: unknown): Assessment | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Partial<Assessment>;
  return {
    maxPullUps: Math.max(0, int(a.maxPullUps, 0)),
    maxPushUps: Math.max(0, int(a.maxPushUps, 0)),
    plankSeconds: Math.max(0, int(a.plankSeconds, 0)),
    bodyFat: clamp(num(a.bodyFat, 20), 0, LIMITS.MAX_BODY_FAT),
    completedAt: num(a.completedAt, Date.now()),
  };
}

function normalizePersonalBests(raw: unknown): Profile['personalBests'] {
  if (!raw || typeof raw !== 'object') return {};
  const out: Profile['personalBests'] = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const pb = value as Record<string, unknown>;
    const amount = num(pb.value, 0);
    if (amount <= 0) continue;
    out[key] = {
      exerciseId: str(pb.exerciseId, key),
      exerciseName: str(pb.exerciseName, key),
      unit: pb.unit === 'seconds' ? 'seconds' : 'reps',
      value: Math.floor(amount),
      achievedAt: num(pb.achievedAt, 0),
    };
  }
  return out;
}

function normalizeCustomExercises(raw: unknown): CustomExercise[] {
  return arr<Partial<CustomExercise>>(raw)
    .filter((c) => c && typeof c === 'object' && typeof c.id === 'string')
    .slice(0, LIMITS.MAX_CUSTOM_EXERCISES)
    .map((c) => ({
      id: str(c.id, 'custom'),
      name: str(c.name, 'Custom Exercise').slice(0, LIMITS.MAX_NAME_LENGTH),
      unit: c.unit === 'seconds' ? 'seconds' : 'reps',
      xpPerUnit: clamp(num(c.xpPerUnit, 1), LIMITS.MIN_CUSTOM_XP, LIMITS.MAX_CUSTOM_XP),
      category: c.category ?? 'conditioning',
    }));
}

function normalizeGoals(raw: unknown, level: number): Goal[] {
  const goals = arr<Partial<Goal>>(raw)
    .filter((g) => g && typeof g === 'object' && typeof g.id === 'string')
    .map<Goal>((g) => ({
      id: str(g.id, 'goal'),
      templateId: str(g.templateId, str(g.id, 'goal')),
      title: str(g.title, 'Goal'),
      description: str(g.description, ''),
      type: (g.type ?? 'workouts') as Goal['type'],
      ...(g.category ? { category: g.category } : {}),
      target: Math.max(1, num(g.target, 1)),
      progress: Math.max(0, num(g.progress, 0)),
      rewardXp: Math.max(0, int(g.rewardXp, 0)),
      rewardCoins: Math.max(0, int(g.rewardCoins, 0)),
      createdAt: num(g.createdAt, Date.now()),
      completedAt: g.completedAt ? num(g.completedAt, null as unknown as number) : null,
    }));

  return ensureGoals(level, goals);
}

/* -------------------------------------------------------------------------- */
/* Assessment -> baseline stats                                                */
/* -------------------------------------------------------------------------- */

export interface AssessmentInput {
  maxPullUps: number;
  maxPushUps: number;
  plankSeconds: number;
  bodyFat: number;
}

/**
 * Convert the onboarding assessment into starting stats.
 *
 * The scales are tuned so a complete beginner (0 pull-ups, 5 push-ups, 20s
 * plank, 25% body fat) lands at Uninitiated, while a strong athlete (15
 * pull-ups, 60 push-ups, 3min plank, 10% body fat) starts around Gold.
 */
/**
 * The highest any single stat can start at from the onboarding assessment.
 *
 * Tier is the average of the four core stats, so this ceiling puts the best
 * possible assessment at Gold (45) and keeps Platinum (68) and everything above
 * it behind real logged training.
 */
export const ASSESSMENT_STAT_CEILING = 60;

export function baselineStats(input: AssessmentInput): Stats {
  const pullUps = Math.max(0, num(input.maxPullUps, 0));
  const pushUps = Math.max(0, num(input.maxPushUps, 0));
  const plank = Math.max(0, num(input.plankSeconds, 0));
  const bodyFat = clamp(num(input.bodyFat, 20), LIMITS.MIN_BODY_FAT, LIMITS.MAX_BODY_FAT);

  // Pull-ups are the single strongest signal of relative strength.
  const strength = round(pullUps * 3.2 + pushUps * 0.55 + plank * 0.06, 2);

  // Endurance leans on rep capacity and hold duration.
  const endurance = round(pushUps * 0.85 + plank * 0.22 + pullUps * 1.1, 2);

  // Aesthetics is composition-led with a nod to overall training volume.
  const leanness = Math.max(0, (30 - bodyFat) * 1.6);
  const aesthetics = round(leanness + pushUps * 0.25 + pullUps * 0.9, 2);

  // Everyone starts with a small Discipline floor for finishing the assessment.
  const discipline = round(4 + Math.min(pullUps * 0.4 + pushUps * 0.1, 12), 2);

  // A self-reported form cannot hand out a rank. Even the strongest credible
  // answers land inside Gold, leaving every tier above it to be earned by
  // logging actual training. Nothing here is verified, so nothing here should
  // be able to finish the game.
  const cap = (value: number) => Math.max(0, Math.min(value, ASSESSMENT_STAT_CEILING));

  return {
    strength: cap(strength),
    endurance: cap(endurance),
    aesthetics: cap(aesthetics),
    discipline: cap(discipline),
  };
}

/** A brand-new profile document for a freshly created account. */
export function newProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
}): Profile {
  const now = Date.now();
  return {
    uid: params.uid,
    displayName: sanitizeDisplayName(params.displayName),
    email: params.email,
    photoURL: params.photoURL,
    createdAt: now,
    updatedAt: now,

    onboarded: false,
    assessment: null,

    level: 1,
    grossXp: 0,
    xpVoided: 0,
    totalXp: 0,
    coins: 100,
    coinsPeak: 100,

    stats: { ...EMPTY_STATS },
    tier: tierForStats(EMPTY_STATS).name,
    identity: identityForStreak(0).label,
    storedTier: tierForStats(EMPTY_STATS).name,
    storedIdentity: identityForStreak(0).label,
    bodyFat: 0,
    measurements: null,
    unitSystem: 'metric',
    gymBroMode: true,

    streak: { ...EMPTY_STREAK },
    inventory: { streakShields: 0, cosmetics: [], unlocks: [] },
    activeCosmetic: null,

    personalBests: {},
    customExercises: [],
    routines: [],
    goals: [],

    workoutCount: 0,
    totalReps: 0,
    muscleVolume: {},

    season: { id: seasonIdFor(), xp: 0, sessions: 0, startedAt: now },
    seasonHistory: [],
    recentDays: [],
  };
}
