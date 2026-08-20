import type { StatKey, Stats } from '../types';
import { clamp, int, num, pct } from '../safe';

/* -------------------------------------------------------------------------- */
/* Levels & XP                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Level curve coefficients.
 *
 * The original curve (100 * l^1.32 + 20 * l) put level 100 at 1,958,698 lifetime
 * XP — roughly 2,800 sessions, or thirteen years of training four days a week.
 * A ceiling nobody can reach is not a goal, it is decoration.
 *
 * These values keep the original *shape* (the 1.32 exponent is unchanged) and
 * rescale it so the ladder is actually walkable:
 *
 *   level  10   ~16 sessions   (about a month)
 *   level  25   ~91 sessions   (about five months)
 *   level  50  ~303 sessions   (about eighteen months)
 *   level 100 ~1050 sessions   (about five years)
 *
 * The new cumulative cost is below the old one at *every* level — the maximum
 * ratio is 0.614 — which is what makes the migration free: no existing account
 * can lose a level when this ships, because every account needs strictly less
 * XP to hold the level it already has. See constants.test.mjs, which asserts
 * that property directly rather than trusting this comment.
 */
export const XP_COEFFICIENT = 62;
export const XP_EXPONENT = 1.32;
export const XP_LINEAR = 10;

export const MAX_LEVEL = 100;

/**
 * XP required to advance *from* `level` to `level + 1`.
 * Gently superlinear: level 1 -> 2 costs 120, level 50 -> 51 costs ~4.4k.
 */
export function xpForLevel(level: number): number {
  const lvl = clamp(level, 1, MAX_LEVEL);
  return Math.floor(XP_COEFFICIENT * Math.pow(lvl, XP_EXPONENT) + XP_LINEAR * lvl);
}

/** Cumulative XP required to *reach* `level` from zero. */
export function totalXpForLevel(level: number): number {
  const target = clamp(level, 1, MAX_LEVEL);
  let total = 0;
  for (let l = 1; l < target; l += 1) total += xpForLevel(l);
  return total;
}

/** Derive the level from lifetime XP. Always returns 1..MAX_LEVEL. */
export function levelFromTotalXp(totalXp: unknown): number {
  let remaining = Math.max(0, num(totalXp, 0));
  let level = 1;
  while (level < MAX_LEVEL) {
    const cost = xpForLevel(level);
    if (remaining < cost) break;
    remaining -= cost;
    level += 1;
  }
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP accumulated inside the current level. */
  xpIntoLevel: number;
  /** XP needed to clear the current level. */
  xpForNext: number;
  /** 0–100, safe for a width style. */
  percent: number;
  isMax: boolean;
}

/** Everything the UI needs to draw an XP bar, with no NaN possible. */
export function levelProgress(totalXp: unknown): LevelProgress {
  const total = Math.max(0, num(totalXp, 0));
  const level = levelFromTotalXp(total);
  const consumed = totalXpForLevel(level);
  const xpIntoLevel = Math.max(0, total - consumed);
  const xpForNext = xpForLevel(level);
  const isMax = level >= MAX_LEVEL;

  return {
    level,
    xpIntoLevel: isMax ? xpForNext : Math.floor(xpIntoLevel),
    xpForNext,
    percent: isMax ? 100 : pct(xpIntoLevel, xpForNext),
    isMax,
  };
}

/* -------------------------------------------------------------------------- */
/* Tiers                                                                       */
/* -------------------------------------------------------------------------- */

export interface Tier {
  name: string;
  /** Minimum average across the four core stats. */
  min: number;
  /** Tailwind gradient used for badges and rank chips. */
  gradient: string;
  text: string;
  ring: string;
  blurb: string;
}

export const TIERS: Tier[] = [
  {
    name: 'Uninitiated',
    min: 0,
    gradient: 'from-prestige-stone-deep to-prestige-stone',
    text: 'text-rank-stone',
    ring: 'ring-rank-stone/40',
    blurb: 'The bar is waiting.',
  },
  {
    name: 'Bronze',
    min: 12,
    gradient: 'from-prestige-bronze-deep to-prestige-bronze',
    text: 'text-rank-bronze',
    ring: 'ring-rank-bronze/40',
    blurb: 'Foundations are forming.',
  },
  {
    name: 'Silver',
    min: 26,
    gradient: 'from-prestige-silver-deep to-prestige-silver',
    text: 'text-rank-silver',
    ring: 'ring-rank-silver/40',
    blurb: 'Real control, real reps.',
  },
  {
    name: 'Gold',
    min: 45,
    gradient: 'from-prestige-gold-deep to-prestige-gold',
    text: 'text-rank-gold',
    ring: 'ring-rank-gold/40',
    blurb: 'Strength others notice.',
  },
  {
    name: 'Platinum',
    min: 68,
    gradient: 'from-prestige-platinum-deep to-prestige-platinum',
    text: 'text-rank-platinum',
    ring: 'ring-rank-platinum/40',
    blurb: 'Advanced work is routine.',
  },
  {
    name: 'Diamond',
    min: 95,
    gradient: 'from-prestige-diamond-deep to-prestige-diamond',
    text: 'text-rank-diamond',
    ring: 'ring-rank-diamond/40',
    blurb: 'Skill work is opening up.',
  },
  {
    name: 'Mythic',
    min: 130,
    gradient: 'from-prestige-mythic-deep to-prestige-mythic',
    text: 'text-rank-mythic',
    ring: 'ring-rank-mythic/40',
    blurb: 'Levers and planches answer to you.',
  },
  {
    name: 'Legend',
    min: 175,
    gradient: 'from-prestige-legend-deep via-prestige-rose to-prestige-mythic',
    text: 'text-rank-legend',
    ring: 'ring-rank-legend/40',
    blurb: 'The bar belongs to you.',
  },
  /* --------------------------------------------------------------------- */
  /* Above Legend.                                                          */
  /*                                                                        */
  /* Stats accumulate without bound, so an athlete training four days a week */
  /* reached the old top rank in about seven months and then climbed forever */
  /* with nothing left to reach — average stat passes 900 inside two years.  */
  /* These three extend the ladder to cover a realistic training lifetime.   */
  /* Every threshold below Legend is untouched on purpose: adding ranks can  */
  /* only ever promote someone, never demote them.                           */
  /* --------------------------------------------------------------------- */
  {
    name: 'Ascendant',
    min: 240,
    gradient: 'from-prestige-aqua-deep via-prestige-aqua to-prestige-white',
    text: 'text-rank-ascendant',
    ring: 'ring-rank-ascendant/40',
    blurb: 'Years of work, visible in every movement.',
  },
  {
    name: 'Immortal',
    min: 330,
    gradient: 'from-prestige-violet-deep via-prestige-violet to-prestige-amber',
    text: 'text-rank-immortal',
    ring: 'ring-rank-immortal/50',
    blurb: 'The progressions ran out before you did.',
  },
  {
    name: 'Apex',
    min: 450,
    gradient: 'from-prestige-amber via-prestige-white to-prestige-amber',
    text: 'text-rank-apex',
    ring: 'ring-rank-apex/50',
    blurb: 'There is no rank above this one. There is still training.',
  },
];

/** Average of the four core stats — the number that drives tier. */
export function statPower(stats: Partial<Stats> | undefined | null): number {
  const s = stats ?? {};
  const total =
    num(s.strength, 0) + num(s.endurance, 0) + num(s.aesthetics, 0) + num(s.discipline, 0);
  return total / 4;
}

export function tierForStats(stats: Partial<Stats> | undefined | null): Tier {
  const power = statPower(stats);
  let match = TIERS[0];
  for (const tier of TIERS) if (power >= tier.min) match = tier;
  return match;
}

export function tierByName(name: unknown): Tier {
  return TIERS.find((t) => t.name === name) ?? TIERS[0];
}

/** The next tier up, or null at Legend. Used for the "progress to next rank" bar. */
export function nextTier(current: Tier): Tier | null {
  const idx = TIERS.findIndex((t) => t.name === current.name);
  return idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

/* -------------------------------------------------------------------------- */
/* Identity (streak labels)                                                    */
/* -------------------------------------------------------------------------- */

export interface Identity {
  label: string;
  min: number;
  text: string;
  bg: string;
  blurb: string;
}

/**
 * Identity ladder, keyed to consecutive *weeks* on target.
 *
 * These were day counts under the daily-chain streak. Read as weeks they map
 * to roughly the same felt commitment: a month on target earns what a week of
 * unbroken daily training used to.
 */
export const IDENTITIES: Identity[] = [
  {
    label: 'Fading',
    min: 0,
    text: 'text-content-muted',
    bg: 'bg-surface-hover ring-line-strong',
    blurb: 'No active streak. One session restarts everything.',
  },
  {
    label: 'Stirring',
    min: 1,
    text: 'text-forge',
    bg: 'bg-forge/10 ring-forge/30',
    blurb: 'The habit is waking up.',
  },
  {
    label: 'Consistent',
    min: 2,
    text: 'text-vital',
    bg: 'bg-vital/10 ring-vital/30',
    blurb: 'Two weeks on target — this is becoming normal.',
  },
  {
    label: 'Disciplined',
    min: 4,
    text: 'text-warn',
    bg: 'bg-warn/10 ring-warn/30',
    blurb: 'A month on target. Discipline is compounding.',
  },
  {
    label: 'Relentless',
    min: 8,
    text: 'text-arcane',
    bg: 'bg-arcane/10 ring-arcane/30',
    blurb: 'Two months unbroken. You do not negotiate with yourself.',
  },
];

export function identityForStreak(streak: unknown): Identity {
  const days = Math.max(0, int(streak, 0));
  let match = IDENTITIES[0];
  for (const identity of IDENTITIES) if (days >= identity.min) match = identity;
  return match;
}

/* -------------------------------------------------------------------------- */
/* Stat presentation                                                           */
/* -------------------------------------------------------------------------- */

export const STAT_KEYS: StatKey[] = ['strength', 'endurance', 'aesthetics', 'discipline'];

export const STAT_META: Record<
  StatKey,
  { label: string; short: string; color: string; hex: string; hexLight: string; blurb: string }
> = {
  strength: {
    label: 'Strength',
    short: 'STR',
    color: 'text-ember',
    hex: '#fb923c',
    hexLight: '#a83408',
    blurb: 'Raw force. Grows from heavy pulls, dips and skill holds.',
  },
  endurance: {
    label: 'Endurance',
    short: 'END',
    color: 'text-forge',
    hex: '#38bdf8',
    hexLight: '#0369a1',
    blurb: 'Work capacity. Grows from high-volume and conditioning work.',
  },
  aesthetics: {
    label: 'Aesthetics',
    short: 'AES',
    color: 'text-vital',
    hex: '#4ade80',
    hexLight: '#12662d',
    blurb: 'Composition and control. Improves as body fat drops and volume rises.',
  },
  discipline: {
    label: 'Discipline',
    short: 'DIS',
    color: 'text-arcane',
    hex: '#c084fc',
    hexLight: '#7326b8',
    blurb: 'Showing up. Driven by streaks and completed sessions.',
  },
};

export const EMPTY_STATS: Stats = {
  strength: 0,
  endurance: 0,
  aesthetics: 0,
  discipline: 0,
};

/** Normalise any stored stat blob into a complete, finite Stats object. */
export function safeStats(value: unknown): Stats {
  const raw = (value ?? {}) as Partial<Stats>;
  return {
    strength: Math.max(0, num(raw.strength, 0)),
    endurance: Math.max(0, num(raw.endurance, 0)),
    aesthetics: Math.max(0, num(raw.aesthetics, 0)),
    discipline: Math.max(0, num(raw.discipline, 0)),
  };
}
