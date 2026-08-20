import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Lightbulb, Sparkles, Target } from 'lucide-react';

import type { Profile } from '../lib/types';
import { Card, CardHeader, EmptyState, ProgressBar } from './ui/Primitives';
import {
  GRADE_META,
  gradeLabel,
  labelSetFor,
  LEVERS,
  hasEnoughData,
  overallAestheticScore,
  priorityTraits,
  rateAesthetics,
} from '../lib/game/aesthetics';
import { fmtDecimal } from '../lib/safe';

const HIDDEN_KEY = 'barxp.physiqueLab.hidden';

/**
 * The private physique ("looksmaxxing") section.
 *
 * Every score is derived from logged training volume, body-fat readings and
 * personal bests — nothing is asked for beyond what the app already tracks.
 * It is collapsed behind a toggle that persists locally, so it is not on screen
 * when someone glances at your phone.
 */
export function PhysiqueLab({ profile }: { profile: Profile }) {
  const [hidden, setHidden] = useState(true);
  // The whole mechanism: one lookup, resolved once. No gymBroMode ternaries in JSX.
  const labelSet = labelSetFor(profile.gymBroMode);

  // Default to hidden, then restore the user's stored preference.
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDDEN_KEY) !== 'false');
    } catch {
      /* localStorage can be unavailable in private modes — stay hidden. */
    }
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try {
      window.localStorage.setItem(HIDDEN_KEY, next ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  };

  const traits = useMemo(() => rateAesthetics(profile), [profile]);
  const overall = useMemo(() => overallAestheticScore(traits), [traits]);
  const priorities = useMemo(() => priorityTraits(traits, 3), [traits]);
  const ready = hasEnoughData(profile);

  return (
    <Card>
      <CardHeader
        title="Physique Lab"
        subtitle="Private. Derived from your own logged data."
        icon={<Sparkles className="h-4 w-4" aria-hidden />}
        action={
          <button
            type="button"
            onClick={toggle}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            {hidden ? (
              <>
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Reveal
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
                Hide
              </>
            )}
          </button>
        }
      />

      {hidden ? (
        <EmptyState
          icon={<EyeOff className="h-8 w-8" aria-hidden />}
          title="Hidden"
          message="A per-trait physique breakdown with specific tips. Tap Reveal to show it — it stays hidden by default so it is not on screen by accident."
        />
      ) : !ready ? (
        <EmptyState
          icon={<Target className="h-8 w-8" aria-hidden />}
          title="Not enough data yet"
          message="Log at least three sessions and record a body-fat estimate. The ratings are built from your actual training volume, so they need something to work with."
        />
      ) : (
        <div className="divide-y divide-white/5">
          {/* --- Overall --- */}
          <div className="p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                  Overall
                </p>
                <p className="mt-1 font-display text-3xl font-bold text-slate-50">
                  {fmtDecimal(overall, 0)}
                  <span className="ml-1 text-base font-medium text-slate-600">/100</span>
                </p>
              </div>
              <p className="max-w-[55%] text-right text-[11px] leading-relaxed text-slate-600">
                An average of the traits below. It measures your training, not you.
              </p>
            </div>
            <div className="mt-3">
              <ProgressBar
                value={overall}
                max={100}
                gradient="from-arcane-500 via-forge-400 to-vital-400"
                height="h-2"
                label="Overall physique score"
              />
            </div>
          </div>

          {/* --- Priorities --- */}
          <div className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-widest text-slate-400">
              <Target className="h-4 w-4" aria-hidden />
              Attack these first
            </h3>
            <ol className="space-y-3">
              {priorities.map((trait, i) => (
                <li key={trait.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/15 font-mono text-[10px] font-bold text-rose-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-200">{trait.label}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{trait.tip}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* --- Every trait --- */}
          <div className="p-5">
            <h3 className="mb-4 font-display text-xs font-semibold uppercase tracking-widest text-slate-400">
              Full breakdown
            </h3>
            <ul className="space-y-4">
              {traits.map((trait) => {
                const grade = GRADE_META[trait.grade];
                return (
                  <li key={trait.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-200">{trait.label}</span>
                      <span className="flex items-baseline gap-2">
                        <span className={`text-[10px] font-semibold ${grade.color}`}>
                          {gradeLabel(trait.grade, labelSet)}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          {trait.grade === 'unknown' ? '—' : fmtDecimal(trait.score, 0)}
                        </span>
                      </span>
                    </div>
                    <ProgressBar
                      value={trait.grade === 'unknown' ? 0 : trait.score}
                      max={100}
                      gradient={grade.bar}
                      height="h-1.5"
                      animated={false}
                      label={trait.label}
                    />
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{trait.what}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{trait.tip}</p>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* --- Non-training levers --- */}
          <div className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-widest text-slate-400">
              <Lightbulb className="h-4 w-4" aria-hidden />
              Beyond training
            </h3>
            <ul className="space-y-3">
              {LEVERS.map((lever) => (
                <li key={lever.title}>
                  <p className="text-sm font-semibold text-slate-200">{lever.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{lever.detail}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="p-5 text-[10px] leading-relaxed text-slate-600">
            These are training and aesthetic heuristics computed from your logged data — not medical
            or nutritional advice, and not a measure of your worth. If you find yourself checking
            this compulsively, or it is making you feel worse about your body, hide the section and
            keep training. The streak is the part that actually matters.
          </p>
        </div>
      )}
    </Card>
  );
}
