import { CheckCircle2, ExternalLink, Lock, Route, TriangleAlert, X } from 'lucide-react';

import type { Exercise, Profile } from '../lib/types';
import { Button, Chip } from './ui/Primitives';
import { ExerciseDiagram } from './ExerciseDiagram';
import {
  CATEGORY_META,
  GRADE_META,
  demoSearchUrl,
  exerciseById,
  isUnlocked,
  lockReason,
} from '../lib/game/exercises';
import { fmt, fmtDecimal } from '../lib/safe';

/**
 * Everything the app knows about one movement: what it looks like, how to do
 * it, what people get wrong, and — when it is still locked — the route to
 * earning it.
 */
export function ExerciseDetail({
  exercise,
  profile,
  onClose,
  onPick,
}: {
  exercise: Exercise;
  profile: Profile;
  onClose?: () => void;
  /** Offered when the movement is unlocked, to jump straight into logging it. */
  onPick?: (exercise: Exercise) => void;
}) {
  const unlocked = isUnlocked(exercise, profile);
  const category = CATEGORY_META[exercise.category];
  const grade = GRADE_META[exercise.grade];
  const pb = profile.personalBests?.[exercise.id];

  return (
    <div className="flex h-full flex-col">
      {/* --- Header --- */}
      <div className="flex items-start justify-between gap-3 border-b border-white/5 p-5">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-slate-50">{exercise.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip className={`${category.ring} ${category.color}`}>{category.label}</Chip>
            <Chip className={grade.color}>{grade.label}</Chip>
            <Chip className="bg-white/5 text-slate-400 ring-white/10">
              {fmtDecimal(exercise.xpPerUnit, 2)} XP / {exercise.unit === 'seconds' ? 'sec' : 'rep'}
            </Chip>
            {!unlocked ? (
              <Chip className="bg-rose-500/10 text-rose-300 ring-rose-500/30">
                <Lock className="h-3 w-3" aria-hidden />
                Locked
              </Chip>
            ) : null}
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="-m-1 shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* --- Diagram --- */}
        <div className="border-b border-white/5 bg-ink-900/50 px-5 py-4">
          <div className="mx-auto max-w-xs text-forge-300">
            <ExerciseDiagram
              diagram={exercise.diagram}
              title={exercise.name}
              className="h-36 w-full"
            />
          </div>
          {exercise.hint ? (
            <p className="mt-2 text-center text-xs italic leading-relaxed text-slate-500">
              {exercise.hint}
            </p>
          ) : null}
          <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-slate-700">
            Schematic — side view
          </p>
        </div>

        {/* --- Lock notice --- */}
        {!unlocked ? (
          <div className="border-b border-white/5 bg-rose-500/[0.06] px-5 py-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {lockReason(exercise, profile)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              You can still train toward it — the route below works whether or not the movement is
              unlocked here.
            </p>
          </div>
        ) : null}

        {/* --- Personal best --- */}
        {pb ? (
          <div className="border-b border-white/5 px-5 py-3.5">
            <p className="text-xs text-slate-500">
              Your best set:{' '}
              <span className="font-mono font-bold text-ember-300">
                {fmt(pb.value)} {pb.unit === 'seconds' ? 'sec' : 'reps'}
              </span>
            </p>
          </div>
        ) : null}

        {/* --- Form cues --- */}
        <Section title="How to do it">
          <ol className="space-y-2.5">
            {exercise.formCues.map((cue, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forge-500/15 font-mono text-[10px] font-bold text-forge-300">
                  {i + 1}
                </span>
                {cue}
              </li>
            ))}
          </ol>
        </Section>

        {/* --- Common mistakes --- */}
        {exercise.mistakes.length > 0 ? (
          <Section title="Common mistakes">
            <ul className="space-y-2">
              {exercise.mistakes.map((mistake, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-400">
                  <TriangleAlert
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/70"
                    aria-hidden
                  />
                  {mistake}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* --- Progression --- */}
        {exercise.progression ? (
          <Section title="How to train for it" icon={<Route className="h-4 w-4" aria-hidden />}>
            <p className="mb-4 text-sm leading-relaxed text-slate-400">
              {exercise.progression.intro}
            </p>
            <ol className="relative space-y-4 border-l border-white/10 pl-5">
              {exercise.progression.steps.map((step, i) => {
                const linked = exerciseById(step.exerciseId);
                return (
                  <li key={i} className="relative">
                    <span
                      className="absolute -left-[25px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink-850 ring-2 ring-arcane-500/50"
                      aria-hidden
                    />
                    <p className="text-sm font-semibold text-slate-200">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.detail}</p>
                    {linked ? (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-forge-300">
                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                        Log it as {linked.name}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Section>
        ) : null}
      </div>

      {/* --- Footer actions --- */}
      <div className="flex gap-2 border-t border-white/5 p-4">
        <a
          href={demoSearchUrl(exercise)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink-750 px-4 py-2.5 text-sm font-medium text-slate-200 ring-1 ring-white/10 transition hover:bg-ink-700"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Watch a demo
        </a>
        {onPick && unlocked ? (
          <Button
            className="flex-1"
            onClick={() => {
              onPick(exercise);
              onClose?.();
            }}
          >
            Log this
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-white/5 px-5 py-5 last:border-b-0">
      <h3 className="mb-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-widest text-slate-400">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

/** Bottom-sheet on mobile, centred dialog on desktop. */
export function ExerciseSheet({
  exercise,
  profile,
  onClose,
  onPick,
}: {
  exercise: Exercise | null;
  profile: Profile;
  onClose: () => void;
  onPick?: (exercise: Exercise) => void;
}) {
  if (!exercise) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-ink-950/85 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative flex max-h-[88vh] w-full animate-fade-up flex-col overflow-hidden rounded-t-2xl bg-ink-850 shadow-glow ring-1 ring-white/10 sm:max-w-lg sm:rounded-2xl">
        <ExerciseDetail
          exercise={exercise}
          profile={profile}
          onClose={onClose}
          onPick={onPick}
        />
      </div>
    </div>
  );
}
