import { CheckCircle2, ExternalLink, Lock, Route, TriangleAlert, X } from 'lucide-react';

import type { Exercise, Profile } from '../lib/types';
import { Button, Chip } from './ui/Primitives';
import { Modal } from './ui/Modal';
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
  titleId = 'exercise-detail-title',
}: {
  exercise: Exercise;
  profile: Profile;
  onClose?: () => void;
  /** Offered when the movement is unlocked, to jump straight into logging it. */
  onPick?: (exercise: Exercise) => void;
  /** So a dialog wrapping this can point `aria-labelledby` at the title. */
  titleId?: string;
}) {
  const unlocked = isUnlocked(exercise, profile);
  const category = CATEGORY_META[exercise.category];
  const grade = GRADE_META[exercise.grade];
  const pb = profile.personalBests?.[exercise.id];

  return (
    <div className="flex h-full flex-col">
      {/* --- Header --- */}
      <div className="flex items-start justify-between gap-3 border-b border-line p-5">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-lg font-bold text-content-strong">
            {exercise.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip className={`${category.ring} ${category.color}`}>{category.label}</Chip>
            <Chip className={grade.color}>{grade.label}</Chip>
            <Chip className="bg-surface-hover text-content-muted ring-line-strong">
              {fmtDecimal(exercise.xpPerUnit, 2)} XP / {exercise.unit === 'seconds' ? 'sec' : 'rep'}
            </Chip>
            {!unlocked ? (
              <Chip className="bg-danger/10 text-danger ring-danger/30">
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
            className="-m-1 shrink-0 rounded-lg p-2 text-content-muted transition hover:bg-surface-hover hover:text-content"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* --- Diagram --- */}
        <div className="border-b border-line bg-surface-sunken/50 px-5 py-4">
          <div className="mx-auto max-w-xs text-forge">
            <ExerciseDiagram
              diagram={exercise.diagram}
              title={exercise.name}
              className="h-36 w-full"
            />
          </div>
          {exercise.hint ? (
            <p className="mt-2 text-center text-xs italic leading-relaxed text-content-muted">
              {exercise.hint}
            </p>
          ) : null}
          <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-content-subtle">
            Schematic — side view
          </p>
        </div>

        {/* --- Lock notice --- */}
        {!unlocked ? (
          <div className="border-b border-line bg-danger-vivid/[0.06] px-5 py-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-danger">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {lockReason(exercise, profile)}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-content-muted">
              You can still train toward it — the route below works whether or not the movement is
              unlocked here.
            </p>
          </div>
        ) : null}

        {/* --- Personal best --- */}
        {pb ? (
          <div className="border-b border-line px-5 py-3.5">
            <p className="text-xs text-content-muted">
              Your best set:{' '}
              <span className="font-mono font-bold text-ember">
                {fmt(pb.value)} {pb.unit === 'seconds' ? 'sec' : 'reps'}
              </span>
            </p>
          </div>
        ) : null}

        {/* --- Form cues --- */}
        <Section title="How to do it">
          <ol className="space-y-2.5">
            {exercise.formCues.map((cue, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-content">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forge/15 font-mono text-[10px] font-bold text-forge">
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
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-content-muted">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn/70" aria-hidden />
                  {mistake}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* --- Progression --- */}
        {exercise.progression ? (
          <Section title="How to train for it" icon={<Route className="h-4 w-4" aria-hidden />}>
            <p className="mb-4 text-sm leading-relaxed text-content-muted">
              {exercise.progression.intro}
            </p>
            <ol className="relative space-y-4 border-l border-line-strong pl-5">
              {exercise.progression.steps.map((step, i) => {
                const linked = exerciseById(step.exerciseId);
                return (
                  <li key={i} className="relative">
                    <span
                      className="absolute -left-[25px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-raised ring-2 ring-arcane/50"
                      aria-hidden
                    />
                    <p className="text-sm font-semibold text-content">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-content-muted">
                      {step.detail}
                    </p>
                    {linked ? (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-surface-hover px-2 py-1 text-[11px] text-forge">
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
      <div className="flex gap-2 border-t border-line p-4">
        <a
          href={demoSearchUrl(exercise)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface-inset px-4 py-2.5 text-sm font-medium text-content ring-1 ring-line-strong transition hover:bg-surface-strong"
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
    <div className="border-b border-line px-5 py-5 last:border-b-0">
      <h3 className="mb-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-widest text-content-muted">
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
  // The early return moved into `Modal`'s `open` prop so the cleanup effect —
  // focus restore, scroll unlock — actually runs when the sheet closes.
  return (
    <Modal
      open={exercise !== null}
      onClose={onClose}
      labelledBy="exercise-sheet-title"
      panelClassName="flex max-h-[88vh] w-full animate-fade-up flex-col overflow-hidden rounded-t-2xl bg-surface-overlay shadow-glow ring-1 ring-line-strong sm:max-w-lg sm:rounded-2xl"
    >
      {exercise ? (
        <ExerciseDetail
          exercise={exercise}
          profile={profile}
          onClose={onClose}
          onPick={onPick}
          titleId="exercise-sheet-title"
        />
      ) : null}
    </Modal>
  );
}
