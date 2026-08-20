import type { Exercise, WorkoutEntry } from '../types';
import { arr, num } from '../safe';
import { entryVolume } from './sets';

/**
 * Anti-cheat bounds.
 *
 * These are not "hard" limits on human capability — they are sanity limits that
 * reject typos and deliberate XP inflation. Anything a real athlete could log
 * in one set stays comfortably inside them, and the same numbers are mirrored
 * in `firestore.rules` so the client cannot be bypassed.
 */
export const LIMITS = {
  MAX_SETS: 20,
  MIN_SETS: 1,
  /** Reps in a single set. 500+ is rejected. */
  MAX_REPS: 499,
  MIN_REPS: 1,
  /** Seconds in a single hold. 3600+ (one hour) is rejected. */
  MAX_SECONDS: 3599,
  MIN_SECONDS: 1,
  /** Total units across a whole logged session. */
  MAX_SESSION_VOLUME: 5000,
  MAX_ENTRIES: 12,
  /** Assessment bounds. */
  /*
   * Assessment ceilings.
   *
   * These were 100 / 300 / 3599. Combined with `baselineStats`, entering the
   * maxima produced an average stat around 414 — against a Legend threshold of
   * 175 — so the top rank in the game was obtainable on the signup screen
   * without logging a rep. These are now set near the edge of credible human
   * performance, and `baselineStats` additionally clamps its own output.
   */
  MAX_ASSESS_PULL_UPS: 60,
  MAX_ASSESS_PUSH_UPS: 150,
  MAX_ASSESS_PLANK: 1800,
  MIN_BODY_FAT: 3,
  MAX_BODY_FAT: 60,
  /** Custom exercise XP-per-unit bounds. */
  MIN_CUSTOM_XP: 0.1,
  MAX_CUSTOM_XP: 8,
  MAX_CUSTOM_EXERCISES: 20,
  /** Stored training days per athlete. Mirrored in firestore.rules. */
  MAX_ROUTINES: 12,
  /** Movements in one routine — the same ceiling as a logged session. */
  MAX_ROUTINE_ITEMS: 12,
  MAX_NAME_LENGTH: 40,
} as const;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

const OK: ValidationResult = { ok: true };

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

/** Validate one logged set-group against the anti-cheat bounds. */
export function validateEntry(
  exercise: Exercise | undefined,
  sets: unknown,
  amount: unknown,
): ValidationResult {
  if (!exercise) return fail('Pick an exercise first.');

  const s = num(sets, NaN);
  const a = num(amount, NaN);

  if (!Number.isFinite(s) || !Number.isInteger(s)) return fail('Sets must be a whole number.');
  if (s < LIMITS.MIN_SETS) return fail('You need at least 1 set.');
  if (s > LIMITS.MAX_SETS) return fail(`${LIMITS.MAX_SETS} sets is the maximum per exercise.`);

  if (!Number.isFinite(a) || !Number.isInteger(a)) {
    return fail(exercise.unit === 'seconds' ? 'Seconds must be a whole number.' : 'Reps must be a whole number.');
  }

  if (exercise.unit === 'seconds') {
    if (a < LIMITS.MIN_SECONDS) return fail('A hold needs at least 1 second.');
    if (a > LIMITS.MAX_SECONDS) {
      return fail(`A single hold over ${LIMITS.MAX_SECONDS + 1}s is not accepted. Split it into sets.`);
    }
  } else {
    if (a < LIMITS.MIN_REPS) return fail('You need at least 1 rep.');
    if (a > LIMITS.MAX_REPS) {
      return fail(`${LIMITS.MAX_REPS + 1}+ reps in one set is not accepted. Split it into sets.`);
    }
  }

  return OK;
}

/** Validate a full session before it is written. */
export function validateSession(
  entries: Array<Partial<WorkoutEntry>>,
): ValidationResult {
  if (entries.length === 0) return fail('Add at least one exercise before finishing.');
  if (entries.length > LIMITS.MAX_ENTRIES) {
    return fail(`A session can hold up to ${LIMITS.MAX_ENTRIES} exercises.`);
  }

  const total = entries.reduce((acc, e) => acc + entryVolume(e), 0);
  if (total > LIMITS.MAX_SESSION_VOLUME) {
    return fail(
      `Total session volume of ${Math.floor(total)} exceeds the ${LIMITS.MAX_SESSION_VOLUME} cap. Log it as two sessions.`,
    );
  }

  return OK;
}

/** Validate the onboarding assessment inputs. */
export function validateAssessment(input: {
  maxPullUps: unknown;
  maxPushUps: unknown;
  plankSeconds: unknown;
  bodyFat: unknown;
}): ValidationResult {
  const pullUps = num(input.maxPullUps, NaN);
  const pushUps = num(input.maxPushUps, NaN);
  const plank = num(input.plankSeconds, NaN);
  const bodyFat = num(input.bodyFat, NaN);

  if (!Number.isFinite(pullUps) || pullUps < 0) return fail('Enter your max pull-ups (0 is a valid answer).');
  if (pullUps > LIMITS.MAX_ASSESS_PULL_UPS) return fail(`Cap is ${LIMITS.MAX_ASSESS_PULL_UPS} pull-ups.`);

  if (!Number.isFinite(pushUps) || pushUps < 0) return fail('Enter your max push-ups (0 is a valid answer).');
  if (pushUps > LIMITS.MAX_ASSESS_PUSH_UPS) return fail(`Cap is ${LIMITS.MAX_ASSESS_PUSH_UPS} push-ups.`);

  if (!Number.isFinite(plank) || plank < 0) return fail('Enter your max plank hold in seconds.');
  if (plank > LIMITS.MAX_ASSESS_PLANK) return fail('A plank over an hour is not accepted.');

  if (!Number.isFinite(bodyFat)) return fail('Enter an estimated body fat percentage.');
  if (bodyFat < LIMITS.MIN_BODY_FAT || bodyFat > LIMITS.MAX_BODY_FAT) {
    return fail(`Body fat should be between ${LIMITS.MIN_BODY_FAT}% and ${LIMITS.MAX_BODY_FAT}%.`);
  }

  return OK;
}

/** Validate a user-authored movement. */
export function validateCustomExercise(input: {
  name: unknown;
  xpPerUnit: unknown;
  existingCount: number;
}): ValidationResult {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const xp = num(input.xpPerUnit, NaN);

  if (name.length < 2) return fail('Give the movement a name.');
  if (name.length > LIMITS.MAX_NAME_LENGTH) {
    return fail(`Keep the name under ${LIMITS.MAX_NAME_LENGTH} characters.`);
  }
  if (input.existingCount >= LIMITS.MAX_CUSTOM_EXERCISES) {
    return fail(`You can store up to ${LIMITS.MAX_CUSTOM_EXERCISES} custom movements.`);
  }
  if (!Number.isFinite(xp) || xp < LIMITS.MIN_CUSTOM_XP || xp > LIMITS.MAX_CUSTOM_XP) {
    return fail(`Base XP must be between ${LIMITS.MIN_CUSTOM_XP} and ${LIMITS.MAX_CUSTOM_XP} per rep.`);
  }

  return OK;
}

/** Validate a per-set ladder, e.g. [12, 10, 8], against the anti-cheat bounds. */
export function validateSetLadder(
  exercise: Exercise | undefined,
  reps: unknown,
): ValidationResult {
  if (!exercise) return fail('Pick an exercise first.');

  const raw = arr<unknown>(reps);
  if (raw.length < LIMITS.MIN_SETS) return fail('You need at least 1 set.');
  if (raw.length > LIMITS.MAX_SETS) {
    return fail(`${LIMITS.MAX_SETS} sets is the maximum per exercise.`);
  }

  const seconds = exercise.unit === 'seconds';
  const max = seconds ? LIMITS.MAX_SECONDS : LIMITS.MAX_REPS;
  const min = seconds ? LIMITS.MIN_SECONDS : LIMITS.MIN_REPS;

  for (const value of raw) {
    const v = num(value, NaN);
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      return fail(seconds ? 'Seconds must be a whole number.' : 'Reps must be a whole number.');
    }
    if (v < min) {
      return fail(seconds ? 'A hold needs at least 1 second.' : 'Every set needs at least 1 rep.');
    }
    if (v > max) {
      return fail(
        seconds
          ? `A single hold over ${LIMITS.MAX_SECONDS + 1}s is not accepted. Split it into sets.`
          : `${LIMITS.MAX_REPS + 1}+ reps in one set is not accepted. Split it into sets.`,
      );
    }
  }

  return OK;
}

/** Validate a user-authored routine before it is stored. */
export function validateRoutine(input: {
  name: unknown;
  items: unknown;
  /** Routines already stored, excluding one being replaced. */
  existingCount: number;
}): ValidationResult {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const items = arr<unknown>(input.items);

  if (name.length < 2) return fail('Give the routine a name.');
  if (name.length > LIMITS.MAX_NAME_LENGTH) {
    return fail(`Keep the name under ${LIMITS.MAX_NAME_LENGTH} characters.`);
  }
  if (items.length === 0) return fail('A routine needs at least one movement.');
  if (items.length > LIMITS.MAX_ROUTINE_ITEMS) {
    return fail(`A routine can hold up to ${LIMITS.MAX_ROUTINE_ITEMS} movements.`);
  }
  if (input.existingCount >= LIMITS.MAX_ROUTINES) {
    return fail(`You can store up to ${LIMITS.MAX_ROUTINES} routines. Delete one first.`);
  }
  return OK;
}
