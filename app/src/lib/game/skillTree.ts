import type { ExerciseCategory, ExerciseGrade, Profile } from '../types';
import { num, str } from '../safe';
import { EXERCISES, isUnlocked } from './exercises';

/**
 * The skill tree: every movement in the catalog and every drill on the way to
 * it, arranged as a graph.
 *
 * Nothing here is new data. Twelve movements in `exercises.ts` already carry a
 * `progression` — an intro and an ordered set of drills, each with coaching
 * detail and usually a linked exercise — and until now that only appeared
 * inside one movement's detail sheet. This module turns the catalog into the
 * shape it always implied.
 *
 * Pure: no Firestore, no DOM, no React. It is compiled by the zero-dependency
 * test harness, so it may import only from `../safe`, `../types` and modules
 * already in `SOURCES`.
 */

export type SkillNodeKind = 'movement' | 'drill';

/**
 * `cleared`     the movement has been logged — it has a personal best.
 * `available`   its prerequisite is cleared and the level gate allows it.
 * `in_progress` something earlier in its chain is cleared, but not this.
 * `locked`      not yet reachable. Still drawn, still readable: seeing what is
 *               ahead is the entire point of a skill tree.
 */
export type SkillNodeState = 'locked' | 'available' | 'in_progress' | 'cleared';

export interface SkillNode {
  /** `skill:muscle_up` or `drill:muscle_up:2`. */
  id: string;
  kind: SkillNodeKind;
  label: string;
  /** The movement this node trains, when there is one. Drills often link one. */
  exerciseId?: string;
  /** Drill coaching text. */
  detail?: string;
  category: ExerciseCategory;
  /** Movement nodes only. */
  grade?: ExerciseGrade;
  /** The movement whose progression this node belongs to. */
  chainId?: string;
  /**
   * Movement nodes with a progression: the movement this one hangs from.
   *
   * Deliberately the *anchor* rather than the last drill in the chain. A
   * movement becomes attemptable when its prerequisite movement is logged and
   * the level gate opens — the drills between them are the route, not a set of
   * gates, and most of them describe positions the app has no way to record.
   * Requiring all of them would leave every elite skill permanently short of
   * `available`, which is the opposite of what the map is for.
   */
  anchorId?: string;
  /** 1-based position in that chain, and its length. Drives the partial ring. */
  step?: number;
  chainLength?: number;
  /** An elite movement at the end of a chain — drawn larger. It is the point. */
  terminal: boolean;
  x: number;
  y: number;
}

export interface SkillEdge {
  from: string;
  to: string;
  /**
   * A second prerequisite named further down a chain rather than the one it
   * hangs from — a muscle-up needs dips as well as pull-ups. Drawn faintly, so
   * the main route stays legible.
   */
  support?: boolean;
}

export interface SkillGraph {
  nodes: SkillNode[];
  edges: SkillEdge[];
  byId: Record<string, SkillNode>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hand-placed coordinates, one entry per catalog movement.
 *
 * Deliberately not computed. The graph is small and static — it changes only
 * when someone edits `exercises.ts` — so a solver would add a dependency and
 * rearrange the picture on every reload for no benefit. Fixed coordinates let
 * the tree be *composed*: push on the left, then pull, the skill work in the
 * middle where its pulling and core prerequisites both reach it, then core,
 * legs and conditioning. Foundations sit along the bottom and the elite skills
 * climb away from them with room around each one.
 *
 * The space is arbitrary; the renderer scales it to fit.
 */
const PLACEMENT: Record<string, { x: number; y: number }> = {
  /* Push. Foundations alternate between two rows so that neighbouring names —
     "Diamond Push-up" next to "Push-up" — never collide at full zoom. */
  incline_push_up: { x: 90, y: 1300 },
  push_up: { x: 250, y: 1150 },
  diamond_push_up: { x: 420, y: 1300 },
  pike_push_up: { x: 110, y: 930 },
  dip: { x: 390, y: 930 },
  archer_push_up: { x: 300, y: 590 },
  handstand_push_up: { x: 90, y: 250 },
  one_arm_push_up: { x: 430, y: 110 },

  /* Pull */
  australian_row: { x: 640, y: 1150 },
  chin_up: { x: 810, y: 1300 },
  pull_up: { x: 980, y: 1150 },
  wide_pull_up: { x: 660, y: 930 },
  archer_pull_up: { x: 680, y: 570 },
  muscle_up: { x: 960, y: 250 },

  /* Skill — placed between its pulling and core prerequisites, which is where
     the graph says they belong: a front lever is a pull, a planche is a press,
     and both are held with the same hollow body the core lane teaches. */
  human_flag: { x: 1620, y: 1040 },
  front_lever: { x: 1440, y: 240 },
  planche_lean: { x: 1800, y: 700 },
  full_planche: { x: 1800, y: 190 },

  /* Core */
  plank: { x: 2060, y: 1150 },
  hollow_hold: { x: 2230, y: 1300 },
  leg_raise: { x: 2400, y: 1150 },
  hanging_knee_raise: { x: 2130, y: 930 },
  toes_to_bar: { x: 2120, y: 530 },
  l_sit: { x: 2460, y: 600 },

  /* Legs */
  squat: { x: 2680, y: 1150 },
  lunge: { x: 2850, y: 1300 },
  pistol_squat: { x: 2700, y: 590 },

  /* Conditioning */
  burpee: { x: 3060, y: 1150 },
  mountain_climber: { x: 3230, y: 1300 },
  jump_rope: { x: 3400, y: 1150 },
};
/**
 * Where a chain hangs from, and how far its path bows out on the way.
 *
 * Most chains take their anchor from the first drill that names an exercise.
 * These three name none — the L-sit, the human flag and the planche lean are
 * described purely as drills — so the prerequisite is stated here rather than
 * invented by a fallback nobody can see. The bow is a perpendicular offset
 * applied to the middle of the path, which is what keeps two chains leaving
 * the same movement from being drawn on top of each other.
 */
const CHAIN_ROUTE: Record<string, { anchor?: string; bow?: number }> = {
  archer_push_up: { bow: -70 },
  handstand_push_up: { bow: 50 },
  one_arm_push_up: { bow: -60 },
  // Its second drill names the wide pull-up, and hanging it there rather than
  // on the plain pull-up keeps four chains from leaving the same node.
  archer_pull_up: { anchor: 'wide_pull_up', bow: 60 },
  muscle_up: { bow: -120 },
  front_lever: { bow: 120 },
  human_flag: { anchor: 'pull_up', bow: -140 },
  planche_lean: { bow: -90 },
  full_planche: { bow: 60 },
  l_sit: { anchor: 'hollow_hold', bow: -70 },
  toes_to_bar: { bow: 60 },
  pistol_squat: { bow: 55 },
};
/* -------------------------------------------------------------------------- */
/* Building the graph                                                          */
/* -------------------------------------------------------------------------- */

export function movementNodeId(exerciseId: string): string {
  return `skill:${exerciseId}`;
}

export function drillNodeId(exerciseId: string, step: number): string {
  return `drill:${exerciseId}:${step}`;
}

/** Where a fallback anchor lands when a chain names no exercise at all. */
const CATEGORY_ROOT: Record<ExerciseCategory, string> = {
  push: 'push_up',
  pull: 'pull_up',
  legs: 'squat',
  core: 'plank',
  skill: 'pull_up',
  conditioning: 'burpee',
};

function place(exerciseId: string): { x: number; y: number } {
  // An exercise added to the catalog without a coordinate would otherwise land
  // at the origin and overlap the tree. Parking it below is visible and
  // harmless, and the test that every node is placed catches it first.
  return PLACEMENT[exerciseId] ?? { x: 120, y: 1400 };
}

/**
 * Points along the path from the anchor to the movement, one per drill.
 *
 * A straight interpolation with a perpendicular bow: still hand-controlled, in
 * that both endpoints and the bow are authored, but it saves placing fifty-four
 * drill coordinates by hand and guarantees a chain always reads as one path.
 */
function chainPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  count: number,
  bow: number,
): Array<{ x: number; y: number }> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  // The unit normal, so the bow is a sideways offset rather than a stretch.
  const nx = -dy / length;
  const ny = dx / length;

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= count; i += 1) {
    const t = i / (count + 1);
    // A parabola peaking at the middle: zero at both ends, so the chain always
    // meets its endpoints exactly.
    const swell = bow * 4 * t * (1 - t);
    points.push({ x: from.x + dx * t + nx * swell, y: from.y + dy * t + ny * swell });
  }
  return points;
}

/**
 * The whole tree.
 *
 * Deterministic and cheap — no profile is involved, because nothing about the
 * *shape* of the tree depends on who is looking at it. State is a separate,
 * derived layer.
 */
export function buildSkillTree(): SkillGraph {
  const nodes: SkillNode[] = [];
  const edges: SkillEdge[] = [];

  for (const exercise of EXERCISES) {
    const at = place(exercise.id);
    nodes.push({
      id: movementNodeId(exercise.id),
      kind: 'movement',
      label: exercise.name,
      exerciseId: exercise.id,
      detail: exercise.hint,
      category: exercise.category,
      grade: exercise.grade,
      terminal: exercise.grade === 'elite',
      x: at.x,
      y: at.y,
    });
  }

  for (const exercise of EXERCISES) {
    const steps = exercise.progression?.steps ?? [];
    if (steps.length === 0) continue;

    const route = CHAIN_ROUTE[exercise.id] ?? {};
    const linked = steps.map((step) => str(step.exerciseId, '')).filter((id) => id !== '');
    const anchorId = route.anchor ?? linked[0] ?? CATEGORY_ROOT[exercise.category];
    const anchorNode = movementNodeId(anchorId);

    const points = chainPoints(place(anchorId), place(exercise.id), steps.length, route.bow ?? 0);
    const movement = nodes.find((n) => n.id === movementNodeId(exercise.id));
    if (movement) movement.anchorId = anchorId;

    let previous = anchorNode;
    steps.forEach((step, index) => {
      const id = drillNodeId(exercise.id, index + 1);
      nodes.push({
        id,
        kind: 'drill',
        label: step.title,
        exerciseId: str(step.exerciseId, '') || undefined,
        detail: step.detail,
        category: exercise.category,
        chainId: exercise.id,
        step: index + 1,
        chainLength: steps.length,
        terminal: false,
        x: points[index].x,
        y: points[index].y,
      });
      edges.push({ from: previous, to: id });
      previous = id;
    });
    edges.push({ from: previous, to: movementNodeId(exercise.id) });

    // Every other movement the chain names is a real prerequisite too — a
    // muscle-up needs dips as much as pull-ups — so say so, faintly.
    for (const id of new Set(linked)) {
      if (id === anchorId) continue;
      edges.push({ from: movementNodeId(id), to: movementNodeId(exercise.id), support: true });
    }
  }

  const byId: Record<string, SkillNode> = {};
  for (const node of nodes) byId[node.id] = node;

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  return {
    nodes,
    edges,
    byId,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Derived state                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Node state, derived on every render and stored nowhere.
 *
 * The same reasoning as `achievements.ts`: everything here is a function of
 * personal bests and the existing level gating, both of which the profile
 * already holds. Storing it would create a second copy that can drift from
 * what the athlete has actually done, and a schema to migrate when the catalog
 * changes.
 *
 * Total by construction. A profile with a missing, null or malformed
 * `personalBests` produces a complete set of states rather than throwing —
 * `safe.ts` exists for exactly this.
 */
export function skillStates(
  graph: SkillGraph,
  profile: Profile | null,
): Record<string, SkillNodeState> {
  const bests = (profile?.personalBests ?? {}) as Record<string, unknown>;
  const isLogged = (exerciseId: string | undefined): boolean => {
    if (!exerciseId) return false;
    const best = bests[exerciseId] as Record<string, unknown> | undefined;
    return best != null && num(best.value, 0) > 0;
  };

  const unlocked = new Set<string>();
  for (const exercise of EXERCISES) {
    if (isUnlocked(exercise, profile)) unlocked.add(exercise.id);
  }

  // Which chain each movement hangs from, and how many of its drills are done.
  const chainCleared: Record<string, number> = {};
  for (const node of graph.nodes) {
    if (node.kind !== 'drill' || !node.chainId) continue;
    if (isLogged(node.exerciseId)) {
      chainCleared[node.chainId] = Math.max(chainCleared[node.chainId] ?? 0, node.step ?? 0);
    }
  }

  const anchorOf: Record<string, string> = {};
  for (const edge of graph.edges) {
    if (edge.support) continue;
    // The single non-support edge into a node is its prerequisite.
    anchorOf[edge.to] = edge.from;
  }

  const states: Record<string, SkillNodeState> = {};

  const movementCleared = (exerciseId: string | undefined): boolean =>
    exerciseId != null && isLogged(exerciseId);

  for (const node of graph.nodes) {
    if (node.kind === 'movement') {
      if (movementCleared(node.exerciseId)) {
        states[node.id] = 'cleared';
        continue;
      }
      const gateOpen = node.exerciseId != null && unlocked.has(node.exerciseId);
      // A movement with no chain — every foundation — is available as soon as
      // its level gate opens. That is what stops a brand-new account opening a
      // wall of grey.
      const prerequisiteDone = node.anchorId == null || movementCleared(node.anchorId);

      if (gateOpen && prerequisiteDone) states[node.id] = 'available';
      else if ((chainCleared[node.exerciseId ?? ''] ?? 0) > 0) states[node.id] = 'in_progress';
      else states[node.id] = 'locked';
      continue;
    }

    // Drills. A cleared movement clears its whole route — you did not reach a
    // front lever without passing through the tuck.
    const chainId = node.chainId ?? '';
    const step = node.step ?? 0;
    if (movementCleared(chainId) || isLogged(node.exerciseId)) {
      states[node.id] = 'cleared';
      continue;
    }

    const done = chainCleared[chainId] ?? 0;
    if (done >= step) {
      states[node.id] = 'cleared';
    } else if (done > 0) {
      states[node.id] = 'in_progress';
    } else {
      const anchor = anchorOf[node.id];
      const anchorNode = anchor ? graph.byId[anchor] : undefined;
      const ready =
        anchorNode?.kind === 'movement' ? movementCleared(anchorNode.exerciseId) : false;
      states[node.id] = ready ? 'available' : 'locked';
    }
  }

  return states;
}

/**
 * The node to open the map on: the athlete's frontier.
 *
 * A tree scaled to fit a 390px phone is unreadable, so a narrow screen opens
 * centred on the first thing worth doing next rather than on the whole
 * picture. Prefers a movement that is in progress — that is a route already
 * being walked — then anything available, then the middle of the tree.
 */
export function frontierNode(
  graph: SkillGraph,
  states: Record<string, SkillNodeState>,
): SkillNode | null {
  // Something you could train today beats something you are part-way toward,
  // and among those the one furthest up the tree is the most interesting: for a
  // beginner that is still the foundation row, and for an athlete with a few
  // months behind them it is the first elite skill within reach.
  const pick = (kind: SkillNodeKind | null, state: SkillNodeState) =>
    graph.nodes
      .filter((n) => (kind == null || n.kind === kind) && states[n.id] === state)
      .sort((a, b) => a.y - b.y)[0];

  return (
    pick('movement', 'available') ??
    pick(null, 'available') ??
    pick('movement', 'in_progress') ??
    graph.nodes[0] ??
    null
  );
}

/** How many nodes sit in each state. Drives the summary strip above the map. */
export function skillTally(
  graph: SkillGraph,
  states: Record<string, SkillNodeState>,
): Record<SkillNodeState, number> {
  const tally: Record<SkillNodeState, number> = {
    locked: 0,
    available: 0,
    in_progress: 0,
    cleared: 0,
  };
  for (const node of graph.nodes) tally[states[node.id] ?? 'locked'] += 1;
  return tally;
}
