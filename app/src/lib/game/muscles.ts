import type { Exercise, WorkoutEntry } from '../types';
import { clamp, num, round } from '../safe';

/**
 * Muscle-group and equipment metadata.
 *
 * Kept in its own module keyed by exercise id rather than folded into the
 * catalog, so the movement definitions stay readable and this table can grow
 * independently.
 */

export type MuscleKey =
  | 'chest'
  | 'shoulders'
  | 'triceps'
  | 'biceps'
  | 'forearms'
  | 'lats'
  | 'upper_back'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves';

export const MUSCLE_KEYS: MuscleKey[] = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'upper_back',
  'abs',
  'obliques',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
];

export const MUSCLE_META: Record<
  MuscleKey,
  { label: string; short: string; region: 'upper' | 'core' | 'lower'; hex: string }
> = {
  chest: { label: 'Chest', short: 'CHE', region: 'upper', hex: '#fb923c' },
  shoulders: { label: 'Shoulders', short: 'SHO', region: 'upper', hex: '#f59e0b' },
  triceps: { label: 'Triceps', short: 'TRI', region: 'upper', hex: '#fbbf24' },
  biceps: { label: 'Biceps', short: 'BIC', region: 'upper', hex: '#38bdf8' },
  forearms: { label: 'Forearms & Grip', short: 'FOR', region: 'upper', hex: '#0ea5e9' },
  lats: { label: 'Lats', short: 'LAT', region: 'upper', hex: '#22d3ee' },
  upper_back: { label: 'Upper Back', short: 'UBK', region: 'upper', hex: '#2dd4bf' },
  abs: { label: 'Abs', short: 'ABS', region: 'core', hex: '#c084fc' },
  obliques: { label: 'Obliques', short: 'OBL', region: 'core', hex: '#a855f7' },
  lower_back: { label: 'Lower Back', short: 'LBK', region: 'core', hex: '#8b5cf6' },
  glutes: { label: 'Glutes', short: 'GLU', region: 'lower', hex: '#4ade80' },
  quads: { label: 'Quads', short: 'QUA', region: 'lower', hex: '#22c55e' },
  hamstrings: { label: 'Hamstrings', short: 'HAM', region: 'lower', hex: '#16a34a' },
  calves: { label: 'Calves', short: 'CAL', region: 'lower', hex: '#65a30d' },
};

/* -------------------------------------------------------------------------- */
/* Equipment                                                                   */
/* -------------------------------------------------------------------------- */

export type EquipmentKey =
  | 'none'
  | 'pullup_bar'
  | 'dip_bars'
  | 'low_bar'
  | 'elevated'
  | 'vertical_pole'
  | 'wall'
  | 'jump_rope';

export const EQUIPMENT_META: Record<
  EquipmentKey,
  { label: string; short: string; note: string }
> = {
  none: { label: 'Floor only', short: 'Floor', note: 'Nothing but the ground.' },
  pullup_bar: { label: 'Pull-up bar', short: 'Bar', note: 'Any overhead bar you can hang from.' },
  dip_bars: { label: 'Parallel bars', short: 'Dip bars', note: 'Dip station, parallettes, or two sturdy surfaces.' },
  low_bar: { label: 'Low bar', short: 'Low bar', note: 'A waist-height bar, or a table edge.' },
  elevated: { label: 'Raised surface', short: 'Bench', note: 'A bench, chair, step or box.' },
  vertical_pole: { label: 'Vertical pole', short: 'Pole', note: 'An upright post you can grip.' },
  wall: { label: 'Wall', short: 'Wall', note: 'Any clear wall.' },
  jump_rope: { label: 'Jump rope', short: 'Rope', note: 'A skipping rope.' },
};

/**
 * Training-location groups — the practical question is "what can I use right
 * now?", so equipment is bundled into the setups people actually have.
 */
export type SetupKey = 'bodyweight' | 'bar' | 'power_tower' | 'park' | 'all';

export const SETUPS: Array<{
  key: SetupKey;
  label: string;
  description: string;
  equipment: EquipmentKey[] | null;
}> = [
  { key: 'all', label: 'Everything', description: 'The full catalog.', equipment: null },
  {
    key: 'bodyweight',
    label: 'No equipment',
    description: 'Floor and a wall. Works in a hotel room.',
    equipment: ['none', 'wall'],
  },
  {
    key: 'bar',
    label: 'Bar only',
    description: 'A pull-up bar plus floor work.',
    equipment: ['none', 'wall', 'pullup_bar'],
  },
  {
    key: 'power_tower',
    label: 'Power tower',
    description: 'Pull-up bar, dip station and knee-raise pads.',
    equipment: ['none', 'wall', 'pullup_bar', 'dip_bars', 'elevated'],
  },
  {
    key: 'park',
    label: 'Calisthenics park',
    description: 'Bars at every height, plus poles.',
    equipment: ['none', 'wall', 'pullup_bar', 'dip_bars', 'low_bar', 'elevated', 'vertical_pole'],
  },
];

/* -------------------------------------------------------------------------- */
/* Per-exercise mapping                                                        */
/* -------------------------------------------------------------------------- */

interface MuscleProfile {
  equipment: EquipmentKey;
  /** Muscles doing most of the work. */
  primary: MuscleKey[];
  /** Muscles meaningfully assisting. */
  secondary: MuscleKey[];
}

const P: Record<string, MuscleProfile> = {
  /* Push */
  push_up: { equipment: 'none', primary: ['chest', 'triceps'], secondary: ['shoulders', 'abs'] },
  incline_push_up: { equipment: 'elevated', primary: ['chest'], secondary: ['triceps', 'shoulders', 'abs'] },
  pike_push_up: { equipment: 'none', primary: ['shoulders', 'triceps'], secondary: ['upper_back', 'abs'] },
  dip: { equipment: 'dip_bars', primary: ['chest', 'triceps'], secondary: ['shoulders'] },
  diamond_push_up: { equipment: 'none', primary: ['triceps'], secondary: ['chest', 'shoulders', 'abs'] },
  archer_push_up: { equipment: 'none', primary: ['chest', 'triceps'], secondary: ['shoulders', 'abs', 'obliques'] },
  handstand_push_up: { equipment: 'wall', primary: ['shoulders', 'triceps'], secondary: ['upper_back', 'abs'] },
  one_arm_push_up: { equipment: 'none', primary: ['chest', 'triceps'], secondary: ['abs', 'obliques', 'shoulders'] },

  /* Pull */
  australian_row: { equipment: 'low_bar', primary: ['upper_back', 'lats'], secondary: ['biceps', 'forearms'] },
  chin_up: { equipment: 'pullup_bar', primary: ['biceps', 'lats'], secondary: ['upper_back', 'forearms', 'abs'] },
  pull_up: { equipment: 'pullup_bar', primary: ['lats', 'upper_back'], secondary: ['biceps', 'forearms', 'abs'] },
  wide_pull_up: { equipment: 'pullup_bar', primary: ['lats'], secondary: ['upper_back', 'biceps', 'forearms'] },
  archer_pull_up: { equipment: 'pullup_bar', primary: ['lats', 'biceps'], secondary: ['upper_back', 'obliques', 'forearms'] },
  muscle_up: { equipment: 'pullup_bar', primary: ['lats', 'triceps'], secondary: ['upper_back', 'biceps', 'chest', 'abs'] },

  /* Legs */
  squat: { equipment: 'none', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
  lunge: { equipment: 'none', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves'] },
  pistol_squat: { equipment: 'none', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'abs'] },

  /* Core */
  plank: { equipment: 'none', primary: ['abs'], secondary: ['obliques', 'lower_back', 'shoulders'] },
  hollow_hold: { equipment: 'none', primary: ['abs'], secondary: ['obliques', 'quads'] },
  leg_raise: { equipment: 'none', primary: ['abs'], secondary: ['obliques', 'quads'] },
  hanging_knee_raise: { equipment: 'pullup_bar', primary: ['abs'], secondary: ['obliques', 'forearms', 'lats'] },
  toes_to_bar: { equipment: 'pullup_bar', primary: ['abs'], secondary: ['obliques', 'lats', 'forearms', 'hamstrings'] },
  l_sit: { equipment: 'dip_bars', primary: ['abs', 'quads'], secondary: ['triceps', 'shoulders', 'lats'] },

  /* Skill */
  planche_lean: { equipment: 'none', primary: ['shoulders', 'chest'], secondary: ['triceps', 'abs', 'forearms'] },
  front_lever: { equipment: 'pullup_bar', primary: ['lats', 'abs'], secondary: ['upper_back', 'lower_back', 'forearms'] },
  full_planche: { equipment: 'none', primary: ['shoulders', 'chest'], secondary: ['triceps', 'abs', 'lower_back', 'forearms'] },
  human_flag: { equipment: 'vertical_pole', primary: ['obliques', 'shoulders'], secondary: ['lats', 'abs', 'forearms'] },

  /* Conditioning */
  burpee: { equipment: 'none', primary: ['quads', 'chest'], secondary: ['shoulders', 'abs', 'calves', 'glutes'] },
  mountain_climber: { equipment: 'none', primary: ['abs'], secondary: ['obliques', 'shoulders', 'quads'] },
  jump_rope: { equipment: 'jump_rope', primary: ['calves'], secondary: ['quads', 'forearms'] },
};

/** A neutral fallback for custom movements, which have no known mapping. */
const CUSTOM_PROFILE: MuscleProfile = {
  equipment: 'none',
  primary: [],
  secondary: [],
};

export function muscleProfileFor(exerciseId: string): MuscleProfile {
  return P[exerciseId] ?? CUSTOM_PROFILE;
}

export function equipmentFor(exercise: Exercise): EquipmentKey {
  if (exercise.custom) return 'none';
  return muscleProfileFor(exercise.id).equipment;
}

/** Does this movement fit the given setup? */
export function matchesSetup(exercise: Exercise, setup: SetupKey): boolean {
  const entry = SETUPS.find((s) => s.key === setup);
  if (!entry || entry.equipment === null) return true;
  return entry.equipment.includes(equipmentFor(exercise));
}

/** Every muscle a movement trains, primary first. */
export function musclesFor(exerciseId: string): MuscleKey[] {
  const profile = muscleProfileFor(exerciseId);
  return [...profile.primary, ...profile.secondary];
}

/* -------------------------------------------------------------------------- */
/* Volume accounting                                                           */
/* -------------------------------------------------------------------------- */

export type MuscleVolume = Partial<Record<MuscleKey, number>>;

/** Secondary muscles accrue at a third of the rate of primaries. */
const SECONDARY_SHARE = 0.34;

/**
 * Per-muscle volume contributed by one session.
 *
 * Time-based holds are divided down so a 45-second plank does not read as 45
 * reps of work — seconds and reps are not the same currency.
 */
export function sessionMuscleVolume(entries: WorkoutEntry[]): MuscleVolume {
  const out: MuscleVolume = {};

  for (const entry of entries) {
    const raw = Math.max(0, num(entry.volume, 0));
    if (raw <= 0) continue;
    // 4 seconds of a hold ≈ 1 rep of work.
    const work = entry.unit === 'seconds' ? raw / 4 : raw;

    const profile = muscleProfileFor(entry.exerciseId);
    for (const muscle of profile.primary) {
      out[muscle] = round(num(out[muscle], 0) + work, 3);
    }
    for (const muscle of profile.secondary) {
      out[muscle] = round(num(out[muscle], 0) + work * SECONDARY_SHARE, 3);
    }
  }

  return out;
}

/** Merge a session's contribution into the stored lifetime totals. */
export function mergeMuscleVolume(existing: unknown, addition: MuscleVolume): MuscleVolume {
  const base = normalizeMuscleVolume(existing);
  for (const key of MUSCLE_KEYS) {
    const add = num(addition[key], 0);
    if (add > 0) base[key] = round(num(base[key], 0) + add, 3);
  }
  return base;
}

/** Coerce a stored blob into a clean, finite volume map. */
export function normalizeMuscleVolume(value: unknown): MuscleVolume {
  const raw = (value ?? {}) as Record<string, unknown>;
  const out: MuscleVolume = {};
  for (const key of MUSCLE_KEYS) {
    const v = Math.max(0, num(raw[key], 0));
    if (v > 0) out[key] = round(v, 3);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Ratings                                                                     */
/* -------------------------------------------------------------------------- */

export type MuscleGrade = 'untrained' | 'neglected' | 'developing' | 'strong' | 'dominant';

export const MUSCLE_GRADE_META: Record<
  MuscleGrade,
  { label: string; color: string; bar: string }
> = {
  untrained: { label: 'Untrained', color: 'text-slate-500', bar: 'from-slate-600 to-slate-500' },
  neglected: { label: 'Neglected', color: 'text-rose-300', bar: 'from-rose-600 to-rose-400' },
  developing: { label: 'Developing', color: 'text-amber-300', bar: 'from-amber-600 to-amber-400' },
  strong: { label: 'Strong', color: 'text-forge-300', bar: 'from-forge-500 to-forge-300' },
  dominant: { label: 'Dominant', color: 'text-vital-300', bar: 'from-vital-500 to-vital-300' },
};

export interface MuscleRating {
  muscle: MuscleKey;
  volume: number;
  /** 0–100, scaled against the best-trained muscle. */
  score: number;
  grade: MuscleGrade;
  /** Share of total training volume, 0–100. */
  share: number;
}

/**
 * Rate every muscle *relative to the athlete's own best-trained muscle*.
 *
 * Absolute volume targets would be meaningless — a beginner and a five-year
 * veteran need different scales. Relative scoring answers the question that
 * actually matters: which muscles are you neglecting compared to the rest of
 * your own body?
 */
export function rateMuscles(volume: unknown): MuscleRating[] {
  const totals = normalizeMuscleVolume(volume);
  const values = MUSCLE_KEYS.map((k) => num(totals[k], 0));
  const peak = Math.max(...values, 0);
  const sum = values.reduce((a, b) => a + b, 0);

  return MUSCLE_KEYS.map((muscle, i) => {
    const vol = values[i];
    const score = peak > 0 ? clamp((vol / peak) * 100, 0, 100) : 0;

    let grade: MuscleGrade;
    if (peak === 0 || vol === 0) grade = 'untrained';
    else if (score < 20) grade = 'neglected';
    else if (score < 50) grade = 'developing';
    else if (score < 80) grade = 'strong';
    else grade = 'dominant';

    return {
      muscle,
      volume: round(vol, 1),
      score: round(score, 1),
      grade,
      share: sum > 0 ? round((vol / sum) * 100, 1) : 0,
    };
  });
}

/** The muscles most in need of attention, worst first. */
export function weakestMuscles(ratings: MuscleRating[], count = 3): MuscleRating[] {
  // Untrained muscles are the most urgent, then the lowest relative scores.
  return [...ratings]
    .sort((a, b) => a.score - b.score || a.volume - b.volume)
    .slice(0, Math.max(0, count));
}

/* -------------------------------------------------------------------------- */
/* Balance analysis                                                            */
/* -------------------------------------------------------------------------- */

export interface BalanceCheck {
  id: string;
  label: string;
  /** Ratio of the first group to the second. */
  ratio: number;
  /** The healthy range for that ratio. */
  ideal: [number, number];
  status: 'low' | 'good' | 'high';
  message: string;
}

function ratioOf(volume: MuscleVolume, a: MuscleKey[], b: MuscleKey[]): number {
  const sumA = a.reduce((acc, k) => acc + num(volume[k], 0), 0);
  const sumB = b.reduce((acc, k) => acc + num(volume[k], 0), 0);
  if (sumB <= 0) return sumA > 0 ? 99 : 1;
  return sumA / sumB;
}

/**
 * Structural balance checks.
 *
 * These are the imbalances that actually cause problems in calisthenics: too
 * much pressing relative to pulling wrecks shoulders, and skipping legs is the
 * single most common gap.
 */
export function analyseBalance(volume: unknown): BalanceCheck[] {
  const v = normalizeMuscleVolume(volume);
  const checks: BalanceCheck[] = [];

  const pushPull = ratioOf(v, ['chest', 'triceps', 'shoulders'], ['lats', 'upper_back', 'biceps']);
  checks.push({
    id: 'push_pull',
    label: 'Push vs Pull',
    ratio: round(pushPull, 2),
    ideal: [0.7, 1.3],
    status: pushPull < 0.7 ? 'low' : pushPull > 1.3 ? 'high' : 'good',
    message:
      pushPull > 1.3
        ? 'You press far more than you pull. This rounds the shoulders forward and is the most common cause of shoulder pain in calisthenics. Add rows and pull-ups.'
        : pushPull < 0.7
          ? 'You pull much more than you press. Add dips and push-up variations to even out the chest and triceps.'
          : 'Well balanced. This is the ratio that keeps shoulders healthy.',
  });

  const upperLower = ratioOf(
    v,
    ['chest', 'triceps', 'shoulders', 'lats', 'upper_back', 'biceps'],
    ['quads', 'glutes', 'hamstrings', 'calves'],
  );
  checks.push({
    id: 'upper_lower',
    label: 'Upper vs Lower',
    ratio: round(upperLower, 2),
    ideal: [1, 3],
    status: upperLower < 1 ? 'low' : upperLower > 3 ? 'high' : 'good',
    message:
      upperLower > 3
        ? 'Your legs are being skipped. Squats and lunges cost nothing and add far more visible mass than another set of push-ups.'
        : upperLower < 1
          ? 'Heavily leg-dominant. Add upper-body pushing and pulling for a balanced physique.'
          : 'Reasonable split for a calisthenics athlete.',
  });

  const antPost = ratioOf(v, ['chest', 'abs', 'quads'], ['upper_back', 'lats', 'glutes', 'hamstrings', 'lower_back']);
  checks.push({
    id: 'front_back',
    label: 'Front vs Back',
    ratio: round(antPost, 2),
    ideal: [0.6, 1.2],
    status: antPost < 0.6 ? 'low' : antPost > 1.2 ? 'high' : 'good',
    message:
      antPost > 1.2
        ? 'Mirror-muscle bias — you train what you can see. The posterior chain drives posture, which affects how you look far more than another ab set.'
        : antPost < 0.6
          ? 'Strong back bias. A little more direct chest and ab work would even you out.'
          : 'Front and back are tracking together nicely.',
  });

  return checks;
}

/** Concrete suggestions for a muscle that is falling behind. */
export const MUSCLE_FIXES: Record<MuscleKey, string> = {
  chest: 'Add push-ups, diamond push-ups or dips. Slow the lowering to 3 seconds for more stimulus.',
  shoulders: 'Pike push-ups and, later, wall handstand holds. Shoulders respond well to frequent light work.',
  triceps: 'Diamond push-ups and dips. Keep the elbows tucked to the ribs.',
  biceps: 'Chin-ups over pull-ups — the supinated grip loads the biceps far harder.',
  forearms: 'Simply hang from the bar for time. Grip is the limiter in most pulling work.',
  lats: 'Wide pull-ups and rows. Focus on pulling the elbows down toward your ribs.',
  upper_back: 'Australian rows with a pause at the top. This is the fix for rounded posture.',
  abs: 'Hanging knee raises beat crunches. Add hollow holds for straight-arm carryover.',
  obliques: 'Side planks and any single-side work. Human flag progressions load them hardest.',
  lower_back: 'Supermans and reverse hyperextensions. Front lever tuck holds train it isometrically.',
  glutes: 'Lunges and single-leg work. Glutes need range of motion more than reps.',
  quads: 'Squats to full depth, then progress toward pistol squats.',
  hamstrings: 'Nordic curl negatives and single-leg deadlifts. Almost always the weakest link.',
  calves: 'Single-leg calf raises off a step, and jump rope for endurance.',
};
