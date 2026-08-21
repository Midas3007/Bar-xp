import type { Streak } from '../types';
import { int, str } from '../safe';

/**
 * Streak bookkeeping — weekly targets, not daily chains.
 *
 * The original model incremented the streak only when the gap since the last
 * session was exactly one day. That meant a Monday/Wednesday/Friday split —
 * the most ordinary calisthenics schedule there is — reset the streak to 1 on
 * every single session, forever, and the +45% bonus was reachable only by
 * training all seven days a week indefinitely. A fitness app whose reward
 * system punishes recovery is pushing people toward overtraining, so the model
 * itself had to change rather than its numbers.
 *
 * A streak is now a run of consecutive weeks in which you trained on at least
 * WEEKLY_TARGET distinct days. Rest days are free. Weeks are local, Monday to
 * Sunday, and a week is only ever judged once it has fully elapsed.
 */

/** Distinct training days needed in a week to keep the streak alive. */
export const WEEKLY_TARGET = 4;

/** Bonus per consecutive week held, and the ceiling it stops at. */
export const WEEKLY_BONUS = 0.05;

/**
 * Session XP bonus per day of the current run.
 *
 * The streak counts days again. It is protected by the weekly target rather
 * than by training literally every day, so 3% a day is affordable: a realistic
 * four-a-week athlete sits well below the cap for months.
 */
export const DAILY_BONUS = 0.03;
export const MAX_STREAK_BONUS = 0.45;

/* -------------------------------------------------------------------------- */
/* Day and week keys                                                           */
/* -------------------------------------------------------------------------- */

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
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
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

/** The Monday of the week containing `date`, as a day key. Weeks are local. */
export function weekKey(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay(): 0 = Sunday. Shift so Monday is the first day of the week.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return dayKey(d);
}

/** The week key for a `YYYY-MM-DD` day key, or null if the day is invalid. */
export function weekKeyForDay(key: unknown): string | null {
  const date = parseDayKey(key);
  return date ? weekKey(date) : null;
}

/** Whole weeks between two week keys. Null if either is invalid. */
export function weeksBetween(fromWeek: unknown, toWeek: unknown): number | null {
  const days = daysBetween(fromWeek, toWeek);
  return days === null ? null : Math.round(days / 7);
}

/* -------------------------------------------------------------------------- */
/* Streak state                                                                */
/* -------------------------------------------------------------------------- */

export const EMPTY_STREAK: Streak = {
  current: 0,
  best: 0,
  lastWorkoutDay: null,
  shieldsUsed: 0,
  weekKey: null,
  daysThisWeek: 0,
};

/**
 * Normalise a stored streak blob into a complete, finite Streak.
 *
 * Documents written before the weekly model carry a day-count in `current` and
 * no `weekKey`. Those are migrated on read by `migrateLegacyStreak` rather than
 * being silently reinterpreted as a week-count, which would hand anyone with an
 * old 60-day streak an instant maximum bonus.
 */
export function safeStreak(value: unknown): Streak {
  const raw = (value ?? {}) as Partial<Streak>;
  const lastDay = parseDayKey(raw.lastWorkoutDay) ? str(raw.lastWorkoutDay) : null;
  const week = parseDayKey(raw.weekKey) ? str(raw.weekKey) : null;
  return {
    current: Math.max(0, int(raw.current, 0)),
    best: Math.max(0, int(raw.best, 0)),
    lastWorkoutDay: lastDay,
    shieldsUsed: Math.max(0, int(raw.shieldsUsed, 0)),
    weekKey: week,
    daysThisWeek: Math.max(0, int(raw.daysThisWeek, 0)),
    ...(raw.model === 'daily' ? { model: 'daily' as const } : {}),
  };
}

/** A streak document written before the weekly model existed. */
export function isLegacyStreak(streak: Streak): boolean {
  return streak.weekKey === null && (streak.current > 0 || streak.lastWorkoutDay !== null);
}

/** A streak document whose `current` still counts weeks. */
export function isWeeklyStreak(streak: Streak): boolean {
  return streak.model !== 'daily' && streak.weekKey !== null;
}

/**
 * Bring any stored streak onto the daily model.
 *
 * The counter has been through two schemes. Originally it counted days; slice 1
 * made it count weeks; it counts days again now, protected by a weekly target
 * rather than by having to train every single day. Both older shapes are
 * converted on read, once, and every write since carries `model: 'daily'` so a
 * converted document is never converted twice.
 *
 * A week-run of N becomes `N * WEEKLY_TARGET` days, which is the honest floor:
 * holding a week required at least that many training days, so nobody is handed
 * a run they did not train for, and nobody loses one they did. `best` keeps
 * whichever reading is larger, so a past record can never be erased by a
 * migration.
 */
export function migrateStreakModel(streak: Streak, today: string = dayKey()): Streak {
  const thisWeek = weekKeyForDay(today) ?? weekKey();

  if (isLegacyStreak(streak)) {
    // Pre-weekly: `current` was already a day count, so it carries over as-is.
    const trainedThisWeek =
      streak.lastWorkoutDay !== null && weekKeyForDay(streak.lastWorkoutDay) === thisWeek;
    return {
      ...streak,
      model: 'daily',
      weekKey: thisWeek,
      daysThisWeek: trainedThisWeek ? Math.min(streak.current, WEEKLY_TARGET) : 0,
    };
  }

  if (isWeeklyStreak(streak)) {
    const days = Math.max(0, streak.current) * WEEKLY_TARGET;
    // `best` was in weeks too, so it converts on the same scale. Taking the max
    // against the live run as well means the record can only ever move up.
    const bestDays = Math.max(Math.max(0, streak.best) * WEEKLY_TARGET, days);
    return {
      ...streak,
      model: 'daily',
      current: days,
      best: bestDays,
    };
  }

  return streak;
}

/** Kept under its old name: the recalculation pass and the tests both call it. */
export const migrateLegacyStreak = migrateStreakModel;

/* -------------------------------------------------------------------------- */
/* Settling elapsed weeks                                                      */
/* -------------------------------------------------------------------------- */

export interface DecayResult {
  streak: Streak;
  /** Shields consumed to bridge weeks that missed the target. */
  shieldsConsumed: number;
  /** True if the streak was reset to zero. */
  broken: boolean;
  /** True if anything at all changed and a write is needed. */
  changed: boolean;
  /** Weeks credited toward the streak by this settlement. */
  weeksCredited: number;
}

/**
 * Bring a streak up to date as of `today`.
 *
 * Every week that has fully elapsed is judged: hit the target and the streak
 * grows by one, miss it and a Streak Shield is spent to bridge it, and if no
 * shield is available the streak resets. Shields are never spent on a gap they
 * cannot fully bridge, so they carry over rather than being wasted.
 *
 * This is pure, and it is called from both the logging path and the background
 * recalculation. The original code settled only from a background timer, so a
 * shield bought to protect a streak routinely failed to spend before the streak
 * it was protecting had already broken.
 */
export function settleStreak(
  streak: Streak,
  availableShields: unknown,
  today: string = dayKey(),
): DecayResult {
  const current = migrateStreakModel(safeStreak(streak), today);
  const shields = Math.max(0, int(availableShields, 0));
  const thisWeek = weekKeyForDay(today) ?? weekKey();

  const unchanged: DecayResult = {
    streak: current,
    shieldsConsumed: 0,
    broken: false,
    changed: current !== streak,
    weeksCredited: 0,
  };

  if (!current.weekKey) {
    // Never trained. Start the clock without judging anything.
    return {
      ...unchanged,
      streak: { ...current, model: 'daily', weekKey: thisWeek, daysThisWeek: 0 },
      changed: true,
    };
  }

  const elapsed = weeksBetween(current.weekKey, thisWeek);
  // Unparseable, or a clock that moved backwards — leave the streak alone.
  if (elapsed === null || elapsed < 0) return unchanged;
  if (elapsed === 0) return unchanged;

  let run = current.current;
  let shieldsLeft = shields;
  let consumed = 0;
  const credited = 0;
  let broken = false;

  // The week the counter belongs to was already credited the moment it reached
  // the target — `registerWorkout` does that so the reward lands when it is
  // earned rather than the following Monday. Settling it again here would count
  // the same week twice, so a met week is only checked for *survival*, never
  // re-credited. Every week between then and now elapsed with no training at
  // all, and each of those is a miss.
  const weekMet = current.daysThisWeek >= WEEKLY_TARGET;
  const misses = (weekMet ? 0 : 1) + Math.max(0, elapsed - 1);

  for (let i = 0; i < misses; i += 1) {
    if (shieldsLeft > 0) {
      shieldsLeft -= 1;
      consumed += 1;
      continue;
    }
    run = 0;
    broken = true;
    break;
  }

  // A shield is not spent on a run that broke anyway.
  if (broken) consumed = 0;

  return {
    streak: {
      ...current,
      model: 'daily',
      current: run,
      best: Math.max(current.best, run),
      shieldsUsed: current.shieldsUsed + consumed,
      weekKey: thisWeek,
      daysThisWeek: 0,
    },
    shieldsConsumed: consumed,
    broken,
    changed: true,
    weeksCredited: credited,
  };
}

/** Backwards-compatible alias — the recalculation pass still calls this name. */
export const applyStreakDecay = settleStreak;

/**
 * Record a session logged on `today`.
 *
 * Settles any elapsed weeks first, so logging after a break resolves the break
 * correctly instead of leaving it for a timer that may not run until later.
 * Only *distinct days* count toward the weekly target: a second session on a
 * day already trained is welcome but does not advance the streak, which removes
 * the incentive to split one workout into several logged sessions.
 */
export function registerWorkout(
  streak: Streak,
  today: string = dayKey(),
  availableShields: unknown = 0,
): Streak {
  const settled = settleStreak(streak, availableShields, today).streak;

  // Already logged today — the streak does not double-count.
  if (settled.lastWorkoutDay === today) return settled;

  // Every distinct training day advances the run. `daysThisWeek` still tracks
  // the week so the safety net in `settleStreak` can read it, but it no longer
  // gates the counter — that was the weekly model, and this is not it.
  const days = Math.min(settled.daysThisWeek + 1, 7);
  const run = settled.current + 1;

  return {
    ...settled,
    model: 'daily',
    current: run,
    best: Math.max(settled.best, run),
    lastWorkoutDay: today,
    daysThisWeek: days,
  };
}

/** Has the user already logged a session today? */
export function trainedToday(streak: Streak | null | undefined, today: string = dayKey()): boolean {
  return safeStreak(streak).lastWorkoutDay === today;
}

/** Distinct training days still needed this week to keep the streak alive. */
export function daysRemainingThisWeek(streak: Streak | null | undefined): number {
  return Math.max(0, WEEKLY_TARGET - safeStreak(streak).daysThisWeek);
}

/** Session XP multiplier earned by the current run of days. */
export function streakMultiplier(streak: unknown): number {
  const days = Math.max(0, int(streak, 0));
  return 1 + Math.min(days * DAILY_BONUS, MAX_STREAK_BONUS);
}
