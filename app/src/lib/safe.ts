/**
 * Safe numeric helpers.
 *
 * Every number that reaches the UI passes through here. Firestore documents can
 * carry `undefined`, `null`, strings, or values written by an older schema, and
 * a single NaN leaking into JSX renders the literal text "NaN" — or worse,
 * breaks a chart's axis domain. These helpers are deliberately total: they
 * always return a finite number.
 */

/** Coerce anything to a finite number, falling back to `fallback` (default 0). */
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce to a finite integer (floored). */
export function int(value: unknown, fallback = 0): number {
  return Math.floor(num(value, fallback));
}

/** Clamp a value into [min, max]. Returns `min` if the input is not finite. */
export function clamp(value: unknown, min: number, max: number): number {
  const n = num(value, min);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** Percentage of `value` against `total`, clamped to 0–100 and never NaN. */
export function pct(value: unknown, total: unknown): number {
  const t = num(total, 0);
  if (t <= 0) return 0;
  return clamp((num(value, 0) / t) * 100, 0, 100);
}

/** Round to a fixed number of decimals, returning a finite number. */
export function round(value: unknown, decimals = 0): number {
  const factor = 10 ** clamp(decimals, 0, 8);
  return Math.round(num(value, 0) * factor) / factor;
}

/** Format an integer with thousands separators. Never renders NaN. */
export function fmt(value: unknown): string {
  return int(value, 0).toLocaleString('en-US');
}

/** Format a decimal with a fixed precision. Never renders NaN. */
export function fmtDecimal(value: unknown, decimals = 1): string {
  return num(value, 0).toFixed(clamp(decimals, 0, 8));
}

/** Safe array access — returns `[]` for anything that is not an array. */
export function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Safe string access — trims and falls back for non-strings. */
export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Sum a list of values safely. */
export function sum(values: unknown[]): number {
  return arr<unknown>(values).reduce<number>((total, v) => total + num(v, 0), 0);
}
