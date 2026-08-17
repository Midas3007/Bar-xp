import { useMemo, useState } from 'react';
import { Activity, ChevronDown, Scale, TriangleAlert } from 'lucide-react';

import type { Profile } from '../lib/types';
import { Card, CardHeader, Chip, EmptyState, ProgressBar } from './ui/Primitives';
import {
  MUSCLE_FIXES,
  MUSCLE_GRADE_META,
  MUSCLE_META,
  analyseBalance,
  rateMuscles,
  weakestMuscles,
} from '../lib/game/muscles';
import { fmt, fmtDecimal, int } from '../lib/safe';

/**
 * Per-muscle development, rated relative to the athlete's own best-trained
 * muscle, plus the structural balance checks that matter for calisthenics.
 */
export function MuscleMap({ profile }: { profile: Profile }) {
  const [showAll, setShowAll] = useState(false);

  const ratings = useMemo(() => rateMuscles(profile.muscleVolume), [profile.muscleVolume]);
  const weakest = useMemo(() => weakestMuscles(ratings, 3), [ratings]);
  const balance = useMemo(() => analyseBalance(profile.muscleVolume), [profile.muscleVolume]);

  const hasData = ratings.some((r) => r.volume > 0);
  const regions = ['upper', 'core', 'lower'] as const;

  if (!hasData) {
    return (
      <Card>
        <CardHeader
          title="Muscle Development"
          subtitle="Rated from the volume you log."
          icon={<Activity className="h-4 w-4" aria-hidden />}
        />
        <EmptyState
          icon={<Activity className="h-8 w-8" aria-hidden />}
          title="No muscle data yet"
          message="Log a session and every movement's muscle groups start accumulating here — including which ones you are neglecting."
        />
      </Card>
    );
  }

  const visible = showAll ? ratings : ratings.filter((r) => r.volume > 0);

  return (
    <div className="space-y-5">
      {/* --- Priority fixes --- */}
      <Card>
        <CardHeader
          title="Weakest Links"
          subtitle="Least-trained muscles relative to the rest of your body."
          icon={<TriangleAlert className="h-4 w-4" aria-hidden />}
        />
        <ul className="divide-y divide-white/5">
          {weakest.map((rating) => {
            const meta = MUSCLE_META[rating.muscle];
            const grade = MUSCLE_GRADE_META[rating.grade];
            return (
              <li key={rating.muscle} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-100">{meta.label}</p>
                  <Chip className={`bg-white/5 ring-white/10 ${grade.color}`}>{grade.label}</Chip>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  {MUSCLE_FIXES[rating.muscle]}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* --- Balance checks --- */}
      <Card>
        <CardHeader
          title="Structural Balance"
          subtitle="The ratios that keep you healthy and proportional."
          icon={<Scale className="h-4 w-4" aria-hidden />}
        />
        <ul className="divide-y divide-white/5">
          {balance.map((check) => (
            <li key={check.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-200">{check.label}</p>
                <span
                  className={`font-mono text-xs font-bold ${
                    check.status === 'good'
                      ? 'text-vital-300'
                      : check.status === 'high'
                        ? 'text-amber-300'
                        : 'text-forge-300'
                  }`}
                >
                  {fmtDecimal(check.ratio, 2)} : 1
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{check.message}</p>
              <p className="mt-1.5 font-mono text-[10px] text-slate-700">
                Target range {fmtDecimal(check.ideal[0], 1)}–{fmtDecimal(check.ideal[1], 1)}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      {/* --- Full breakdown --- */}
      <Card>
        <CardHeader
          title="Muscle Development"
          subtitle="Scored against your own best-trained muscle."
          icon={<Activity className="h-4 w-4" aria-hidden />}
          action={
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-forge-300 transition hover:text-forge-200"
            >
              {showAll ? 'Trained only' : 'Show all'}
              <ChevronDown
                className={`h-3 w-3 transition-transform ${showAll ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          }
        />
        <div className="space-y-4 p-4">
          {regions.map((region) => {
            const group = visible.filter((r) => MUSCLE_META[r.muscle].region === region);
            if (group.length === 0) return null;
            return (
              <div key={region}>
                <p className="mb-2 font-display text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  {region === 'upper' ? 'Upper body' : region === 'core' ? 'Core' : 'Lower body'}
                </p>
                <ul className="space-y-2.5">
                  {group.map((rating) => {
                    const meta = MUSCLE_META[rating.muscle];
                    const grade = MUSCLE_GRADE_META[rating.grade];
                    return (
                      <li key={rating.muscle}>
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-slate-300">{meta.label}</span>
                          <span className="flex items-baseline gap-2">
                            <span className={`text-[10px] font-medium ${grade.color}`}>
                              {grade.label}
                            </span>
                            <span className="font-mono text-[10px] text-slate-600">
                              {fmt(int(rating.volume, 0))}
                            </span>
                          </span>
                        </div>
                        <ProgressBar
                          value={rating.score}
                          max={100}
                          gradient={grade.bar}
                          height="h-1.5"
                          animated={false}
                          label={meta.label}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <p className="pt-1 text-[10px] leading-relaxed text-slate-600">
            Volume counts reps of every movement that trains a muscle — assisting muscles at a third
            weight, and four seconds of a hold as one rep.
          </p>
        </div>
      </Card>
    </div>
  );
}
