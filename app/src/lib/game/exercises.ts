import type { CustomExercise, Exercise, ExerciseCategory, Profile } from '../types';
import { arr, num, str } from '../safe';

/**
 * The core movement catalog.
 *
 * `xpPerUnit` is XP per rep, or per second for holds — holds are deliberately
 * an order of magnitude cheaper per unit since a 60s plank is one "set".
 * Advanced skills sit behind `minLevel`, and each can be bought open early via
 * the matching `unlockId` in the shop.
 */
export const EXERCISES: Exercise[] = [
  /* --- Push ------------------------------------------------------------- */
  {
    id: 'push_up',
    name: 'Push-up',
    category: 'push',
    unit: 'reps',
    xpPerUnit: 1,
    statWeights: { strength: 0.45, endurance: 0.3, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    hint: 'Chest to fist height, locked-out elbows.',
  },
  {
    id: 'incline_push_up',
    name: 'Incline Push-up',
    category: 'push',
    unit: 'reps',
    xpPerUnit: 0.7,
    statWeights: { strength: 0.35, endurance: 0.4, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    hint: 'Hands elevated — the regression that builds the full push-up.',
  },
  {
    id: 'pike_push_up',
    name: 'Pike Push-up',
    category: 'push',
    unit: 'reps',
    xpPerUnit: 2,
    statWeights: { strength: 0.55, endurance: 0.2, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 3,
    hint: 'Hips high, crown to the floor. The gateway to handstand pressing.',
  },
  {
    id: 'dip',
    name: 'Dip',
    category: 'push',
    unit: 'reps',
    xpPerUnit: 2.6,
    statWeights: { strength: 0.6, endurance: 0.15, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 3,
    hint: 'Shoulders below elbows, full lockout.',
  },
  {
    id: 'diamond_push_up',
    name: 'Diamond Push-up',
    category: 'push',
    unit: 'reps',
    xpPerUnit: 1.8,
    statWeights: { strength: 0.55, endurance: 0.2, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 5,
    hint: 'Hands together — triceps take the load.',
  },
  {
    id: 'archer_push_up',
    name: 'Archer Push-up',
    category: 'push',
    unit: 'reps',
    xpPerUnit: 3.4,
    statWeights: { strength: 0.65, endurance: 0.12, aesthetics: 0.18, discipline: 0.05 },
    minLevel: 8,
    hint: 'One arm bends, the other extends. Unilateral strength.',
  },
  {
    id: 'handstand_push_up',
    name: 'Handstand Push-up',
    category: 'push',
    unit: 'reps',
    xpPerUnit: 9,
    statWeights: { strength: 0.7, endurance: 0.1, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 16,
    unlockId: 'unlock_handstand',
    hint: 'Vertical pressing. Wall-supported counts.',
  },
  {
    id: 'one_arm_push_up',
    name: 'One-arm Push-up',
    category: 'push',
    unit: 'reps',
    xpPerUnit: 10,
    statWeights: { strength: 0.72, endurance: 0.08, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 18,
    unlockId: 'unlock_one_arm',
    hint: 'Hips square, one hand behind the back.',
  },

  /* --- Pull ------------------------------------------------------------- */
  {
    id: 'australian_row',
    name: 'Australian Row',
    category: 'pull',
    unit: 'reps',
    xpPerUnit: 1.2,
    statWeights: { strength: 0.45, endurance: 0.3, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 1,
    hint: 'Body under a low bar, chest to bar.',
  },
  {
    id: 'chin_up',
    name: 'Chin-up',
    category: 'pull',
    unit: 'reps',
    xpPerUnit: 3.2,
    statWeights: { strength: 0.62, endurance: 0.15, aesthetics: 0.18, discipline: 0.05 },
    minLevel: 2,
    hint: 'Supinated grip, chin over the bar.',
  },
  {
    id: 'pull_up',
    name: 'Pull-up',
    category: 'pull',
    unit: 'reps',
    xpPerUnit: 3.6,
    statWeights: { strength: 0.65, endurance: 0.15, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 2,
    hint: 'Pronated grip, dead hang to chin over bar.',
  },
  {
    id: 'wide_pull_up',
    name: 'Wide Pull-up',
    category: 'pull',
    unit: 'reps',
    xpPerUnit: 4.2,
    statWeights: { strength: 0.66, endurance: 0.12, aesthetics: 0.17, discipline: 0.05 },
    minLevel: 6,
    hint: 'Grip well outside the shoulders. Lats do the work.',
  },
  {
    id: 'archer_pull_up',
    name: 'Archer Pull-up',
    category: 'pull',
    unit: 'reps',
    xpPerUnit: 6.5,
    statWeights: { strength: 0.7, endurance: 0.1, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 10,
    hint: 'Pull to one side, far arm straight.',
  },
  {
    id: 'muscle_up',
    name: 'Muscle-up',
    category: 'pull',
    unit: 'reps',
    xpPerUnit: 12,
    statWeights: { strength: 0.72, endurance: 0.08, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 12,
    unlockId: 'unlock_muscle_up',
    hint: 'Pull, transition, press out. The rite of passage.',
  },

  /* --- Legs ------------------------------------------------------------- */
  {
    id: 'squat',
    name: 'Bodyweight Squat',
    category: 'legs',
    unit: 'reps',
    xpPerUnit: 0.6,
    statWeights: { strength: 0.3, endurance: 0.4, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    hint: 'Hips below parallel, heels down.',
  },
  {
    id: 'lunge',
    name: 'Lunge',
    category: 'legs',
    unit: 'reps',
    xpPerUnit: 0.8,
    statWeights: { strength: 0.35, endurance: 0.35, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    hint: 'Count both legs as separate reps.',
  },
  {
    id: 'pistol_squat',
    name: 'Pistol Squat',
    category: 'legs',
    unit: 'reps',
    xpPerUnit: 5,
    statWeights: { strength: 0.6, endurance: 0.2, aesthetics: 0.15, discipline: 0.05 },
    minLevel: 9,
    hint: 'Full single-leg squat, free leg extended.',
  },

  /* --- Core ------------------------------------------------------------- */
  {
    id: 'plank',
    name: 'Plank',
    category: 'core',
    unit: 'seconds',
    xpPerUnit: 0.25,
    statWeights: { strength: 0.2, endurance: 0.45, aesthetics: 0.2, discipline: 0.15 },
    minLevel: 1,
    hint: 'Forearms down, ribs tucked. Logged in seconds held.',
  },
  {
    id: 'hollow_hold',
    name: 'Hollow Hold',
    category: 'core',
    unit: 'seconds',
    xpPerUnit: 0.4,
    statWeights: { strength: 0.3, endurance: 0.4, aesthetics: 0.2, discipline: 0.1 },
    minLevel: 2,
    hint: 'Lower back pinned to the floor.',
  },
  {
    id: 'leg_raise',
    name: 'Lying Leg Raise',
    category: 'core',
    unit: 'reps',
    xpPerUnit: 1,
    statWeights: { strength: 0.35, endurance: 0.3, aesthetics: 0.3, discipline: 0.05 },
    minLevel: 1,
    hint: 'Legs straight, no lumbar arch.',
  },
  {
    id: 'hanging_knee_raise',
    name: 'Hanging Knee Raise',
    category: 'core',
    unit: 'reps',
    xpPerUnit: 1.8,
    statWeights: { strength: 0.4, endurance: 0.25, aesthetics: 0.3, discipline: 0.05 },
    minLevel: 3,
    hint: 'Dead hang, knees to chest, no swing.',
  },
  {
    id: 'toes_to_bar',
    name: 'Toes to Bar',
    category: 'core',
    unit: 'reps',
    xpPerUnit: 3,
    statWeights: { strength: 0.45, endurance: 0.2, aesthetics: 0.3, discipline: 0.05 },
    minLevel: 7,
    hint: 'Straight legs all the way to the bar.',
  },
  {
    id: 'l_sit',
    name: 'L-Sit',
    category: 'core',
    unit: 'seconds',
    xpPerUnit: 1.6,
    statWeights: { strength: 0.5, endurance: 0.25, aesthetics: 0.2, discipline: 0.05 },
    minLevel: 8,
    hint: 'Legs locked and parallel to the ground.',
  },

  /* --- Skill ------------------------------------------------------------ */
  {
    id: 'planche_lean',
    name: 'Planche Lean',
    category: 'skill',
    unit: 'seconds',
    xpPerUnit: 2.2,
    statWeights: { strength: 0.65, endurance: 0.15, aesthetics: 0.13, discipline: 0.07 },
    minLevel: 14,
    unlockId: 'unlock_planche',
    hint: 'Shoulders far past the wrists, scapula protracted.',
  },
  {
    id: 'front_lever',
    name: 'Front Lever',
    category: 'skill',
    unit: 'seconds',
    xpPerUnit: 5,
    statWeights: { strength: 0.7, endurance: 0.1, aesthetics: 0.13, discipline: 0.07 },
    minLevel: 15,
    unlockId: 'unlock_front_lever',
    hint: 'Body horizontal under the bar, arms straight.',
  },
  {
    id: 'full_planche',
    name: 'Full Planche',
    category: 'skill',
    unit: 'seconds',
    xpPerUnit: 9,
    statWeights: { strength: 0.75, endurance: 0.08, aesthetics: 0.1, discipline: 0.07 },
    minLevel: 20,
    unlockId: 'unlock_planche',
    hint: 'Straight body parallel to the ground, feet off.',
  },
  {
    id: 'human_flag',
    name: 'Human Flag',
    category: 'skill',
    unit: 'seconds',
    xpPerUnit: 8,
    statWeights: { strength: 0.72, endurance: 0.1, aesthetics: 0.12, discipline: 0.06 },
    minLevel: 20,
    unlockId: 'unlock_human_flag',
    hint: 'Side-on to a vertical bar, body horizontal.',
  },

  /* --- Conditioning ----------------------------------------------------- */
  {
    id: 'burpee',
    name: 'Burpee',
    category: 'conditioning',
    unit: 'reps',
    xpPerUnit: 1.4,
    statWeights: { strength: 0.2, endurance: 0.5, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    hint: 'Chest to floor, jump at the top.',
  },
  {
    id: 'mountain_climber',
    name: 'Mountain Climber',
    category: 'conditioning',
    unit: 'reps',
    xpPerUnit: 0.4,
    statWeights: { strength: 0.15, endurance: 0.55, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    hint: 'Count each knee drive.',
  },
  {
    id: 'jump_rope',
    name: 'Jump Rope',
    category: 'conditioning',
    unit: 'seconds',
    xpPerUnit: 0.2,
    statWeights: { strength: 0.1, endurance: 0.6, aesthetics: 0.25, discipline: 0.05 },
    minLevel: 1,
    hint: 'Logged in seconds of continuous skipping.',
  },
];

export const CATEGORY_META: Record<
  ExerciseCategory,
  { label: string; color: string; ring: string }
> = {
  push: { label: 'Push', color: 'text-ember-300', ring: 'ring-ember-500/30 bg-ember-500/10' },
  pull: { label: 'Pull', color: 'text-forge-300', ring: 'ring-forge-500/30 bg-forge-500/10' },
  legs: { label: 'Legs', color: 'text-vital-300', ring: 'ring-vital-500/30 bg-vital-500/10' },
  core: { label: 'Core', color: 'text-arcane-300', ring: 'ring-arcane-500/30 bg-arcane-500/10' },
  skill: { label: 'Skill', color: 'text-rose-300', ring: 'ring-rose-500/30 bg-rose-500/10' },
  conditioning: {
    label: 'Conditioning',
    color: 'text-teal-300',
    ring: 'ring-teal-500/30 bg-teal-500/10',
  },
};

/* -------------------------------------------------------------------------- */
/* Lookup + unlock gating                                                      */
/* -------------------------------------------------------------------------- */

/** Turn a stored custom exercise into a full Exercise the engine can score. */
export function customToExercise(custom: CustomExercise): Exercise {
  return {
    id: str(custom.id, 'custom'),
    name: str(custom.name, 'Custom Exercise'),
    category: custom.category ?? 'conditioning',
    unit: custom.unit === 'seconds' ? 'seconds' : 'reps',
    // Clamped so a hand-authored value can never mint unbounded XP.
    xpPerUnit: Math.min(Math.max(num(custom.xpPerUnit, 1), 0.1), 8),
    statWeights: { strength: 0.3, endurance: 0.3, aesthetics: 0.25, discipline: 0.15 },
    minLevel: 1,
    custom: true,
  };
}

/** The catalog plus this user's own movements. */
export function allExercisesFor(profile: Profile | null): Exercise[] {
  const custom = arr<CustomExercise>(profile?.customExercises).map(customToExercise);
  return [...EXERCISES, ...custom];
}

export function findExercise(profile: Profile | null, id: string): Exercise | undefined {
  return allExercisesFor(profile).find((e) => e.id === id);
}

/**
 * Is this movement available to the user?
 *
 * A movement opens either by reaching its `minLevel` or by buying its unlock in
 * the shop. Custom movements are always available to their author.
 */
export function isUnlocked(exercise: Exercise, profile: Profile | null): boolean {
  if (exercise.custom) return true;
  const level = num(profile?.level, 1);
  if (level >= exercise.minLevel) return true;
  if (!exercise.unlockId) return false;
  return arr<string>(profile?.inventory?.unlocks).includes(exercise.unlockId);
}

/** Short human explanation of why a movement is still locked. */
export function lockReason(exercise: Exercise, profile: Profile | null): string | null {
  if (isUnlocked(exercise, profile)) return null;
  return exercise.unlockId
    ? `Reach level ${exercise.minLevel} — or unlock it in the Shop`
    : `Reach level ${exercise.minLevel}`;
}

export function unlockedExercises(profile: Profile | null): Exercise[] {
  return allExercisesFor(profile).filter((e) => isUnlocked(e, profile));
}

export function lockedExercises(profile: Profile | null): Exercise[] {
  return allExercisesFor(profile).filter((e) => !isUnlocked(e, profile));
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

export interface PresetItem {
  exerciseId: string;
  sets: number;
  amount: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  /** Recommended level — presets above it are shown but flagged. */
  recommendedLevel: number;
  focus: ExerciseCategory;
  items: PresetItem[];
}

export const PRESETS: Preset[] = [
  {
    id: 'beginner_push',
    name: 'Beginner Push',
    description: 'The first pressing block. Builds the straight-arm and elbow strength everything else stands on.',
    recommendedLevel: 1,
    focus: 'push',
    items: [
      { exerciseId: 'push_up', sets: 3, amount: 10 },
      { exerciseId: 'incline_push_up', sets: 2, amount: 12 },
      { exerciseId: 'plank', sets: 3, amount: 30 },
    ],
  },
  {
    id: 'beginner_pull',
    name: 'Beginner Pull',
    description: 'Rows and hangs to build the back and grip that a first pull-up demands.',
    recommendedLevel: 1,
    focus: 'pull',
    items: [
      { exerciseId: 'australian_row', sets: 3, amount: 10 },
      { exerciseId: 'leg_raise', sets: 3, amount: 12 },
      { exerciseId: 'squat', sets: 3, amount: 15 },
    ],
  },
  {
    id: 'foundation_full',
    name: 'Full Body Foundation',
    description: 'A balanced push/pull/legs circuit. The single best default when you are unsure what to train.',
    recommendedLevel: 2,
    focus: 'conditioning',
    items: [
      { exerciseId: 'push_up', sets: 4, amount: 12 },
      { exerciseId: 'australian_row', sets: 4, amount: 10 },
      { exerciseId: 'squat', sets: 4, amount: 20 },
      { exerciseId: 'plank', sets: 3, amount: 45 },
    ],
  },
  {
    id: 'intermediate_pull',
    name: 'Intermediate Pull',
    description: 'Volume on the bar. Where chin-ups turn into clean, controlled pull-ups.',
    recommendedLevel: 4,
    focus: 'pull',
    items: [
      { exerciseId: 'pull_up', sets: 4, amount: 6 },
      { exerciseId: 'chin_up', sets: 3, amount: 8 },
      { exerciseId: 'hanging_knee_raise', sets: 3, amount: 10 },
    ],
  },
  {
    id: 'advanced_core',
    name: 'Advanced Core',
    description: 'Compression and straight-arm strength — the prerequisites for L-sits and levers.',
    recommendedLevel: 8,
    focus: 'core',
    items: [
      { exerciseId: 'l_sit', sets: 4, amount: 15 },
      { exerciseId: 'toes_to_bar', sets: 3, amount: 8 },
      { exerciseId: 'hollow_hold', sets: 3, amount: 45 },
    ],
  },
  {
    id: 'advanced_push',
    name: 'Advanced Push',
    description: 'Heavy pressing with a vertical bias. Builds toward the handstand push-up.',
    recommendedLevel: 10,
    focus: 'push',
    items: [
      { exerciseId: 'dip', sets: 4, amount: 10 },
      { exerciseId: 'archer_push_up', sets: 3, amount: 8 },
      { exerciseId: 'pike_push_up', sets: 3, amount: 12 },
    ],
  },
  {
    id: 'skill_session',
    name: 'Skill Session',
    description: 'Low volume, maximum intent. Static holds trained fresh, never to failure.',
    recommendedLevel: 15,
    focus: 'skill',
    items: [
      { exerciseId: 'planche_lean', sets: 5, amount: 15 },
      { exerciseId: 'front_lever', sets: 5, amount: 8 },
      { exerciseId: 'l_sit', sets: 3, amount: 20 },
    ],
  },
];
