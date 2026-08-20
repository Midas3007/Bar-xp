import type { Challenge, ChallengeScore, Workout, WorkoutEntry } from '../types';
import { arr, int, num, str } from '../safe';
import { addDays, weekKey } from './streak';

/**
 * Challenges between two friends.
 *
 * Pure: scoring runs over workouts the caller already holds, and the *result is
 * never stored*. Both clients derive the same winner from the same two score
 * documents, so there is nothing to forge, no rule deciding who may declare
 * victory, and no way for the two sides to disagree about a stored answer.
 *
 * Every rep in Bar XP is self-reported, so a challenge score is too. This file
 * does not pretend otherwise; what the rules guarantee is narrower and
 * achievable — nobody writes anybody else's number.
 */

export type ChallengeMetric = 'sessions' | 'volume' | 'xp' | 'exercise_volume';
export type ChallengeWindow = 'week' | 'month';
export type ChallengeStatus = 'pending' | 'active' | 'declined';

export interface ChallengeTemplate {
  id: string;
  title: string;
  blurb: string;
  metric: ChallengeMetric;
  window: ChallengeWindow;
  /** Only for `exercise_volume`. */
  exerciseId?: string;
  /** Unit word for the score, e.g. 'sessions', 'reps', 'XP'. */
  unit: string;
}

/**
 * Templates carry their own titles rather than importing `exercises.ts`, which
 * keeps this module inside the test harness's compile set. The three exercise
 * ids are real catalog ids.
 */
export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: 'sessions_week',
    title: 'Most sessions this week',
    blurb: 'Distinct training days between Monday and Sunday.',
    metric: 'sessions',
    window: 'week',
    unit: 'days',
  },
  {
    id: 'volume_week',
    title: 'Most total volume this week',
    blurb: 'Every rep and every second of hold, added up.',
    metric: 'volume',
    window: 'week',
    unit: 'reps',
  },
  {
    id: 'xp_week',
    title: 'Most XP this week',
    blurb: 'Rewards hard movements as well as high volume.',
    metric: 'xp',
    window: 'week',
    unit: 'XP',
  },
  {
    id: 'sessions_month',
    title: 'Most sessions this month',
    blurb: 'Distinct training days across the calendar month.',
    metric: 'sessions',
    window: 'month',
    unit: 'days',
  },
  {
    id: 'volume_month',
    title: 'Most total volume this month',
    blurb: 'A month-long grind. Pace yourself.',
    metric: 'volume',
    window: 'month',
    unit: 'reps',
  },
  {
    id: 'pullups_month',
    title: 'Most pull-up volume this month',
    blurb: 'Pull-ups only. Everything else is ignored.',
    metric: 'exercise_volume',
    exerciseId: 'pull_up',
    window: 'month',
    unit: 'reps',
  },
  {
    id: 'pushups_month',
    title: 'Most push-up volume this month',
    blurb: 'Push-ups only. Everything else is ignored.',
    metric: 'exercise_volume',
    exerciseId: 'push_up',
    window: 'month',
    unit: 'reps',
  },
  {
    id: 'dips_month',
    title: 'Most dip volume this month',
    blurb: 'Dips only. Everything else is ignored.',
    metric: 'exercise_volume',
    exerciseId: 'dip',
    window: 'month',
    unit: 'reps',
  },
];

export function templateById(id: unknown): ChallengeTemplate | undefined {
  const wanted = str(id, '');
  return CHALLENGE_TEMPLATES.find((t) => t.id === wanted);
}

/* -------------------------------------------------------------------------- */
/* Windows                                                                     */
/* -------------------------------------------------------------------------- */

export interface ChallengeWindowDays {
  startDay: string;
  endDay: string;
  /** Local midnight at the end of `endDay`, in ms. The rules compare against it. */
  endsAt: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The *current* week or month at creation time, including days already trained.
 *
 * Both athletes are affected identically, and "most sessions this week" meaning
 * the week you are standing in is what a human means by it.
 */
export function challengeWindowDays(
  window: ChallengeWindow,
  today: Date = new Date(),
): ChallengeWindowDays {
  let startDay: string;
  let endDay: string;

  if (window === 'week') {
    // Monday-based, matching the streak model exactly.
    startDay = weekKey(today);
    endDay = addDays(startDay, 6);
  } else {
    const year = today.getFullYear();
    const month = today.getMonth();
    const last = new Date(year, month + 1, 0);
    startDay = `${year}-${pad(month + 1)}-01`;
    endDay = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
  }

  const [y, m, d] = endDay.split('-').map(Number);
  // Midnight at the *end* of endDay, so the last day counts in full.
  const endsAt = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();

  return { startDay, endDay, endsAt };
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                     */
/* -------------------------------------------------------------------------- */

export interface ChallengeScoreResult {
  value: number;
  sessions: number;
}

/**
 * Score one athlete's own workouts against a challenge.
 *
 * `sessions` counts distinct `day` values rather than workout documents:
 * splitting one session into five logs must not win a challenge, for the same
 * reason `registerWorkout` counts distinct days.
 */
export function scoreChallenge(
  metric: ChallengeMetric,
  exerciseId: string | null,
  workouts: Workout[],
  startDay: string,
  endDay: string,
): ChallengeScoreResult {
  const from = str(startDay, '');
  const to = str(endDay, '');
  const wanted = str(exerciseId, '');

  const days = new Set<string>();
  let value = 0;

  for (const workout of arr<Workout>(workouts)) {
    // Corrections are inert records, not training.
    if (workout?.kind === 'correction') continue;

    const day = str(workout?.day, '');
    // String comparison is correct for `YYYY-MM-DD`.
    if (day === '' || day < from || day > to) continue;
    days.add(day);

    if (metric === 'volume') {
      value += Math.max(0, num(workout.totalVolume, 0));
    } else if (metric === 'xp') {
      value += Math.max(0, num(workout.xpEarned, 0));
    } else if (metric === 'exercise_volume') {
      for (const entry of arr<WorkoutEntry>(workout.entries)) {
        if (str(entry?.exerciseId, '') !== wanted) continue;
        value += Math.max(0, num(entry.volume, 0));
      }
    }
  }

  const sessions = days.size;
  return {
    value: metric === 'sessions' ? sessions : Math.round(Math.max(0, num(value, 0))),
    sessions,
  };
}

/* -------------------------------------------------------------------------- */
/* Resolution — derived, never stored                                          */
/* -------------------------------------------------------------------------- */

export type ChallengeState = 'pending' | 'active' | 'ended' | 'declined' | 'expired';

export function challengeState(challenge: Challenge, now: number = Date.now()): ChallengeState {
  const status = str(challenge?.status, 'pending');
  if (status === 'declined') return 'declined';
  const endsAt = num(challenge?.endsAt, 0);
  const over = endsAt > 0 && now > endsAt;
  if (status === 'pending') return over ? 'expired' : 'pending';
  return over ? 'ended' : 'active';
}

export interface ChallengeOutcome {
  ended: boolean;
  /** uid of the winner, or null for a tie, no scores, or not ended. */
  winner: string | null;
  tie: boolean;
}

/**
 * A tie is a tie.
 *
 * Deliberately not broken on a secondary metric: with self-reported numbers a
 * tiebreak is theatre.
 */
export function resolveChallenge(
  challenge: Challenge,
  scores: Record<string, ChallengeScore>,
  now: number = Date.now(),
): ChallengeOutcome {
  if (challengeState(challenge, now) !== 'ended') {
    return { ended: false, winner: null, tie: false };
  }

  const members = arr<unknown>(challenge?.members).map((m) => str(m, ''));
  const scored = members.map((uid) => ({
    uid,
    value: Math.max(0, num(scores?.[uid]?.value, 0)),
  }));

  if (scored.length < 2) return { ended: true, winner: null, tie: false };
  if (scored.every((s) => s.value === 0)) return { ended: true, winner: null, tie: false };

  const [a, b] = scored;
  if (a.value === b.value) return { ended: true, winner: null, tie: true };
  return { ended: true, winner: a.value > b.value ? a.uid : b.uid, tie: false };
}

export function safeChallengeScore(uid: string, raw: unknown): ChallengeScore {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    uid,
    value: Math.max(0, num(data.value, 0)),
    sessions: Math.max(0, int(data.sessions, 0)),
    updatedAt: num(data.updatedAt, 0),
  };
}
