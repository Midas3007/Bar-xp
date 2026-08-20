import type { WorkoutEntry } from './types';
import { arr, int, num, str } from './safe';
import { normalizeReps } from './game/sets';

/**
 * The in-progress session, kept in `localStorage`.
 *
 * Deliberately not Firestore. A draft is not a record: writing every keystroke
 * would cost money, need its own collection and rules, and still be lost
 * offline. `localStorage` is synchronous, survives reload and app restart, and
 * is exactly as durable as the device the athlete is holding.
 */

const VERSION = 1;

/** Drafts older than this are stale — you did not resume that session. */
export const DRAFT_TTL_MS = 18 * 60 * 60 * 1000;

export interface SessionDraft {
  entries: WorkoutEntry[];
  presetId: string | null;
  savedAt: number;
}

function keyFor(uid: string): string {
  return `barxp.draft.v${VERSION}.${uid}`;
}

/**
 * Re-normalise a stored entry exactly the way `normalizeWorkout` does.
 *
 * `localStorage` is user-writable, so a hand-edited value is an untrusted
 * input like any Firestore document — it must never reach the XP maths as NaN.
 */
function normalizeEntry(raw: Record<string, unknown>): WorkoutEntry {
  const reps = normalizeReps(raw.reps);
  return {
    exerciseId: str(raw.exerciseId, ''),
    exerciseName: str(raw.exerciseName, 'Exercise'),
    unit: raw.unit === 'seconds' ? 'seconds' : ('reps' as const),
    sets: Math.max(0, int(raw.sets, 0)),
    amount: Math.max(0, int(raw.amount, 0)),
    volume: Math.max(0, int(raw.volume, 0)),
    ...(reps.length > 1 ? { reps } : {}),
    xp: Math.max(0, int(raw.xp, 0)),
  };
}

export function loadDraft(uid: string, now: number = Date.now()): SessionDraft | null {
  try {
    const stored = window.localStorage.getItem(keyFor(uid));
    if (!stored) return null;

    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const savedAt = num(parsed.savedAt, 0);
    if (savedAt <= 0 || now - savedAt > DRAFT_TTL_MS) {
      clearDraft(uid);
      return null;
    }

    const entries = arr<Record<string, unknown>>(parsed.entries)
      .map(normalizeEntry)
      .filter((e) => e.volume > 0 && e.exerciseId !== '');
    if (entries.length === 0) {
      clearDraft(uid);
      return null;
    }

    return { entries, presetId: str(parsed.presetId, '') || null, savedAt };
  } catch {
    // Private mode throws on access, and a corrupt value throws on parse.
    return null;
  }
}

export function saveDraft(uid: string, draft: Omit<SessionDraft, 'savedAt'>): void {
  // An empty session is not a draft — storing `[]` would mean a finished
  // session leaves a husk behind that the restore effect has to reason about.
  if (draft.entries.length === 0) {
    clearDraft(uid);
    return;
  }
  try {
    window.localStorage.setItem(
      keyFor(uid),
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    // Quota exceeded or private mode. A lost draft is bad; a crashed logger is worse.
  }
}

export function clearDraft(uid: string): void {
  try {
    window.localStorage.removeItem(keyFor(uid));
  } catch {
    /* nothing to do */
  }
}
