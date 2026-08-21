import type { Exercise, ExerciseCategory, Goal, WorkoutEntry } from '../types';
import { arr, int, num, pct } from '../safe';
import { entryVolume } from './sets';

/** How many goals a user carries at once. */
export const ACTIVE_GOAL_SLOTS = 3;

interface GoalTemplate {
  id: string;
  title: string;
  description: string;
  type: Goal['type'];
  category?: ExerciseCategory;
  target: number;
  rewardXp: number;
  rewardCoins: number;
  /** Minimum level before this template can be rolled. */
  minLevel: number;
}

const TEMPLATES: GoalTemplate[] = [
  {
    id: 'workouts_10',
    title: 'Complete 10 Workouts',
    description: 'Log ten sessions. Volume is optional — showing up is not.',
    type: 'workouts',
    target: 10,
    rewardXp: 250,
    rewardCoins: 150,
    minLevel: 1,
  },
  {
    id: 'workouts_5',
    title: 'Complete 5 Workouts',
    description: 'Five logged sessions to prove the habit is real.',
    type: 'workouts',
    target: 5,
    rewardXp: 120,
    rewardCoins: 80,
    minLevel: 1,
  },
  {
    id: 'reps_500',
    title: 'Move 500 Reps',
    description: 'Accumulate 500 reps across any rep-based movement.',
    type: 'reps',
    target: 500,
    rewardXp: 200,
    rewardCoins: 120,
    minLevel: 1,
  },
  {
    id: 'reps_1500',
    title: 'Move 1,500 Reps',
    description: 'A serious block of volume. Grind it out.',
    type: 'reps',
    target: 1500,
    rewardXp: 500,
    rewardCoins: 300,
    minLevel: 5,
  },
  {
    id: 'xp_1000',
    title: 'Earn 1,000 XP',
    description: 'Bank a thousand experience from logged work.',
    type: 'xp',
    target: 1000,
    rewardXp: 200,
    rewardCoins: 140,
    minLevel: 2,
  },
  {
    id: 'xp_3000',
    title: 'Earn 3,000 XP',
    description: 'Three thousand XP of honest work.',
    type: 'xp',
    target: 3000,
    rewardXp: 600,
    rewardCoins: 380,
    minLevel: 8,
  },
  {
    id: 'streak_7',
    title: 'Hold a 7-Day Streak',
    description: 'Seven consecutive days. Earn the Disciplined identity.',
    type: 'streak',
    target: 7,
    rewardXp: 350,
    rewardCoins: 220,
    minLevel: 1,
  },
  {
    id: 'streak_15',
    title: 'Hold a 15-Day Streak',
    description: 'Fifteen straight days — Relentless territory.',
    type: 'streak',
    target: 15,
    rewardXp: 800,
    rewardCoins: 500,
    minLevel: 4,
  },
  {
    id: 'push_300',
    title: 'Log 300 Pushing Reps',
    description: 'Push-ups, dips, presses — anything that drives away from you.',
    type: 'category',
    category: 'push',
    target: 300,
    rewardXp: 220,
    rewardCoins: 140,
    minLevel: 1,
  },
  {
    id: 'pull_200',
    title: 'Log 200 Pulling Reps',
    description: 'Rows, chin-ups, pull-ups. Build the back half.',
    type: 'category',
    category: 'pull',
    target: 200,
    rewardXp: 260,
    rewardCoins: 160,
    minLevel: 2,
  },
  {
    id: 'core_600',
    title: 'Log 600 Core Units',
    description: 'Reps and held seconds both count toward the midline.',
    type: 'category',
    category: 'core',
    target: 600,
    rewardXp: 240,
    rewardCoins: 150,
    minLevel: 1,
  },
  {
    id: 'skill_200',
    title: 'Accumulate 200s of Skill Holds',
    description: 'Levers, planches, flags. Time under tension is the whole game.',
    type: 'category',
    category: 'skill',
    target: 200,
    rewardXp: 900,
    rewardCoins: 560,
    minLevel: 14,
  },
];

function templateToGoal(template: GoalTemplate, rng: Rng = Math.random): Goal {
  return {
    id: `${template.id}_${Date.now().toString(36)}_${rng().toString(36).slice(2, 7)}`,
    templateId: template.id,
    title: template.title,
    description: template.description,
    type: template.type,
    ...(template.category ? { category: template.category } : {}),
    target: template.target,
    progress: 0,
    rewardXp: template.rewardXp,
    rewardCoins: template.rewardCoins,
    createdAt: Date.now(),
    completedAt: null,
  };
}

/**
 * Roll a fresh set of goals, avoiding templates already active and any the
 * user's level has not reached. Falls back to level-1 templates so the slots
 * are always filled.
 */
export type Rng = () => number;

export function rollGoals(
  level: unknown,
  existing: Goal[],
  count: number,
  rng: Rng = Math.random,
): Goal[] {
  const lvl = Math.max(1, int(level, 1));
  const taken = new Set(arr<Goal>(existing).map((g) => g.templateId));

  const eligible = TEMPLATES.filter((t) => t.minLevel <= lvl && !taken.has(t.id));
  const pool = eligible.length > 0 ? eligible : TEMPLATES.filter((t) => !taken.has(t.id));

  // Shuffle a copy so a user does not get the same three goals every cycle.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, Math.max(0, int(count, 0))).map((t) => templateToGoal(t, rng));
}

/** Top the user's goal list back up to the full slot count. */
export function ensureGoals(level: unknown, existing: unknown, rng: Rng = Math.random): Goal[] {
  const active = arr<Goal>(existing).filter((g) => g && !g.completedAt);
  if (active.length >= ACTIVE_GOAL_SLOTS) return active.slice(0, ACTIVE_GOAL_SLOTS);
  return [...active, ...rollGoals(level, active, ACTIVE_GOAL_SLOTS - active.length, rng)];
}

export interface GoalAdvanceInput {
  entries: WorkoutEntry[];
  resolve: (id: string) => Exercise | undefined;
  xpEarned: number;
  totalReps: number;
  streak: number;
  /** Injectable only so the demo fixture can reproduce the same athlete. */
  rng?: Rng;
}

export interface GoalAdvanceResult {
  goals: Goal[];
  completed: Goal[];
  rewardXp: number;
  rewardCoins: number;
}

/**
 * Advance every active goal by one session's contribution.
 *
 * Completed goals are removed and replaced with fresh rolls, and their rewards
 * are returned for the caller to bank alongside the session's own XP.
 */
export function advanceGoals(
  goals: unknown,
  level: unknown,
  input: GoalAdvanceInput,
): GoalAdvanceResult {
  const rng = input.rng ?? Math.random;
  const active = ensureGoals(level, goals, rng);
  const completed: Goal[] = [];
  const survivors: Goal[] = [];

  // Per-category volume contributed by this session.
  const categoryVolume = new Map<ExerciseCategory, number>();
  for (const entry of input.entries) {
    const exercise = input.resolve(entry.exerciseId);
    if (!exercise) continue;
    const prev = categoryVolume.get(exercise.category) ?? 0;
    categoryVolume.set(exercise.category, prev + entryVolume(entry));
  }

  for (const goal of active) {
    let delta = 0;
    switch (goal.type) {
      case 'workouts':
        delta = 1;
        break;
      case 'reps':
        delta = Math.max(0, num(input.totalReps, 0));
        break;
      case 'xp':
        delta = Math.max(0, num(input.xpEarned, 0));
        break;
      case 'category':
        delta = goal.category ? (categoryVolume.get(goal.category) ?? 0) : 0;
        break;
      case 'streak':
        // Measured against the goal's own baseline below, not accumulated.
        delta = 0;
        break;
    }

    // A streak goal measures how far the streak has come *since the goal was
    // rolled*. Comparing against the absolute streak let a long-running athlete
    // re-roll into instantly-complete goals indefinitely.
    const progress =
      goal.type === 'streak'
        ? Math.max(
            num(goal.progress, 0),
            Math.max(0, num(input.streak, 0) - Math.max(0, num(goal.baseline, 0))),
          )
        : num(goal.progress, 0) + delta;

    const updated: Goal = { ...goal, progress: Math.min(progress, num(goal.target, 1)) };

    if (progress >= num(goal.target, Infinity)) {
      completed.push({ ...updated, completedAt: Date.now() });
    } else {
      survivors.push(updated);
    }
  }

  // Freshly rolled goals are stamped with the streak the athlete already holds,
  // so a streak goal asks for progress from here rather than handing a
  // long-running athlete an instant completion.
  const refilled =
    completed.length > 0
      ? [
          ...survivors,
          ...rollGoals(level, survivors, ACTIVE_GOAL_SLOTS - survivors.length, rng).map((g) =>
            g.type === 'streak' ? { ...g, baseline: Math.max(0, num(input.streak, 0)) } : g,
          ),
        ]
      : survivors;

  return {
    goals: refilled,
    completed,
    rewardXp: completed.reduce((acc, g) => acc + num(g.rewardXp, 0), 0),
    rewardCoins: completed.reduce((acc, g) => acc + num(g.rewardCoins, 0), 0),
  };
}

/** 0–100 completion for a goal's progress bar. Never NaN. */
export function goalPercent(goal: Goal | null | undefined): number {
  if (!goal) return 0;
  return pct(goal.progress, goal.target);
}
