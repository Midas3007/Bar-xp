/**
 * Demo-mode switch.
 *
 * Held in a module rather than in React state because `lib/data.ts` is not a
 * component and must be able to refuse a write from anywhere. `AuthContext`
 * owns the user-visible flag and keeps this one in step.
 */
let active = false;

export function isDemoActive(): boolean {
  return active;
}

export function setDemoActive(next: boolean): void {
  active = next;
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
