import type { Exercise, Stats, WorkoutEntry } from '../types';
import { num, round } from '../safe';
import { streakMultiplier } from './streak';
import { EMPTY_STATS, STAT_KEYS, levelFromTotalXp } from './constants';
import { entryVolume, normalizeReps } from './sets';

/**
 * How much a unit of XP moves a stat. Stats climb far more slowly than XP —
 * an early session might grant 150 XP but only ~1.5 total stat points, so
 * tier progression stays meaningful over months rather than days.
 */
const STAT_GAIN_PER_XP = 0.01;

/** Volume of one movement, in a session, past which XP is worth less. */
export const DIMINISHING_THRESHOLD = 100;

/** Diminishing returns on very long sets so grinding one movement is not optimal. */
export function volumeMultiplier(volume: number): number {
  const v = Math.max(0, num(volume, 0));
  if (v <= DIMINISHING_THRESHOLD) return 1;
  // Everything past the threshold is worth 60%.
  return (DIMINISHING_THRESHOLD + (v - DIMINISHING_THRESHOLD) * 0.6) / v;
}

/**
 * Streak bonus applied to a whole session.
 *
 * Re-exported from `streak.ts`, which owns the weekly model, so the curve can
 * never drift between the two modules. It used to be defined here as +3% per
 * consecutive *day*.
 */
export { streakMultiplier } from './streak';

/** XP for a movement's volume in one entry, before the session-wide streak bonus. */
export function volumeXp(exercise: Exercise, volume: unknown): number {
  const v = Math.max(0, num(volume, 0));
  if (v <= 0) return 0;
  const raw = v * Math.max(0, num(exercise.xpPerUnit, 0));
  return Math.max(0, Math.round(raw * volumeMultiplier(v)));
}

/** XP for a single exercise entry, before the session-wide streak bonus. */
export function entryXp(exercise: Exercise, sets: unknown, amount: unknown): number {
  return volumeXp(exercise, Math.max(0, num(sets, 0)) * Math.max(0, num(amount, 0)));
}

/** Build a persisted entry from a picked exercise and its logged numbers. */
export function buildEntry(exercise: Exercise, sets: unknown, amount: unknown): WorkoutEntry {
  const s = Math.max(0, Math.floor(num(sets, 0)));
  const a = Math.max(0, Math.floor(num(amount, 0)));
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    unit: exercise.unit,
    sets: s,
    amount: a,
    volume: s * a,
    xp: entryXp(exercise, s, a),
  };
}

/**
 * Build a persisted entry from a per-set ladder, e.g. `[12, 10, 8]`.
 *
 * A ladder whose sets are all equal collapses back to the uniform shape and
 * stores no `reps` array, so the ordinary case keeps writing exactly the
 * documents it wrote before this field existed.
 */
export function buildEntryFromReps(exercise: Exercise, reps: unknown): WorkoutEntry {
  const ladder = normalizeReps(reps);
  if (ladder.length === 0) return buildEntry(exercise, 0, 0);

  const volume = ladder.reduce((total, r) => total + r, 0);
  const uniform = ladder.every((r) => r === ladder[0]);
  if (uniform) return buildEntry(exercise, ladder.length, ladder[0]);

  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    unit: exercise.unit,
    sets: ladder.length,
    amount: Math.max(...ladder),
    volume,
    reps: ladder,
    xp: volumeXp(exercise, volume),
  };
}

/** Stat deltas produced by one entry's XP, distributed by the movement's weights. */
export function entryStatGains(exercise: Exercise, xp: unknown): Stats {
  const gains: Stats = { ...EMPTY_STATS };
  const earned = Math.max(0, num(xp, 0));
  if (earned <= 0) return gains;

  const weights = exercise.statWeights ?? {};
  for (const key of STAT_KEYS) {
    gains[key] = round(earned * num(weights[key], 0) * STAT_GAIN_PER_XP, 4);
  }
  return gains;
}

export interface SessionTotals {
  xp: number;
  /** Session XP before the streak multiplier, after session-level diminishing returns. */
  baseXp: number;
  coins: number;
  statGains: Stats;
  totalVolume: number;
  /** Volume from rep-based movements only — the "total reps" figure. */
  totalReps: number;
  streakBonusXp: number;
}

/**
 * Score a full session.
 *
 * `exercises` must resolve every entry's exerciseId; unresolved entries still
 * contribute their stored XP but no stat gains, so a deleted custom movement
 * can never break a historical recompute.
 */
export function scoreSession(
  entries: WorkoutEntry[],
  resolve: (id: string) => Exercise | undefined,
  streak: unknown,
): SessionTotals {
  const statGains: Stats = { ...EMPTY_STATS };
  let baseXp = 0;
  let totalVolume = 0;
  let totalReps = 0;

  for (const entry of entries) {
    const xp = Math.max(0, num(entry.xp, 0));
    baseXp += xp;
    const volume = entryVolume(entry);
    totalVolume += volume;
    if (entry.unit !== 'seconds') totalReps += volume;

    const exercise = resolve(entry.exerciseId);
    if (!exercise) continue;
    const gains = entryStatGains(exercise, xp);
    for (const key of STAT_KEYS) statGains[key] += gains[key];
  }

  // Diminishing returns are applied per *movement across the whole session*,
  // not per entry. Applying them per entry meant logging 150 push-ups as two
  // entries of 75 dodged the penalty completely, so a rule meant to discourage
  // grinding one movement instead rewarded knowing about the loophole.
  //
  // The penalty is recomputed from raw volume and the movement's own XP rate
  // rather than from the stored per-entry XP, because that stored figure has
  // already had the per-entry penalty applied and re-deriving a rate from it
  // would apply the discount a second time.
  let correctedXp = 0;
  let unresolvedXp = 0;
  const volumeByExercise = new Map<string, number>();
  for (const entry of entries) {
    const volume = entryVolume(entry);
    if (!Number.isFinite(volume) || volume <= 0) {
      // Nothing to rescore — keep whatever was stored.
      unresolvedXp += Math.max(0, num(entry.xp, 0));
      continue;
    }
    if (!resolve(entry.exerciseId)) {
      // A deleted custom movement keeps its stored XP so historical recomputes
      // stay stable, but it cannot take part in session-level scaling.
      unresolvedXp += Math.max(0, num(entry.xp, 0));
      continue;
    }
    volumeByExercise.set(entry.exerciseId, (volumeByExercise.get(entry.exerciseId) ?? 0) + volume);
  }
  for (const [exerciseId, sessionVolume] of volumeByExercise) {
    const exercise = resolve(exerciseId);
    const rate = Math.max(0, num(exercise?.xpPerUnit, 0));
    correctedXp += Math.round(sessionVolume * rate * volumeMultiplier(sessionVolume));
  }
  baseXp = Math.max(0, correctedXp + unresolvedXp);

  const multiplier = streakMultiplier(streak);
  const xp = Math.round(baseXp * multiplier);
  const streakBonusXp = xp - Math.round(baseXp);

  // Showing up is itself a discipline gain, independent of how hard you went.
  statGains.discipline = round(statGains.discipline + 0.35, 4);

  for (const key of STAT_KEYS) statGains[key] = round(statGains[key], 4);

  return {
    xp,
    // Rounded so that baseXp + streakBonusXp === xp exactly, and the summary
    // screen never shows three numbers that fail to add up.
    baseXp: Math.round(baseXp),
    coins: coinsForSession(xp),
    statGains,
    totalVolume,
    totalReps,
    streakBonusXp,
  };
}

/** Bar Coins granted for a session: a flat show-up bonus plus 1 per 12 XP. */
export function coinsForSession(xp: unknown): number {
  return 15 + Math.floor(Math.max(0, num(xp, 0)) / 12);
}

/** Did this session cross a level boundary? Returns levels gained (>= 0). */
export function levelsGained(previousTotalXp: unknown, newTotalXp: unknown): number {
  const before = levelFromTotalXp(previousTotalXp);
  const after = levelFromTotalXp(newTotalXp);
  return Math.max(0, after - before);
}

/**
 * Aesthetics is partly composition-driven: a lower body fat raises the ceiling.
 * Called whenever a new body fat reading is recorded.
 */
export function aestheticsFromBodyFat(bodyFat: unknown, current: unknown): number {
  const bf = num(bodyFat, 20);
  // 8% body fat -> +18 aesthetics, 30% -> +0.
  const bonus = Math.max(0, (30 - bf) * 0.8);
  return round(Math.max(num(current, 0), bonus), 2);
}
