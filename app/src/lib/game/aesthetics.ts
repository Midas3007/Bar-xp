import type { Profile } from '../types';
import { clamp, int, num, round } from '../safe';
import { normalizeMuscleVolume, type MuscleKey } from './muscles';

/**
 * Physique analysis — the "looksmaxxing" layer.
 *
 * Every rating is derived from data the user has already logged: per-muscle
 * volume, body fat readings, and personal bests. Nothing here asks for photos
 * or judges anything it cannot measure.
 *
 * Deliberate choices:
 *  - Scores are *training-derived*, so the advice is always "train this" or
 *    "recover better" — never a verdict on the person.
 *  - Body-fat guidance stops at healthy ranges. Lower is not treated as
 *    infinitely better, and the copy says so.
 *  - Nothing is a health claim. The disclaimer is rendered with the section.
 */

export type AestheticGrade = 'unknown' | 'weak' | 'building' | 'good' | 'elite';

export const GRADE_META: Record<
  AestheticGrade,
  { label: string; color: string; bar: string }
> = {
  unknown: { label: 'No data', color: 'text-slate-500', bar: 'from-slate-600 to-slate-500' },
  weak: { label: 'Lagging', color: 'text-rose-300', bar: 'from-rose-600 to-rose-400' },
  building: { label: 'Building', color: 'text-amber-300', bar: 'from-amber-600 to-amber-400' },
  good: { label: 'Good', color: 'text-forge-300', bar: 'from-forge-500 to-forge-300' },
  elite: { label: 'Standout', color: 'text-vital-300', bar: 'from-vital-500 to-vital-300' },
};

export interface AestheticTrait {
  id: string;
  label: string;
  /** What this trait actually is, in one line. */
  what: string;
  /** 0–100. */
  score: number;
  grade: AestheticGrade;
  /** The single most useful next action. */
  tip: string;
}

function gradeFor(score: number, known: boolean): AestheticGrade {
  if (!known) return 'unknown';
  if (score < 25) return 'weak';
  if (score < 50) return 'building';
  if (score < 78) return 'good';
  return 'elite';
}

/** Volume total across a set of muscles. */
function vol(volume: Record<string, number>, keys: MuscleKey[]): number {
  return keys.reduce((acc, k) => acc + num(volume[k], 0), 0);
}

/**
 * Diminishing-returns curve mapping raw volume to a 0–100 score.
 * `mid` is the volume that scores 50.
 */
function curve(value: number, mid: number): number {
  const v = Math.max(0, value);
  if (mid <= 0) return 0;
  return clamp((v / (v + mid)) * 100 * 2, 0, 100);
}

/**
 * Score the physique traits that calisthenics actually moves.
 */
export function rateAesthetics(profile: Profile): AestheticTrait[] {
  const volume = normalizeMuscleVolume(profile.muscleVolume) as Record<string, number>;
  const bodyFat = num(profile.bodyFat, 0);
  const hasBodyFat = bodyFat > 0;
  const trained = vol(volume, [
    'chest', 'shoulders', 'triceps', 'biceps', 'lats', 'upper_back',
    'abs', 'obliques', 'quads', 'glutes',
  ]);
  const hasVolume = trained > 0;

  /* --- Leanness ------------------------------------------------------- */
  // Peaks in the healthy lean range and deliberately does NOT keep rewarding
  // lower numbers — sub-8% is not a target to chase year-round.
  let leanScore = 0;
  if (hasBodyFat) {
    if (bodyFat <= 8) leanScore = 88;
    else if (bodyFat <= 12) leanScore = 100;
    else if (bodyFat <= 15) leanScore = 82;
    else if (bodyFat <= 18) leanScore = 64;
    else if (bodyFat <= 22) leanScore = 44;
    else if (bodyFat <= 27) leanScore = 26;
    else leanScore = 12;
  }

  /* --- V-taper: lats vs waist ----------------------------------------- */
  const latVolume = vol(volume, ['lats', 'upper_back']);
  const vTaper = curve(latVolume, 900);

  /* --- Shoulder width ------------------------------------------------- */
  const shoulderVolume = vol(volume, ['shoulders']);
  const shoulders = curve(shoulderVolume, 420);

  /* --- Arms ----------------------------------------------------------- */
  const armVolume = vol(volume, ['biceps', 'triceps']);
  const arms = curve(armVolume, 900);

  /* --- Chest ---------------------------------------------------------- */
  const chestVolume = vol(volume, ['chest']);
  const chest = curve(chestVolume, 800);

  /* --- Midsection: abs work gated by body fat ------------------------- */
  const absVolume = vol(volume, ['abs', 'obliques']);
  const absTrained = curve(absVolume, 700);
  // Visible abs are mostly a body-fat story; training only sets the ceiling.
  const midsection = hasBodyFat ? round(absTrained * 0.4 + leanScore * 0.6, 1) : absTrained;

  /* --- Posture: back vs chest ---------------------------------------- */
  const pushVolume = vol(volume, ['chest', 'shoulders', 'triceps']);
  const pullVolume = vol(volume, ['lats', 'upper_back', 'biceps']);
  const postureRatio = pushVolume > 0 ? pullVolume / pushVolume : pullVolume > 0 ? 2 : 0;
  // 1:1 or better pulling is the target.
  const posture = hasVolume ? clamp(postureRatio * 78, 0, 100) : 0;

  /* --- Legs ----------------------------------------------------------- */
  const legVolume = vol(volume, ['quads', 'glutes', 'hamstrings', 'calves']);
  const legs = curve(legVolume, 1100);

  const traits: AestheticTrait[] = [
    {
      id: 'leanness',
      label: 'Leanness',
      what: 'Body-fat level. The single biggest lever on how defined you look.',
      score: round(leanScore, 1),
      grade: gradeFor(leanScore, hasBodyFat),
      tip: !hasBodyFat
        ? 'Record a body-fat estimate on your profile to unlock this rating.'
        : bodyFat > 20
          ? 'A slow deficit — roughly 300–500 kcal under maintenance — plus your current training will reveal definition you already have.'
          : bodyFat > 15
            ? 'You are close. Hold this training volume, keep protein high, and let a small deficit do the rest.'
            : bodyFat < 8
              ? 'You are very lean already. Going lower costs strength, sleep and mood — hold here and build muscle instead.'
              : 'This is the range where muscle definition shows clearly. Focus on adding mass, not cutting further.',
    },
    {
      id: 'vtaper',
      label: 'V-Taper',
      what: 'Lat and upper-back width against your waist. What creates the V shape.',
      score: round(vTaper, 1),
      grade: gradeFor(vTaper, hasVolume),
      tip:
        vTaper < 45
          ? 'Wide-grip pull-ups are the highest-leverage movement you can do for this. Three sets, three times a week.'
          : 'Keep pulling. Add weight or move toward archer pull-ups to keep the stimulus climbing.',
    },
    {
      id: 'shoulders',
      label: 'Shoulders',
      what: 'Deltoid development. Shoulder width frames the whole upper body.',
      score: round(shoulders, 1),
      grade: gradeFor(shoulders, hasVolume),
      tip:
        shoulders < 45
          ? 'Pike push-ups, then wall handstand holds. Shoulders tolerate frequent work — hit them 3× a week.'
          : 'Progress toward handstand push-ups for continued overload.',
    },
    {
      id: 'chest',
      label: 'Chest',
      what: 'Pectoral mass and fullness.',
      score: round(chest, 1),
      grade: gradeFor(chest, hasVolume),
      tip:
        chest < 45
          ? 'Dips build the chest faster than push-ups. Lean the torso forward to bias the pecs.'
          : 'Add archer push-ups or weighted dips to keep progressing.',
    },
    {
      id: 'arms',
      label: 'Arms',
      what: 'Biceps and triceps volume.',
      score: round(arms, 1),
      grade: gradeFor(arms, hasVolume),
      tip:
        arms < 45
          ? 'Chin-ups for biceps, diamond push-ups and dips for triceps. Triceps are two thirds of arm size.'
          : 'Arms are tracking well. Slow the lowering phase to keep adding stimulus.',
    },
    {
      id: 'midsection',
      label: 'Midsection',
      what: 'Ab development combined with how lean you are.',
      score: round(midsection, 1),
      grade: gradeFor(midsection, hasVolume || hasBodyFat),
      tip:
        !hasBodyFat
          ? 'Log a body-fat estimate — abs are far more about leanness than about ab training.'
          : bodyFat > 18
            ? 'You likely have more ab development than shows. Leanness is the limiter here, not more crunches.'
            : 'Hanging knee raises and hollow holds. Train abs like any other muscle — with progression.',
    },
    {
      id: 'posture',
      label: 'Posture',
      what: 'Pulling volume against pushing volume. Drives how you carry yourself.',
      score: round(posture, 1),
      grade: gradeFor(posture, hasVolume),
      tip:
        posture < 60
          ? 'You push more than you pull. Rows and face-pull style work fix rounded shoulders — and standing upright changes your silhouette more than any single muscle.'
          : 'Good pull-to-push balance. This is what keeps shoulders back and chest open.',
    },
    {
      id: 'legs',
      label: 'Legs',
      what: 'Quad, glute and hamstring development.',
      score: round(legs, 1),
      grade: gradeFor(legs, hasVolume),
      tip:
        legs < 40
          ? 'Skipped legs are the most common calisthenics gap. Squats and lunges cost nothing and balance your proportions.'
          : 'Legs are keeping up. Progress toward pistol squats.',
    },
  ];

  return traits;
}

/** Overall physique score — the average of every trait with real data. */
export function overallAestheticScore(traits: AestheticTrait[]): number {
  const known = traits.filter((t) => t.grade !== 'unknown');
  if (known.length === 0) return 0;
  return round(known.reduce((acc, t) => acc + t.score, 0) / known.length, 1);
}

/** The traits most worth attacking next, weakest first. */
export function priorityTraits(traits: AestheticTrait[], count = 3): AestheticTrait[] {
  return traits
    .filter((t) => t.grade !== 'unknown')
    .sort((a, b) => a.score - b.score)
    .slice(0, Math.max(0, count));
}

/* -------------------------------------------------------------------------- */
/* Non-training levers                                                         */
/* -------------------------------------------------------------------------- */

export interface Lever {
  title: string;
  detail: string;
}

/**
 * The things that change how you look which are not sets and reps.
 *
 * Kept short, evidence-led and health-first. Nothing cosmetic-surgical,
 * nothing extreme, nothing that requires buying anything.
 */
export const LEVERS: Lever[] = [
  {
    title: 'Sleep 7–9 hours',
    detail:
      'The highest-leverage item on this list. Short sleep raises cortisol, blunts recovery, and visibly affects the face. Nothing else here matters as much.',
  },
  {
    title: 'Protein: ~1.6g per kg bodyweight',
    detail:
      'Enough protein is what turns training into muscle rather than just fatigue. Spread it across the day.',
  },
  {
    title: 'Train your neck and upper back',
    detail:
      'A stronger neck and upper back change your silhouette and how your head sits over your shoulders — disproportionate visual return for the effort.',
  },
  {
    title: 'Fix your default posture',
    detail:
      'Most people look meaningfully different standing tall with the shoulders back. Rows build the strength; then it becomes a habit you can hold.',
  },
  {
    title: 'Sunlight and hydration',
    detail:
      'Daily daylight helps sleep timing, and being properly hydrated affects skin and how full your muscles look. Both are free.',
  },
  {
    title: 'Be patient with the timeline',
    detail:
      'Visible physique change runs on 3–6 month cycles, not weeks. Consistency beats intensity, which is exactly what the streak system rewards.',
  },
];

/** Are there enough logged sessions for the analysis to mean anything? */
export function hasEnoughData(profile: Profile): boolean {
  return int(profile.workoutCount, 0) >= 3;
}
