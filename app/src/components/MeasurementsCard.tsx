import { useState } from 'react';
import { Ruler } from 'lucide-react';

import type { MeasurementKey, MeasurementValues, Profile } from '../lib/types';
import { fmtDecimal, num } from '../lib/safe';
import {
  MEASUREMENT_SITES,
  displayFromMetric,
  metricFromDisplay,
  unitLabel,
} from '../lib/game/measurements';
import { validateMeasurements } from '../lib/game/validation';
import { recordMeasurements } from '../lib/data';
import { useToast } from '../context/ToastContext';
import { Button, Card, EmptyState, Field, Input, Spinner } from './ui/Primitives';

/**
 * Record and review body measurements.
 *
 * There is no target and no comparison against another athlete. One pair does
 * feed a rating — back over waist drives the Physique Lab's V-taper trait,
 * because that is the one physique ratio a tape can actually settle — and the
 * copy says so rather than promising nothing is scored.
 */
export function MeasurementsCard({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const system = profile.unitSystem;
  const current = profile.measurements?.values ?? {};
  const recordedAt = profile.measurements?.recordedAt ?? 0;

  const openForm = () => {
    // Prefill in the active unit, so an unchanged field records the same value.
    const prefill: Record<string, string> = {};
    for (const site of MEASUREMENT_SITES) {
      const value = current[site.key];
      if (typeof value === 'number') {
        prefill[site.key] = fmtDecimal(displayFromMetric(value, site.kind, system), 1);
      }
    }
    setDraft(prefill);
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    const values: MeasurementValues = {};
    for (const site of MEASUREMENT_SITES) {
      const raw = draft[site.key] ?? '';
      // `num('', NaN)` is 0, not NaN, because `Number('')` is 0 — so a blank
      // field has to be rejected before it reaches the conversion, or every
      // untouched site would record a zero.
      if (raw.trim() === '') continue;
      const typed = num(raw, NaN);
      if (!Number.isFinite(typed)) continue;
      values[site.key] = metricFromDisplay(typed, site.kind, system);
    }

    if (Object.keys(values).length === 0) {
      setError('Fill in at least one measurement.');
      return;
    }

    const check = validateMeasurements(values as Record<string, unknown>);
    if (!check.ok) {
      setError(check.error ?? 'Those numbers do not look right.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await recordMeasurements(profile, values);
      toast.success('Measurements recorded', 'A new point was added to your progress charts.');
      setOpen(false);
      setDraft({});
    } catch (err) {
      console.error('[profile] failed to record measurements', err);
      setError('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-content">
            <Ruler className="h-4 w-4 text-content-muted" aria-hidden />
            Body Measurements
          </h2>
          <p className="mt-1 text-xs text-content-muted">
            Charted over time and never compared to anyone else. Only your back and waist
            feed a rating — the V-taper trait in the Physique Lab.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => (open ? setOpen(false) : openForm())}>
          {open ? 'Cancel' : 'Update'}
        </Button>
      </div>

      {open ? (
        <div className="space-y-3">
          {MEASUREMENT_SITES.map((site) => (
            <Field
              key={site.key}
              label={`${site.label} (${unitLabel(site.kind, system)})`}
              hint={site.hint}
            >
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={draft[site.key] ?? ''}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, [site.key]: e.target.value }));
                  setError(null);
                }}
                placeholder="—"
              />
            </Field>
          ))}

          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <div className="flex items-center gap-3">
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : null}
              Record
            </Button>
            <p className="text-xs text-content-subtle">
              Leave a field blank to skip it. Only what you fill in is recorded.
            </p>
          </div>
        </div>
      ) : profile.measurements ? (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {MEASUREMENT_SITES.map((site) => (
              <Reading key={site.key} site={site.key} profile={profile} />
            ))}
          </dl>
          {recordedAt > 0 ? (
            <p className="mt-4 text-xs text-content-subtle">
              Last recorded {new Date(recordedAt).toLocaleDateString()}.
            </p>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="No measurements yet"
          message="Record a bodyweight or a tape measurement and it will start showing up on your progress charts."
        />
      )}
    </Card>
  );
}

function Reading({ site, profile }: { site: MeasurementKey; profile: Profile }) {
  const meta = MEASUREMENT_SITES.find((s) => s.key === site);
  if (!meta) return null;
  const value = profile.measurements?.values?.[site];
  const known = typeof value === 'number';
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
      <dt className="text-xs text-content-muted">{meta.label}</dt>
      <dd className="font-mono text-sm text-content">
        {known ? (
          <>
            {fmtDecimal(displayFromMetric(value, meta.kind, profile.unitSystem), 1)}
            <span className="ml-1 text-xs text-content-subtle">
              {unitLabel(meta.kind, profile.unitSystem)}
            </span>
          </>
        ) : (
          <span className="text-content-subtle">—</span>
        )}
      </dd>
    </div>
  );
}
