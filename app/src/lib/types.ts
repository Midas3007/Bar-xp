import type { SeasonRecord, SeasonState } from './game/season';
import type { ChallengeMetric, ChallengeStatus, ChallengeWindow } from './game/challenges';

/** Shared domain types for the Bar XP RPG layer. */

export type StatKey = 'strength' | 'endurance' | 'aesthetics' | 'discipline';

export type Stats = Record<StatKey, number>;

export type ExerciseUnit = 'reps' | 'seconds';

export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'skill' | 'conditioning';

/**
 * How hard a movement is to access.
 *  - foundation:   available to everyone from day one
 *  - intermediate: a modest level gate, reached within a few weeks
 *  - elite:        true skill work, gated by level or a shop unlock
 */
export type ExerciseGrade = 'foundation' | 'intermediate' | 'elite';

/** Identifies which schematic figure to draw for a movement. */
export type DiagramKey =
  | 'pushup'
  | 'diamond'
  | 'archer_push'
  | 'onearm_push'
  | 'incline'
  | 'pike'
  | 'dip'
  | 'handstand'
  | 'row'
  | 'chinup'
  | 'pullup'
  | 'wide_pullup'
  | 'archer_pullup'
  | 'muscleup'
  | 'squat'
  | 'lunge'
  | 'pistol'
  | 'plank'
  | 'mountain'
  | 'hollow'
  | 'legraise'
  | 'kneeraise'
  | 'toestobar'
  | 'lsit'
  | 'lever'
  | 'planche_lean'
  | 'planche'
  | 'flag'
  | 'burpee'
  | 'jump';

/** A route from where you are now to a movement you cannot do yet. */
export interface Progression {
  /** One line on what the movement actually demands. */
  intro: string;
  /** Ordered drills to work through. */
  steps: Array<{
    title: string;
    detail: string;
    /** Catalog id to train, when the step maps to a loggable movement. */
    exerciseId?: string;
  }>;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  grade: ExerciseGrade;
  unit: ExerciseUnit;
  /** XP granted per rep (or per second for holds), before multipliers. */
  xpPerUnit: number;
  /** How this movement distributes stat growth. Weights should sum to ~1. */
  statWeights: Partial<Stats>;
  /** Level the user must reach before this appears in the logger. */
  minLevel: number;
  /** Shop unlock id that bypasses `minLevel`. */
  unlockId?: string;
  /** One-line description shown next to the picker. */
  hint?: string;
  /** Which schematic figure to draw. */
  diagram: DiagramKey;
  /** Technique points, most important first. */
  formCues: string[];
  /** Frequent errors worth naming explicitly. */
  mistakes: string[];
  /** How to train toward it. Present on everything that is gated. */
  progression?: Progression;
  /** True for user-authored movements stored on the profile. */
  custom?: boolean;
}

export interface CustomExercise {
  id: string;
  name: string;
  unit: ExerciseUnit;
  xpPerUnit: number;
  category: ExerciseCategory;
}

export interface RoutineItem {
  exerciseId: string;
  /** Target reps (or seconds) per set, in order. Set count is `reps.length`. */
  reps: number[];
}

export interface Routine {
  id: string;
  name: string;
  items: RoutineItem[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkoutEntry {
  exerciseId: string;
  exerciseName: string;
  unit: ExerciseUnit;
  /** Number of sets performed. With `reps` present this is `reps.length`. */
  sets: number;
  /**
   * The *hardest* set: reps, or seconds for a hold. For a uniform entry this is
   * simply the per-set figure; with `reps` present it is `Math.max(...reps)`,
   * which is what a personal best measures.
   */
  amount: number;
  /** Total units: `sum(reps)` when a ladder is stored, otherwise `sets * amount`. */
  volume: number;
  /**
   * Per-set reps (or seconds) in the order performed — `[12, 10, 8]`.
   *
   * Absent on every entry written before this field existed, and deliberately
   * absent on uniform entries, so the common case produces byte-identical
   * documents to the ones already in Firestore. `volume` stays authoritative;
   * for a varied ladder it is deliberately *less* than `sets * amount`.
   */
  reps?: number[];
  xp: number;
}

export interface Workout {
  id: string;
  uid: string;
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  createdAt: number;
  entries: WorkoutEntry[];
  xpEarned: number;
  coinsEarned: number;
  totalVolume: number;
  totalReps: number;
  presetId?: string | null;
  /**
   * `session` for a logged workout, `correction` for the audit record that
   * retracts one. Absent on every document written before corrections existed,
   * which reads as `session`.
   */
  kind?: 'session' | 'correction';
  /** The workout a correction retracts. Only ever set on a correction. */
  correctsId?: string | null;
}

export interface StatsSnapshot {
  id: string;
  uid: string;
  createdAt: number;
  day: string;
  stats: Stats;
  level: number;
  totalXp: number;
  tier: string;
  bodyFat: number;
  totalReps: number;
  streak: number;
  /**
   * `assessment` for the onboarding baseline and body-fat edits, `workout` for
   * post-session snapshots, `measurement` for a body-measurement recording,
   * `correction` for the dip left by a voided session.
   */
  source: 'assessment' | 'workout' | 'measurement' | 'correction';
  /** Only the sites entered in this sitting. Absent on documents written before slice 4. */
  measurements: MeasurementValues | null;
}

export interface PersonalBest {
  exerciseId: string;
  exerciseName: string;
  unit: ExerciseUnit;
  /** Best single-set amount recorded. */
  value: number;
  achievedAt: number;
}

export type GoalType = 'workouts' | 'reps' | 'xp' | 'streak' | 'category';

export interface Goal {
  id: string;
  /** Stable identifier of the template this goal was rolled from. */
  templateId: string;
  title: string;
  description: string;
  type: GoalType;
  /** Only set for `category` goals. */
  category?: ExerciseCategory;
  target: number;
  progress: number;
  rewardXp: number;
  rewardCoins: number;
  createdAt: number;
  completedAt?: number | null;
}

export type MeasurementKey =
  | 'bodyweight'
  | 'chest'
  | 'back'
  | 'waist'
  | 'biceps'
  | 'thighs'
  | 'calves';

/** Metric always — bodyweight in kg, every girth in cm. */
export type MeasurementValues = Partial<Record<MeasurementKey, number>>;

export interface Measurements {
  values: MeasurementValues;
  recordedAt: number;
}

/** Display preference only. Nothing is ever stored in imperial. */
export type UnitSystem = 'metric' | 'imperial';

export interface Assessment {
  maxPullUps: number;
  maxPushUps: number;
  plankSeconds: number;
  bodyFat: number;
  completedAt: number;
}

export interface Inventory {
  /** Consumable — bridges one missed day each. */
  streakShields: number;
  /** Owned cosmetic ids. */
  cosmetics: string[];
  /** Owned exercise-unlock ids. */
  unlocks: string[];
}

export interface Streak {
  /**
   * Consecutive weeks in which the weekly training target was met.
   *
   * This counted consecutive *days* before the weekly model; documents written
   * under the old scheme are converted on read by `migrateLegacyStreak`.
   */
  current: number;
  best: number;
  /** Local calendar day of the last logged workout, `YYYY-MM-DD`. */
  lastWorkoutDay: string | null;
  /** How many shields have been auto-consumed over the account's lifetime. */
  shieldsUsed: number;
  /** Monday of the week `daysThisWeek` refers to, `YYYY-MM-DD`. */
  weekKey: string | null;
  /**
   * Distinct days trained inside the current week.
   *
   * No longer gates the counter — it feeds the weekly safety net that decides
   * whether a gap breaks the run.
   */
  daysThisWeek: number;
  /**
   * Which scheme `current` was written under.
   *
   * Absent means the weekly model, where `current` counted weeks. Documents are
   * converted on read exactly once, and every write since carries the marker.
   */
  model?: 'daily';
}

export interface Profile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: number;
  updatedAt: number;

  onboarded: boolean;
  assessment: Assessment | null;

  level: number;
  /** Gross lifetime XP exactly as stored. Append-only; never decreases. */
  grossXp: number;
  /** Lifetime XP retracted by session corrections. Append-only; never decreases. */
  xpVoided: number;
  /**
   * `grossXp - xpVoided`. The figure the whole game uses — level, tier, charts
   * and the leaderboard row. Every document written before corrections existed
   * has `xpVoided` absent, which reads as 0, so this equals the stored value
   * for every account today.
   */
  totalXp: number;
  coins: number;

  stats: Stats;
  /** Derived from `stats` — always consistent with the rank bar. */
  tier: string;
  /** Derived from `streak.current`. */
  identity: string;
  /**
   * The tier/identity as they are currently persisted. These exist only so the
   * background recalculation can detect drift from the derived values above and
   * write a correction; nothing in the UI should read them.
   */
  storedTier: string;
  storedIdentity: string;
  bodyFat: number;
  /** Latest known value per site, merged across recordings. Null until one exists. */
  measurements: Measurements | null;
  /** Display preference for measurement entry and charts. Defaults to metric. */
  unitSystem: UnitSystem;
  /** Chud / Normie / Chad / GIGACHAD labels in the Physique Lab. On by default. */
  gymBroMode: boolean;

  streak: Streak;
  inventory: Inventory;
  /** Cosmetic id currently applied to the display name, or null. */
  activeCosmetic: string | null;

  personalBests: Record<string, PersonalBest>;
  customExercises: CustomExercise[];
  /** User-authored training days. The editable counterpart to `PRESETS`. */
  routines: Routine[];
  goals: Goal[];

  workoutCount: number;
  totalReps: number;
  /** Lifetime work per muscle group, accumulated on every logged session. */
  muscleVolume: Record<string, number>;

  /** Current competitive season counters. Resets quarterly; nothing above it does. */
  season: SeasonState;
  /** Permanent record of finished seasons, newest first. Capped at 24 entries. */
  seasonHistory: SeasonRecord[];
  /** Distinct training days, newest first, capped at 14. Drives the activity strip. */
  recentDays: string[];
}

export interface LeaderboardRow {
  uid: string;
  displayName: string;
  photoURL: string;
  level: number;
  totalXp: number;
  tier: string;
  streak: number;
  activeCosmetic: string | null;
  cosmetics: string[];
  /** Season fields, so one row type serves the global, friends and season ladders. */
  seasonId: string;
  seasonXp: number;
}

/* -------------------------------------------------------------------------- */
/* Social                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A pending friend request.
 *
 * Deliberately has no `status` field: its existence *is* "pending". Accepting
 * creates the friendship and deletes the request; declining or cancelling
 * deletes it. State you do not store is state nobody can forge.
 */
export interface FriendRequest {
  /** `${from}__${to}` */
  id: string;
  from: string;
  to: string;
  createdAt: number;
}

export interface Friendship {
  /** The two uids sorted ascending and joined with `__`. */
  id: string;
  members: string[];
  createdAt: number;
}

export interface Challenge {
  id: string;
  createdBy: string;
  members: string[];
  templateId: string;
  title: string;
  metric: ChallengeMetric;
  window: ChallengeWindow;
  exerciseId: string | null;
  startDay: string;
  endDay: string;
  endsAt: number;
  status: ChallengeStatus;
  createdAt: number;
  respondedAt: number | null;
}

export interface ChallengeScore {
  uid: string;
  value: number;
  sessions: number;
  updatedAt: number;
}
