import type { Exercise, Stats, WorkoutEntry } from '../types';
import { num, round } from '../safe';
import { EMPTY_STATS, STAT_KEYS, levelFromTotalXp } from './constants';

/**
 * How much a unit of XP moves a stat. Stats climb far more slowly than XP —
 * an early session might grant 150 XP but only ~1.5 total stat points, so
 * tier progression stays meaningful over months rather than days.
 */
const STAT_GAIN_PER_XP = 0.01;

/** Diminishing returns on very long sets so grinding one movement is not optimal. */
function volumeMultiplier(volume: number): number {
  const v = Math.max(0, num(volume, 0));
  if (v <= 100) return 1;
  // Everything past 100 units is worth 60%.
  return (100 + (v - 100) * 0.6) / v;
}

/** Streak bonus applied to a whole session: +3% per streak day, capped at +45%. */
export function streakMultiplier(streak: unknown): number {
  const days = Math.max(0, num(streak, 0));
  return 1 + Math.min(days * 0.03, 0.45);
}

/** XP for a single exercise entry, before the session-wide streak bonus. */
export function entryXp(exercise: Exercise, sets: unknown, amount: unknown): number {
  const s = Math.max(0, num(sets, 0));
  const a = Math.max(0, num(amount, 0));
  const volume = s * a;
  if (volume <= 0) return 0;

  const raw = volume * Math.max(0, num(exercise.xpPerUnit, 0));
  return Math.max(0, Math.round(raw * volumeMultiplier(volume)));
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
    totalVolume += Math.max(0, num(entry.volume, 0));
    if (entry.unit !== 'seconds') totalReps += Math.max(0, num(entry.volume, 0));

    const exercise = resolve(entry.exerciseId);
    if (!exercise) continue;
    const gains = entryStatGains(exercise, xp);
    for (const key of STAT_KEYS) statGains[key] += gains[key];
  }

  const multiplier = streakMultiplier(streak);
  const xp = Math.round(baseXp * multiplier);
  const streakBonusXp = xp - Math.round(baseXp);

  // Showing up is itself a discipline gain, independent of how hard you went.
  statGains.discipline = round(statGains.discipline + 0.35, 4);

  for (const key of STAT_KEYS) statGains[key] = round(statGains[key], 4);

  return {
    xp,
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
