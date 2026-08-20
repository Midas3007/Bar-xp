import type { WorkoutEntry } from '../types';
import { arr, int, num } from '../safe';

/**
 * Per-set primitives.
 *
 * Every consumer of a set ladder reads it through here, so there is exactly one
 * definition of "how much work was that". Imports are deliberately limited to
 * `../types` and `../safe`: `validation.ts` imports this module, so this module
 * must never import `validation.ts`.
 */

/** Hard ceiling on stored sets. Mirrors LIMITS.MAX_SETS, which is the bound that is enforced. */
const SET_CEILING = 20;

/** Coerce a stored or typed set ladder into finite whole numbers. Blank sets are dropped. */
export function normalizeReps(value: unknown, maxSets = SET_CEILING): number[] {
  return arr<unknown>(value)
    .map((r) => Math.max(0, int(r, 0)))
    .filter((r) => r > 0)
    .slice(0, Math.max(0, int(maxSets, SET_CEILING)));
}

/** Per-set figures for an entry: the stored ladder, or the uniform expansion. */
export function entryReps(entry: Partial<WorkoutEntry>): number[] {
  const stored = normalizeReps(entry?.reps);
  if (stored.length > 0) return stored;
  const sets = Math.max(0, Math.min(int(entry?.sets, 0), SET_CEILING));
  const amount = Math.max(0, int(entry?.amount, 0));
  if (sets <= 0 || amount <= 0) return [];
  return Array.from({ length: sets }, () => amount);
}

/**
 * Total units in one entry.
 *
 * A stored ladder wins; otherwise the stored `volume` is returned untouched. It
 * deliberately does *not* fall back to `sets * amount` — historical documents
 * are scored from `volume` today, and re-deriving it would change what an
 * already-written session is worth.
 */
export function entryVolume(entry: Partial<WorkoutEntry>): number {
  const stored = normalizeReps(entry?.reps);
  if (stored.length > 0) return stored.reduce((total, r) => total + r, 0);
  return Math.max(0, num(entry?.volume, 0));
}

/** The best single set in an entry — what a personal best measures. */
export function bestSet(entry: Partial<WorkoutEntry>): number {
  const ladder = normalizeReps(entry?.reps);
  if (ladder.length > 0) return Math.max(...ladder);
  return Math.max(0, int(entry?.amount, 0));
}

/** `3 × 10` for a uniform entry, `12 / 10 / 8` for a ladder. Unit suffix is the caller's job. */
export function formatSetLadder(entry: Partial<WorkoutEntry>, maxShown = 8): string {
  const ladder = normalizeReps(entry?.reps);
  if (ladder.length === 0) {
    return `${Math.max(0, int(entry?.sets, 0))} × ${Math.max(0, int(entry?.amount, 0))}`;
  }
  const shown = ladder.slice(0, Math.max(1, maxShown));
  const rest = ladder.length - shown.length;
  return rest > 0 ? `${shown.join(' / ')} +${rest}` : shown.join(' / ');
}
