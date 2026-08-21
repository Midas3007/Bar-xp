import { useMemo, useState } from 'react';
import { CheckCircle2, Compass, Lock, Route, Sparkles, X } from 'lucide-react';

import type { Exercise, Profile } from '../lib/types';
import type { ViewKey } from '../components/layout/AppShell';
import type { SkillNode, SkillNodeState } from '../lib/game/skillTree';
import { buildSkillTree, frontierNode, skillStates, skillTally } from '../lib/game/skillTree';
import { CATEGORY_META, exerciseById } from '../lib/game/exercises';
import { requestExercise } from '../lib/handoff';
import { SkillTree, STATE_LABEL } from '../components/SkillTree';
import { ExerciseSheet } from '../components/ExerciseDetail';
import { Card, Chip, Button } from '../components/ui/Primitives';
import { Modal } from '../components/ui/Modal';
import { fmt } from '../lib/safe';

/**
 * The skill tree screen.
 *
 * The catalog has always described how to earn a muscle-up, a front lever or a
 * planche — an intro and an ordered set of drills, each with coaching detail.
 * Until now that only appeared inside one movement's detail sheet, so it was
 * possible to train with this app for months and never find it. This is that
 * data as a map.
 */
export function SkillTreeView({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (view: ViewKey) => void;
}) {
  // The graph is static; only the states depend on the athlete.
  const graph = useMemo(() => buildSkillTree(), []);
  const states = useMemo(() => skillStates(graph, profile), [graph, profile]);
  const tally = useMemo(() => skillTally(graph, states), [graph, states]);
  const focus = useMemo(() => frontierNode(graph, states), [graph, states]);

  const [selected, setSelected] = useState<SkillNode | null>(null);

  const selectedExercise: Exercise | null =
    selected?.kind === 'movement' ? (exerciseById(selected.exerciseId) ?? null) : null;
  const selectedDrill = selected?.kind === 'drill' ? selected : null;

  const startSession = (exerciseId: string) => {
    requestExercise(exerciseId);
    onNavigate('workout');
  };

  const movements = graph.nodes.filter((n) => n.kind === 'movement');
  const clearedMovements = movements.filter((n) => states[n.id] === 'cleared').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Compact by design. On a phone this sits above the map, and a tall
          introduction would push the thing it introduces below the fold. */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="flex items-center gap-2 font-display text-base font-bold text-content-strong sm:text-lg">
            <Compass className="h-5 w-5 shrink-0 text-arcane" aria-hidden />
            Skill Tree
          </h1>
          <p className="shrink-0 text-right">
            <span className="font-mono text-xl font-bold text-content-strong sm:text-2xl">
              {fmt(clearedMovements)}
              <span className="text-sm text-content-subtle">/{fmt(movements.length)}</span>
            </span>
            <span className="block text-[10px] uppercase tracking-widest text-content-subtle">
              Movements logged
            </span>
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <Legend state="cleared" count={tally.cleared} />
          <Legend state="in_progress" count={tally.in_progress} />
          <Legend state="available" count={tally.available} />
          <Legend state="locked" count={tally.locked} />
        </div>
      </Card>

      <div className="h-[54vh] min-h-[360px] sm:h-[64vh] sm:min-h-[440px]">
        <SkillTree
          graph={graph}
          states={states}
          focus={focus}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
      </div>

      <p className="px-1 text-xs leading-relaxed text-content-muted">
        Every movement in the game and the drill-by-drill route to it — nothing is hidden, because
        the skills you cannot do yet are the ones worth looking at. Drag to move, pinch or scroll to
        zoom, and tap any node for how to train it. Colour is the movement&rsquo;s category:{' '}
        {CATEGORY_ORDER_LABEL}.
      </p>

      {/* A movement opens the sheet the rest of the app already uses, rather
          than a second detail surface that would drift from it. */}
      <ExerciseSheet
        exercise={selectedExercise}
        profile={profile}
        onClose={() => setSelected(null)}
        onPick={(exercise) => startSession(exercise.id)}
      />

      <DrillSheet
        drill={selectedDrill}
        state={selectedDrill ? (states[selectedDrill.id] ?? 'locked') : 'locked'}
        onClose={() => setSelected(null)}
        onStart={startSession}
      />
    </div>
  );
}

const CATEGORY_ORDER_LABEL = 'push, pull, legs, core, skill and conditioning';

function Legend({ state, count }: { state: SkillNodeState; count: number }) {
  const meta = {
    cleared: { tone: 'bg-vital/10 text-vital ring-vital/30', icon: CheckCircle2 },
    in_progress: { tone: 'bg-ember/10 text-ember ring-ember/30', icon: Route },
    available: { tone: 'bg-forge/10 text-forge ring-forge/30', icon: Sparkles },
    locked: { tone: 'bg-surface-hover text-content-subtle ring-line-strong', icon: Lock },
  }[state];
  const Icon = meta.icon;
  return (
    <Chip className={meta.tone}>
      <Icon className="h-3 w-3" aria-hidden />
      {fmt(count)} {STATE_LABEL[state]}
    </Chip>
  );
}

/**
 * A drill is a coaching step, not a movement, so it gets a small sheet of its
 * own rather than being forced through `ExerciseDetail` — which would have to
 * invent a diagram, form cues and mistakes that the catalog does not have.
 */
function DrillSheet({
  drill,
  state,
  onClose,
  onStart,
}: {
  drill: SkillNode | null;
  state: SkillNodeState;
  onClose: () => void;
  onStart: (exerciseId: string) => void;
}) {
  const target = drill?.chainId ? exerciseById(drill.chainId) : undefined;
  const linked = exerciseById(drill?.exerciseId);
  const category = drill ? CATEGORY_META[drill.category] : null;

  return (
    <Modal
      open={drill !== null}
      onClose={onClose}
      labelledBy="drill-sheet-title"
      panelClassName="flex max-h-[88vh] w-full animate-fade-up flex-col overflow-hidden rounded-t-2xl bg-surface-overlay shadow-glow ring-1 ring-line-strong sm:max-w-md sm:rounded-2xl"
    >
      {drill ? (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-line p-5">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-content-subtle">
                {target
                  ? `Step ${fmt(drill.step)} of ${fmt(drill.chainLength)} toward ${target.name}`
                  : 'Drill'}
              </p>
              <h2
                id="drill-sheet-title"
                className="mt-1 font-display text-lg font-bold text-content-strong"
              >
                {drill.label}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {category ? (
                  <Chip className={`${category.ring} ${category.color}`}>{category.label}</Chip>
                ) : null}
                <Chip className="bg-surface-hover text-content-muted ring-line-strong">
                  {STATE_LABEL[state]}
                </Chip>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-m-1 shrink-0 rounded-lg p-2 text-content-muted transition hover:bg-surface-hover hover:text-content"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <p className="text-sm leading-relaxed text-content">{drill.detail}</p>
            {target?.progression ? (
              <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-content-muted">
                {target.progression.intro}
              </p>
            ) : null}
          </div>

          <div className="border-t border-line p-4">
            {linked ? (
              <Button className="w-full" onClick={() => onStart(linked.id)}>
                Train it — log {linked.name}
              </Button>
            ) : (
              <p className="text-center text-xs leading-relaxed text-content-subtle">
                This one is a position rather than a movement the app scores. Work it inside a
                session and log what you did around it.
              </p>
            )}
          </div>
        </>
      ) : null}
    </Modal>
  );
}
