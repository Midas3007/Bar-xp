/**
 * Demo-mode switch.
 *
 * Held in a module rather than in React state because `lib/data.ts` is not a
 * component and must be able to refuse a write from anywhere. `AuthContext`
 * owns the user-visible flag and keeps this one in step.
 *
 * Mirrored into `sessionStorage`, which is what makes the demo survive a
 * reload. Without it, looking around and then refreshing — or opening one of
 * the app's own URLs directly, which is the whole reason the views have URLs —
 * dropped the visitor back onto the sign-in wall the demo exists to avoid.
 *
 * `sessionStorage` rather than `localStorage` deliberately: a look around
 * belongs to the tab it started in, and should not still be running the next
 * time the same browser opens the app, possibly over a real account.
 */
const STORAGE_KEY = 'barxp.demo';

function readStored(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private mode throws on access, and there is no demo to restore anyway.
    return false;
  }
}

let active = typeof window === 'undefined' ? false : readStored();

export function isDemoActive(): boolean {
  return active;
}

export function setDemoActive(next: boolean): void {
  active = next;
  try {
    if (next) window.sessionStorage.setItem(STORAGE_KEY, '1');
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is a convenience here; the in-memory flag is the real one.
  }
}

/** Thrown by any `lib/data.ts` write reached while the demo is active. */
export class DemoWriteError extends Error {
  constructor() {
    super('The demo athlete is read-only.');
    this.name = 'DemoWriteError';
  }
}

/**
 * Backstop for every write path.
 *
 * The UI blocks these earlier and more politely; this makes it certain. A demo
 * visitor has no Firebase session at all, so a write would fail anyway — but
 * failing here fails loudly and locally, rather than as a permission error
 * against somebody else's database.
 */
export function assertNotDemo(): void {
  if (active) throw new DemoWriteError();
}
