/**
 * Theme preference logic.
 *
 * Pure and DOM-free so the zero-dependency test harness can compile it. The
 * DOM side — reading storage, subscribing to `matchMedia`, toggling the class
 * on `<html>` — lives in `context/ThemeContext.tsx`.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'barxp.theme';

/** Ordered for the segmented control: the neutral choice sits in the middle. */
export const THEME_PREFERENCES: ThemePreference[] = ['light', 'system', 'dark'];

/** Anything unrecognised — including a value written by an older build — is 'system'. */
export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
