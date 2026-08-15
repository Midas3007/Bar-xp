import { useMemo, useState } from 'react';
import { ArrowRight, ClipboardCheck, Sparkles, TriangleAlert } from 'lucide-react';

import type { Profile } from '../lib/types';
import { Button, Card, Field, Input, Spinner } from '../components/ui/Primitives';
import { StatGrid, TierBadge } from '../components/GameBits';
import { baselineStats } from '../lib/game/profile';
import { tierForStats } from '../lib/game/constants';
import { validateAssessment } from '../lib/game/validation';
import { completeAssessment } from '../lib/data';
import { useToast } from '../context/ToastContext';
import { num } from '../lib/safe';

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

    setError(null);
    setBusy(true);
    try {
      const result = await completeAssessment(profile, {
        maxPullUps: input.maxPullUps,
        maxPushUps: input.maxPushUps,
        plankSeconds: input.plankSeconds,
        bodyFat: input.bodyFat,
      });
      toast.success(
        `Assessment complete — you start at ${result.tier}.`,
        'Your baseline is saved. Every session from here is measured against it.',
      );
    } catch (err) {
      console.error('[onboarding] assessment failed', err);
      setError('Could not save your assessment. Check your connection and try again.');
      setBusy(false);
    }
    // On success the profile listener flips `onboarded` and this view unmounts,
    // so `busy` is deliberately left set.
  };

  return (
    <div className="min-h-screen bg-ink-950 px-4 py-10 sm:px-6">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(900px 600px at 50% -10%, rgba(56,189,248,0.12), transparent 60%)',
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-forge-500 to-arcane-500 shadow-glow-forge">
            <ClipboardCheck className="h-6 w-6 text-ink-950" aria-hidden />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-50">
            Initial Assessment
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400">
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

          {error ? (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-500/25">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
              <p className="text-xs leading-relaxed text-rose-200">{error}</p>
            </div>
          ) : null}

          {preview ? (
            <div className="mt-7 animate-fade-up rounded-2xl bg-ink-900/60 p-5 ring-1 ring-white/5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-arcane-400" aria-hidden />
                  <p className="font-display text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Your starting build
                  </p>
                </div>
                <TierBadge tierName={preview.tier.name} />
              </div>
              <StatGrid stats={preview.stats} />
              <p className="mt-4 text-xs italic leading-relaxed text-slate-500">
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

          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-600">
            You can re-record your body fat any time from your profile. Strength and endurance grow
            only through logged work.
          </p>
        </Card>
      </div>
    </div>
  );
}
