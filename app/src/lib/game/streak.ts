import type { Streak } from '../types';
import { int, str } from '../safe';

/**
 * Streak bookkeeping.
 *
 * Days are local calendar days (`YYYY-MM-DD`) rather than timestamps, so a
 * workout at 23:50 and one at 00:10 correctly count as two separate days, and
 * a user's streak follows the calendar they actually live in.
 */

/** Local calendar day for a Date, `YYYY-MM-DD`. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a `YYYY-MM-DD` key back into a local midnight Date, or null. */
export function parseDayKey(key: unknown): Date | null {
  const value = str(key, '');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Reject impossible dates like 2024-02-31 that Date would silently roll over.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Whole calendar days between two day keys. Returns null if either is invalid. */
export function daysBetween(fromKey: unknown, toKey: unknown): number | null {
  const from = parseDayKey(fromKey);
  const to = parseDayKey(toKey);
  if (!from || !to) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  // Round rather than floor: DST shifts make the raw difference 23 or 25 hours.
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

/** Add days to a day key. */
export function addDays(key: string, days: number): string {
  const date = parseDayKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + int(days, 0));
  return dayKey(date);
}

export const EMPTY_STREAK: Streak = {
  current: 0,
  best: 0,
  lastWorkoutDay: null,
  shieldsUsed: 0,
};

/** Normalise a stored streak blob into a complete, finite Streak. */
export function safeStreak(value: unknown): Streak {
  const raw = (value ?? {}) as Partial<Streak>;
  const lastDay = parseDayKey(raw.lastWorkoutDay) ? str(raw.lastWorkoutDay) : null;
  return {
    current: Math.max(0, int(raw.current, 0)),
    best: Math.max(0, int(raw.best, 0)),
    lastWorkoutDay: lastDay,
    shieldsUsed: Math.max(0, int(raw.shieldsUsed, 0)),
  };
}

export interface DecayResult {
  streak: Streak;
  /** Shields consumed to bridge missed days. */
  shieldsConsumed: number;
  /** True if the streak was reset to zero. */
  broken: boolean;
  /** True if anything at all changed and a write is needed. */
  changed: boolean;
}

/**
 * Apply streak decay for the time elapsed since the last workout.
 *
 * Rules:
 *  - Worked out today or yesterday -> the streak is still live, nothing to do.
 *  - Each *fully missed* day can be bridged by consuming one Streak Shield.
 *  - Shields are consumed automatically, oldest gap first, while stock lasts.
 *  - If the gap outruns the shields, the streak resets to zero.
 *
 * This is pure: the caller decides whether to persist the result.
 */
export function applyStreakDecay(
  streak: Streak,
  availableShields: unknown,
  today: string = dayKey(),
): DecayResult {
  const current = safeStreak(streak);
  const shields = Math.max(0, int(availableShields, 0));

  if (!current.lastWorkoutDay) {
    // Never trained. Nothing can decay, but a stale non-zero streak is repaired.
    if (current.current !== 0) {
      return {
        streak: { ...current, current: 0 },
        shieldsConsumed: 0,
        broken: true,
        changed: true,
      };
    }
    return { streak: current, shieldsConsumed: 0, broken: false, changed: false };
  }

  const gap = daysBetween(current.lastWorkoutDay, today);

  // Unparseable or a clock that moved backwards — leave the streak untouched.
  if (gap === null || gap < 0) {
    return { streak: current, shieldsConsumed: 0, broken: false, changed: false };
  }

  // Trained today, or trained yesterday and today is still open.
  if (gap <= 1) {
    return { streak: current, shieldsConsumed: 0, broken: false, changed: false };
  }

  // gap >= 2 means (gap - 1) whole days went by with no session.
  const missedDays = gap - 1;

  if (shields >= missedDays) {
    // Every missed day is bridged. The streak survives intact, and the last
    // workout day advances to yesterday so tomorrow's check starts clean.
    return {
      streak: {
        ...current,
        lastWorkoutDay: addDays(today, -1),
        shieldsUsed: current.shieldsUsed + missedDays,
      },
      shieldsConsumed: missedDays,
      broken: false,
      changed: true,
    };
  }

  // Not enough shields to cover the gap — the streak breaks. Shields are not
  // spent on a gap they cannot bridge, so they carry over to the next attempt.
  return {
    streak: {
      ...current,
      current: 0,
      lastWorkoutDay: null,
    },
    shieldsConsumed: 0,
    broken: true,
    changed: current.current !== 0 || current.lastWorkoutDay !== null,
  };
}

/** Advance the streak for a workout logged on `today`. */
export function registerWorkout(streak: Streak, today: string = dayKey()): Streak {
  const current = safeStreak(streak);

  // Already logged today — the streak does not double-count.
  if (current.lastWorkoutDay === today) return current;

  const gap = daysBetween(current.lastWorkoutDay, today);
  // Consecutive if yesterday; otherwise this session starts a fresh streak at 1.
  const next = gap === 1 ? current.current + 1 : 1;

  return {
    ...current,
    current: next,
    best: Math.max(current.best, next),
    lastWorkoutDay: today,
  };
}

/** Has the user already logged a session today? */
export function trainedToday(streak: Streak | null | undefined, today: string = dayKey()): boolean {
  return safeStreak(streak).lastWorkoutDay === today;
}
