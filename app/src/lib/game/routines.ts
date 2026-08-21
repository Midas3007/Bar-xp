import type { Exercise, Routine, RoutineItem, WorkoutEntry } from '../types';
import { arr, num, str } from '../safe';
import { entryReps, normalizeReps } from './sets';
import { LIMITS } from './validation';
import { buildEntryFromReps } from './xp';

/**
 * User-authored training days.
 *
 * Deliberately knows nothing about the exercise catalog: `loadRoutine` takes
 * `resolve` and `isAvailable` as callbacks, mirroring how `scoreSession` takes
 * `resolve`. Importing `./exercises` here would drag the whole catalog into the
 * zero-dependency test harness compile.
 */

/** Coerce a stored routine list into well-formed routines. Junk is dropped. */
export function normalizeRoutines(raw: unknown): Routine[] {
  return (
    arr<Partial<Routine>>(raw)
      .filter(
        (r): r is Partial<Routine> =>
          Boolean(r) && typeof r === 'object' && typeof r.id === 'string',
      )
      .slice(0, LIMITS.MAX_ROUTINES)
      .map<Routine>((r) => ({
        id: str(r.id, ''),
        name: str(r.name, '').slice(0, LIMITS.MAX_NAME_LENGTH) || 'Routine',
        items: arr<Partial<RoutineItem>>(r.items)
          .filter((i) => Boolean(i) && typeof i === 'object' && typeof i.exerciseId === 'string')
          .map<RoutineItem>((i) => ({
            exerciseId: str(i.exerciseId, ''),
            reps: normalizeReps(i.reps),
          }))
          .filter((i) => i.exerciseId.length > 0 && i.reps.length > 0)
          .slice(0, LIMITS.MAX_ROUTINE_ITEMS),
        createdAt: num(r.createdAt, 0),
        updatedAt: num(r.updatedAt, 0),
      }))
      // A routine with nothing left in it cannot be started, so it is not kept.
      .filter((r) => r.id.length > 0 && r.items.length > 0)
  );
}

/** Target units in a routine — used for the "≈ N reps" line on the card. */
export function routineVolume(routine: Routine): number {
  return arr<RoutineItem>(routine?.items).reduce(
    (total, item) => total + normalizeReps(item?.reps).reduce((sum, r) => sum + r, 0),
    0,
  );
}

/** Normalise one routine's fields. Keeps id and timestamp handling in one place. */
export function buildRoutine(input: {
  id: string;
  name: string;
  items: RoutineItem[];
  createdAt: number;
  updatedAt: number;
}): Routine {
  const [normalized] = normalizeRoutines([
    {
      id: str(input.id, ''),
      name: str(input.name, '').trim(),
      items: input.items,
      createdAt: num(input.createdAt, 0),
      updatedAt: num(input.updatedAt, 0),
    },
  ]);
  return (
    normalized ?? {
      id: str(input.id, ''),
      name: str(input.name, '').trim().slice(0, LIMITS.MAX_NAME_LENGTH) || 'Routine',
      items: [],
      createdAt: num(input.createdAt, 0),
      updatedAt: num(input.updatedAt, 0),
    }
  );
}

/**
 * Insert or replace a routine.
 *
 * Matching is by id first, then by case-insensitive name, so saving a session
 * under a name that already exists overwrites that routine rather than
 * accumulating near-duplicates. That is the whole editing story for this slice:
 * start a routine, change the numbers, save it under the same name.
 */
export function upsertRoutine(existing: unknown, routine: Routine): Routine[] {
  const list = normalizeRoutines(existing);
  const wanted = str(routine?.name, '').trim().toLowerCase();

  let index = list.findIndex((r) => r.id === routine.id);
  if (index < 0) index = list.findIndex((r) => r.name.trim().toLowerCase() === wanted);

  if (index >= 0) {
    const previous = list[index];
    const next = [...list];
    // The stored identity wins: replacing by name must not orphan the id a
    // logged workout already recorded in `presetId`.
    next[index] = {
      ...routine,
      id: previous.id,
      createdAt: previous.createdAt || routine.createdAt,
    };
    return next;
  }

  // Last line of defence; the UI blocks this first via `validateRoutine`.
  if (list.length >= LIMITS.MAX_ROUTINES) return list;
  return [...list, routine];
}

export function removeRoutine(existing: unknown, id: string): Routine[] {
  return normalizeRoutines(existing).filter((r) => r.id !== id);
}

export interface RoutineLoad {
  entries: WorkoutEntry[];
  /** Names of movements skipped because they are still locked. */
  locked: string[];
  /** Ids that no longer resolve — a deleted custom movement. */
  missing: string[];
}

/**
 * Turn a routine into session entries. `resolve` looks a movement up in the
 * user's catalog; `isAvailable` answers whether it is unlocked for them.
 */
export function loadRoutine(
  routine: Routine,
  resolve: (id: string) => Exercise | undefined,
  isAvailable: (exercise: Exercise) => boolean,
): RoutineLoad {
  const entries: WorkoutEntry[] = [];
  const locked: string[] = [];
  const missing: string[] = [];

  for (const item of arr<RoutineItem>(routine?.items)) {
    if (entries.length >= LIMITS.MAX_ENTRIES) break;
    const exercise = resolve(str(item?.exerciseId, ''));
    if (!exercise) {
      missing.push(str(item?.exerciseId, ''));
      continue;
    }
    if (!isAvailable(exercise)) {
      locked.push(exercise.name);
      continue;
    }
    entries.push(buildEntryFromReps(exercise, item.reps));
  }

  return { entries, locked, missing };
}

/** Snapshot session entries as routine items, preserving each entry's ladder. */
export function routineItemsFromEntries(entries: WorkoutEntry[]): RoutineItem[] {
  return arr<WorkoutEntry>(entries)
    .slice(0, LIMITS.MAX_ROUTINE_ITEMS)
    .map((e) => ({ exerciseId: str(e.exerciseId, ''), reps: entryReps(e) }))
    .filter((i) => i.exerciseId.length > 0 && i.reps.length > 0);
}
