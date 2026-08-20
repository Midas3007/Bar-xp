import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown, ClipboardCheck, Sparkles, TriangleAlert } from 'lucide-react';

import type { MeasurementValues, Profile, UnitSystem } from '../lib/types';
import { Button, Card, Field, Input, Spinner } from '../components/ui/Primitives';
import { StatGrid, TierBadge } from '../components/GameBits';
import { baselineStats } from '../lib/game/profile';
import { tierForStats } from '../lib/game/constants';
import { validateAssessment, validateMeasurements } from '../lib/game/validation';
import { completeAssessment } from '../lib/data';
import { useToast } from '../context/ToastContext';
import { num } from '../lib/safe';
import {
  MEASUREMENT_SITES,
  metricFromDisplay,
  unitLabel,
} from '../lib/game/measurements';

/**
 * First-run assessment.
 *
 * Four honest numbers become the athlete's starting stats and rank, and the
 * first `stats_history` snapshot — the origin point every progress chart is
 * measured against.
 */
export function OnboardingView({ profile }: { profile: Profile }) {
  const toast = useToast();

  const [pullUps, setPullUps] = useState('');
  const [pushUps, setPushUps] = useState('');
  const [plank, setPlank] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Optional and deliberately absent from `filled` below: measurements must
  // never be able to block the assessment.
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('metric');
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});

  const input = useMemo(
    () => ({
      maxPullUps: num(pullUps, NaN),
      maxPushUps: num(pushUps, NaN),
      plankSeconds: num(plank, NaN),
      bodyFat: num(bodyFat, NaN),
    }),
    [pullUps, pushUps, plank, bodyFat],
  );

  const filled =
    pullUps !== '' && pushUps !== '' && plank !== '' && bodyFat !== '';

  // Live preview — only computed once every field has a valid value.
  const preview = useMemo(() => {
    if (!filled) return null;
    if (!validateAssessment(input).ok) return null;
    const stats = baselineStats({
      maxPullUps: input.maxPullUps,
      maxPushUps: input.maxPushUps,
      plankSeconds: input.plankSeconds,
      bodyFat: input.bodyFat,
    });
    return { stats, tier: tierForStats(stats) };
  }, [filled, input]);

  const onSubmit = async () => {
    const check = validateAssessment(input);
    if (!check.ok) {
      setError(check.error ?? 'Check your answers.');
      return;
    }

    // With the section collapsed and untouched this is `{}`, and
    // `completeAssessment` then writes exactly what it wrote before the field
    // existed.
    const values: MeasurementValues = {};
    for (const site of MEASUREMENT_SITES) {
      const raw = measurements[site.key] ?? '';
      // A blank field must be rejected before conversion: `num('', NaN)` is 0,
      // because `Number('')` is 0, and every untouched site would record a zero.
      if (raw.trim() === '') continue;
      const typed = num(raw, NaN);
      if (!Number.isFinite(typed)) continue;
      values[site.key] = metricFromDisplay(typed, site.kind, unitSystem);
    }

    const measurementCheck = validateMeasurements(values as Record<string, unknown>);
    if (!measurementCheck.ok) {
      setError(measurementCheck.error ?? 'Check your measurements.');
      setShowMeasurements(true);
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const result = await completeAssessment(
        profile,
        {
          maxPullUps: input.maxPullUps,
          maxPushUps: input.maxPushUps,
          plankSeconds: input.plankSeconds,
          bodyFat: input.bodyFat,
        },
        values,
      );
      toast.success(
        `Assessment complete — you start at ${result.tier}.`,
        'Your baseline is saved. Every session from here is measured against it.',
      );
    } catch (err) {
      console.error('[onboarding] assessment failed', err);
      setError('Could not save your assessment. Check your connection and try again.');
    } finally {
      // Always cleared. On success the profile listener flips `onboarded` and
      // this view unmounts before it matters; if anything stops that snapshot
      // arriving, the athlete gets their button back instead of an eternal
      // spinner. Re-submitting is idempotent.
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base px-4 py-10 sm:px-6">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(900px 600px at 50% -10%, rgb(var(--wash-forge) / var(--wash-alpha)), transparent 60%)',
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-forge-vivid to-arcane-vivid shadow-glow-forge">
            <ClipboardCheck className="h-6 w-6 text-on-accent" aria-hidden />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-content-strong">
            Initial Assessment
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-content-muted">
            Four numbers set your starting stats and rank. Be honest — the whole system is
            calibrated against this baseline, and inflating it only flattens your own progress
            curve.
          </p>
        </div>

        <Card className="p-6 sm:p-8" glow>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Max pull-ups" hint="Strict, dead hang, in one set. Zero is fine.">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={pullUps}
                onChange={(e) => setPullUps(e.target.value)}
                placeholder="0"
              />
            </Field>

            <Field label="Max push-ups" hint="Chest to fist height, in one unbroken set.">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={300}
                value={pushUps}
                onChange={(e) => setPushUps(e.target.value)}
                placeholder="0"
              />
            </Field>

            <Field label="Max plank hold" hint="In seconds. Forearms down, hips level.">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={3599}
                value={plank}
                onChange={(e) => setPlank(e.target.value)}
                placeholder="0"
              />
            </Field>

            <Field label="Estimated body fat %" hint="A rough visual estimate is enough.">
              <Input
                type="number"
                inputMode="decimal"
                min={3}
                max={60}
                step="0.5"
                value={bodyFat}
                onChange={(e) => setBodyFat(e.target.value)}
                placeholder="20"
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => setShowMeasurements((v) => !v)}
            className="mt-5 flex w-full items-center justify-between gap-3 rounded-xl bg-surface-sunken/60 px-4 py-3 text-left ring-1 ring-line transition hover:bg-surface-sunken"
            aria-expanded={showMeasurements}
          >
            <span>
              <span className="block text-sm font-medium text-content">
                Body measurements — optional
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-content-muted">
                Bodyweight and a tape measure, if you have one. Tracked and charted, never scored.
                You can add these later from your profile.
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${
                showMeasurements ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </button>

          {showMeasurements ? (
            <div className="mt-4 rounded-xl bg-surface-sunken/40 p-4 ring-1 ring-line">
              <div className="mb-4 inline-flex rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line">
                {(['metric', 'imperial'] as const).map((system) => (
                  <button
                    key={system}
                    type="button"
                    onClick={() => setUnitSystem(system)}
                    aria-pressed={unitSystem === system}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      unitSystem === system
                        ? 'bg-forge-vivid/20 text-forge ring-1 ring-inset ring-forge/30'
                        : 'text-content-muted hover:text-content'
                    }`}
                  >
                    {system === 'metric' ? 'Metric kg/cm' : 'Imperial lb/in'}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {MEASUREMENT_SITES.map((site) => (
                  <Field
                    key={site.key}
                    label={`${site.label} (${unitLabel(site.kind, unitSystem)})`}
                    hint={site.hint}
                  >
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={measurements[site.key] ?? ''}
                      onChange={(e) => {
                        const next = e.target.value;
                        setMeasurements((m) => ({ ...m, [site.key]: next }));
                        setError(null);
                      }}
                      placeholder="—"
                    />
                  </Field>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-danger/10 p-3 ring-1 ring-danger/25">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              <p className="text-xs leading-relaxed text-danger">{error}</p>
            </div>
          ) : null}

          {preview ? (
            <div className="mt-7 animate-fade-up rounded-2xl bg-surface-sunken/60 p-5 ring-1 ring-line">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-arcane" aria-hidden />
                  <p className="font-display text-xs font-semibold uppercase tracking-widest text-content-muted">
                    Your starting build
                  </p>
                </div>
                <TierBadge tierName={preview.tier.name} />
              </div>
              <StatGrid stats={preview.stats} />
              <p className="mt-4 text-xs italic leading-relaxed text-content-muted">
                {preview.tier.blurb}
              </p>
            </div>
          ) : null}

          <Button
            size="lg"
            className="mt-7 w-full"
            onClick={() => void onSubmit()}
            disabled={busy || !filled}
          >
            {busy ? <Spinner className="h-4 w-4" /> : null}
            Lock in my baseline
            {!busy ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
          </Button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-content-subtle">
            You can re-record your body fat and your measurements any time from your profile.
            Strength and endurance grow only through logged work.
          </p>
        </Card>
      </div>
    </div>
  );
}
