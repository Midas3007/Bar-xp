import type { MeasurementKey, MeasurementValues, Measurements, UnitSystem } from '../types';
import { num, round } from '../safe';

/**
 * Body measurements: the sites, the units, and the coercion.
 *
 * Nothing in this module scores anything, and nothing outside it should either.
 * Measurements are tracked and charted; they are never fed into a stat, a tier,
 * a rank or a comparison against another athlete.
 *
 * Imports only `../types` and `../safe`, never `./validation` — the dependency
 * runs validation → measurements and must stay one-directional.
 */

export type MeasurementKind = 'mass' | 'length';

export interface MeasurementSite {
  key: MeasurementKey;
  label: string;
  kind: MeasurementKind;
  /** How to take it, so two readings a month apart are actually comparable. */
  hint: string;
}

/**
 * Sanity bounds, in metric.
 *
 * These exist to reject typos and to stop the field being used as free storage
 * — not to police bodies. Nothing here is scored, so tight "plausible" ranges
 * would buy nothing and would only reject real people. Mirrored in
 * `firestore.rules`.
 */
export const MEASUREMENT_BOUNDS: Record<MeasurementKind, { min: number; max: number }> = {
  mass: { min: 20, max: 400 }, // kg
  length: { min: 10, max: 250 }, // cm
};

export const MEASUREMENT_SITES: MeasurementSite[] = [
  {
    key: 'bodyweight',
    label: 'Bodyweight',
    kind: 'mass',
    hint: 'Same time of day, same conditions — first thing in the morning is easiest to repeat.',
  },
  {
    key: 'chest',
    label: 'Chest',
    kind: 'length',
    hint: 'Around the widest point, arms relaxed at your sides, at the end of a normal exhale.',
  },
  {
    key: 'back',
    label: 'Back',
    kind: 'length',
    hint: 'Around the torso at the widest part of the lats, arms relaxed.',
  },
  {
    key: 'waist',
    label: 'Waist',
    kind: 'length',
    hint: 'At the navel, standing relaxed. Do not brace or suck in.',
  },
  {
    key: 'biceps',
    label: 'Biceps',
    kind: 'length',
    hint: 'Flexed, at the peak. Use the same arm every time and note which.',
  },
  {
    key: 'thighs',
    label: 'Thigh',
    kind: 'length',
    hint: 'Mid-thigh, standing with weight evenly on both legs.',
  },
  {
    key: 'calves',
    label: 'Calf',
    kind: 'length',
    hint: 'At the widest point, standing.',
  },
];

export const MEASUREMENT_KEYS: MeasurementKey[] = MEASUREMENT_SITES.map((s) => s.key);

/** Never undefined: an unknown key falls back to the first site rather than crashing a render. */
export function siteFor(key: MeasurementKey): MeasurementSite {
  return MEASUREMENT_SITES.find((s) => s.key === key) ?? MEASUREMENT_SITES[0];
}

/* -------------------------------------------------------------------------- */
/* Units                                                                       */
/* -------------------------------------------------------------------------- */

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

/**
 * Metric stored value to the number to show.
 *
 * Deliberately does not round, so the conversion pair is an exact round-trip.
 * Rounding happens once on the way into storage, and again at render time.
 */
export function displayFromMetric(
  value: unknown,
  kind: MeasurementKind,
  system: UnitSystem,
): number {
  const v = num(value, 0);
  if (system === 'metric') return v;
  return kind === 'mass' ? v / KG_PER_LB : v / CM_PER_IN;
}

/** A number the user typed to the metric value to store. Also unrounded. */
export function metricFromDisplay(
  value: unknown,
  kind: MeasurementKind,
  system: UnitSystem,
): number {
  const v = num(value, 0);
  if (system === 'metric') return v;
  return kind === 'mass' ? v * KG_PER_LB : v * CM_PER_IN;
}

export function unitLabel(kind: MeasurementKind, system: UnitSystem): string {
  if (kind === 'mass') return system === 'imperial' ? 'lb' : 'kg';
  return system === 'imperial' ? 'in' : 'cm';
}

/* -------------------------------------------------------------------------- */
/* Coercion                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Coerce anything into a clean metric measurement map.
 *
 * Unknown keys, non-finite numbers and out-of-range values are DROPPED, not
 * clamped: a mistyped 2500 cm chest is a typo, and silently recording it as
 * 250 cm would put a lie on the chart.
 */
export function normalizeMeasurementValues(raw: unknown): MeasurementValues {
  if (!raw || typeof raw !== 'object') return {};
  const source = raw as Record<string, unknown>;
  const out: MeasurementValues = {};
  for (const site of MEASUREMENT_SITES) {
    if (!(site.key in source)) continue;
    const value = num(source[site.key], NaN);
    if (!Number.isFinite(value)) continue;
    const { min, max } = MEASUREMENT_BOUNDS[site.kind];
    if (value < min || value > max) continue;
    out[site.key] = round(value, 1);
  }
  return out;
}

/** Null rather than an empty block, so "never measured" is distinguishable. */
export function normalizeMeasurements(raw: unknown): Measurements | null {
  if (!raw || typeof raw !== 'object') return null;
  const values = normalizeMeasurementValues((raw as { values?: unknown }).values);
  if (Object.keys(values).length === 0) return null;
  return { values, recordedAt: num((raw as { recordedAt?: unknown }).recordedAt, 0) };
}

/**
 * One accent for every measurement panel.
 *
 * The girth charts are small multiples, so colour carries no identity and a
 * categorical palette would be six hues saying nothing. The panel title is the
 * identity instead.
 */
export const MEASUREMENT_HEX = '#38bdf8';
