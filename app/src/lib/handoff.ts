/**
 * A one-shot request to the workout logger, carried across a navigation.
 *
 * The skill tree's most valuable interaction is starting a session for the
 * drill you are looking at, and that means naming a movement while moving to a
 * different view. The alternatives were both worse: widening `ViewKey` into
 * parameterised routes for one optional value, or lifting picker state into a
 * context that every other view would carry for nothing.
 *
 * A module-level mailbox is enough. Navigation here is a state change in one
 * mounted React tree, not a page load, so the value is still there when the
 * logger mounts — and if the athlete reloads instead, losing a stale intent is
 * the right outcome anyway.
 */

let pending: string | null = null;

/** Ask the logger to open with this movement selected. */
export function requestExercise(exerciseId: string): void {
  pending = exerciseId;
}

/** Read the request and clear it. Reading twice returns null the second time. */
export function takeRequestedExercise(): string | null {
  const requested = pending;
  pending = null;
  return requested;
}
