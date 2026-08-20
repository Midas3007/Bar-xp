import type { Exercise, Profile, Stats, Workout, WorkoutEntry } from '../types';
import { arr, int, num, round } from '../safe';
import { EMPTY_STATS, STAT_KEYS, levelFromTotalXp, tierForStats } from './constants';
import { scoreSession } from './xp';
import { sessionMuscleVolume, subtractMuscleVolume, type MuscleVolume } from './muscles';

/**
 * Reversal maths for voiding a logged session.
 *
 * Pure: no Firestore, no clock beyond an injectable `now`. The ledger stays
 * append-only and gross XP stays monotonic — a correction never rewrites the
 * past, it appends a record that says what to take back, and the XP comes off
 * through a second counter that only ever grows.
 */

/** How long after logging a session it can still be corrected. */
export const CORRECTION_WINDOW_MS = 48 * 60 * 60 * 1000;

/** A minute of tolerance for a device clock running slightly fast. */
const CLOCK_SKEW_MS = 60 * 1000;

export function withinCorrectionWindow(createdAt: unknown, now: number = Date.now()): boolean {
  const at = num(createdAt, NaN);
  if (!Number.isFinite(at) || at <= 0) return false;
  const age = now - at;
  // A timestamp meaningfully in the future is corrupt, not fresh.
  if (age < -CLOCK_SKEW_MS) return false;
  return age <= CORRECTION_WINDOW_MS;
}

export interface Reversal {
  xp: number;
  coins: number;
  totalReps: number;
  statLoss: Stats;
  muscleLoss: MuscleVolume;
}

/**
 * What a logged session added, recomputed from the stored document.
 *
 * Exact where the data allows it: `xp` and `coins` are the amounts `logWorkout`
 * actually added — goal rewards included — read straight back off the document
 * rather than rescored, because the catalog may have changed since.
 *
 * `statLoss` is reproduced rather than stored because it never was stored.
 * Passing `0` as the streak is right for the four scored stats: they derive
 * from each entry's own stored `xp`, and the streak multiplier scales session
 * XP only, never stat gains.
 *
 * One known asymmetry, deliberate. `logWorkout` adds a streak-scaled discipline
 * bonus of `min(streak * 0.05, 1.5)` *outside* `scoreSession`, and the workout
 * document does not record the streak it was logged at — so there is no honest
 * way to reconstruct it here. The reversal therefore leaves up to 1.5 discipline
 * behind. That is the safe direction to be wrong in: guessing from today's
 * streak could take back more than was ever granted, and a residue bounded at
 * 1.5 is an eighth of the smallest tier step.
 */
export function reversalOf(
  workout: Workout,
  resolve: (id: string) => Exercise | undefined,
): Reversal {
  const entries = arr<WorkoutEntry>(workout.entries);
  const scored = scoreSession(entries, resolve, 0);
  return {
    xp: Math.max(0, int(workout.xpEarned, 0)),
    coins: Math.max(0, int(workout.coinsEarned, 0)),
    totalReps: Math.max(0, int(workout.totalReps, 0)),
    statLoss: scored.statGains,
    muscleLoss: sessionMuscleVolume(entries),
  };
}

export interface CorrectedProfile {
  xpVoided: number;
  /** Net XP after the correction. */
  totalXp: number;
  level: number;
  coins: number;
  stats: Stats;
  tier: string;
  totalReps: number;
  workoutCount: number;
  muscleVolume: MuscleVolume;
}

/**
 * Apply a reversal to a profile, flooring everything at zero.
 *
 * `removable` is capped at *net* XP, which is what guarantees the rules
 * invariant `xpVoided <= totalXp` (gross) holds for every possible input,
 * including a corrupt document claiming more XP than the account ever earned.
 */
export function applyReversal(profile: Profile, reversal: Reversal): CorrectedProfile {
  const net = Math.max(0, num(profile.totalXp, 0));
  const removable = Math.min(Math.max(0, num(reversal.xp, 0)), net);
  const xpVoided = Math.max(0, num(profile.xpVoided, 0)) + removable;
  const totalXp = Math.max(0, net - removable);

  const stats: Stats = { ...EMPTY_STATS };
  for (const key of STAT_KEYS) {
    stats[key] = round(
      Math.max(0, num(profile.stats?.[key], 0) - Math.max(0, num(reversal.statLoss?.[key], 0))),
      2,
    );
  }

  return {
    xpVoided,
    totalXp,
    level: levelFromTotalXp(totalXp),
    coins: Math.max(0, int(profile.coins, 0) - Math.max(0, int(reversal.coins, 0))),
    stats,
    tier: tierForStats(stats).name,
    totalReps: Math.max(0, int(profile.totalReps, 0) - Math.max(0, int(reversal.totalReps, 0))),
    workoutCount: Math.max(0, int(profile.workoutCount, 0) - 1),
    muscleVolume: subtractMuscleVolume(profile.muscleVolume, reversal.muscleLoss),
  };
}

/**
 * Whether a session can still be corrected.
 *
 * The 48-hour window is a UX guard, not a security control: the rules already
 * make the maths unexploitable, since `xpVoided` can only grow and can never
 * exceed what was earned.
 */
export function canCorrect(
  workout: Workout,
  alreadyCorrected: boolean,
  now: number = Date.now(),
): boolean {
  if (workout.kind === 'correction') return false;
  if (alreadyCorrected) return false;
  return withinCorrectionWindow(workout.createdAt, now);
}
