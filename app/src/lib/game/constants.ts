import type { StatKey, Stats } from '../types';
import { clamp, int, num, pct } from '../safe';

/* -------------------------------------------------------------------------- */
/* Levels & XP                                                                 */
/* -------------------------------------------------------------------------- */

export const MAX_LEVEL = 100;

/**
 * XP required to advance *from* `level` to `level + 1`.
 * Gently superlinear: level 1 -> 2 costs 120, level 50 -> 51 costs ~4.4k.
 */
export function xpForLevel(level: number): number {
  const lvl = clamp(level, 1, MAX_LEVEL);
  return Math.floor(100 * Math.pow(lvl, 1.32) + 20 * lvl);
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
    gradient: 'from-slate-600 to-slate-500',
    text: 'text-slate-300',
    ring: 'ring-slate-500/40',
    blurb: 'The bar is waiting.',
  },
  {
    name: 'Bronze',
    min: 12,
    gradient: 'from-amber-800 to-amber-600',
    text: 'text-amber-300',
    ring: 'ring-amber-600/40',
    blurb: 'Foundations are forming.',
  },
  {
    name: 'Silver',
    min: 26,
    gradient: 'from-slate-400 to-slate-200',
    text: 'text-slate-200',
    ring: 'ring-slate-300/40',
    blurb: 'Real control, real reps.',
  },
  {
    name: 'Gold',
    min: 45,
    gradient: 'from-yellow-600 to-yellow-400',
    text: 'text-yellow-300',
    ring: 'ring-yellow-500/40',
    blurb: 'Strength others notice.',
  },
  {
    name: 'Platinum',
    min: 68,
    gradient: 'from-cyan-500 to-teal-300',
    text: 'text-cyan-300',
    ring: 'ring-cyan-400/40',
    blurb: 'Advanced work is routine.',
  },
  {
    name: 'Diamond',
    min: 95,
    gradient: 'from-sky-500 to-indigo-400',
    text: 'text-sky-300',
    ring: 'ring-sky-400/40',
    blurb: 'Skill work is opening up.',
  },
  {
    name: 'Mythic',
    min: 130,
    gradient: 'from-fuchsia-600 to-purple-400',
    text: 'text-fuchsia-300',
    ring: 'ring-fuchsia-500/40',
    blurb: 'Levers and planches answer to you.',
  },
  {
    name: 'Legend',
    min: 175,
    gradient: 'from-orange-500 via-rose-500 to-fuchsia-500',
    text: 'text-orange-300',
    ring: 'ring-orange-500/40',
    blurb: 'The bar belongs to you.',
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

export const IDENTITIES: Identity[] = [
  {
    label: 'Fading',
    min: 0,
    text: 'text-slate-400',
    bg: 'bg-slate-500/10 ring-slate-500/30',
    blurb: 'No active streak. One session restarts everything.',
  },
  {
    label: 'Stirring',
    min: 1,
    text: 'text-sky-300',
    bg: 'bg-sky-500/10 ring-sky-500/30',
    blurb: 'The habit is waking up.',
  },
  {
    label: 'Consistent',
    min: 3,
    text: 'text-emerald-300',
    bg: 'bg-emerald-500/10 ring-emerald-500/30',
    blurb: 'Three days deep — this is becoming normal.',
  },
  {
    label: 'Disciplined',
    min: 7,
    text: 'text-amber-300',
    bg: 'bg-amber-500/10 ring-amber-500/30',
    blurb: 'A full week. Discipline is compounding.',
  },
  {
    label: 'Relentless',
    min: 15,
    text: 'text-fuchsia-300',
    bg: 'bg-fuchsia-500/10 ring-fuchsia-500/30',
    blurb: 'Fifteen days. You do not negotiate with yourself.',
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
  { label: string; short: string; color: string; hex: string; blurb: string }
> = {
  strength: {
    label: 'Strength',
    short: 'STR',
    color: 'text-ember-400',
    hex: '#fb923c',
    blurb: 'Raw force. Grows from heavy pulls, dips and skill holds.',
  },
  endurance: {
    label: 'Endurance',
    short: 'END',
    color: 'text-forge-400',
    hex: '#38bdf8',
    blurb: 'Work capacity. Grows from high-volume and conditioning work.',
  },
  aesthetics: {
    label: 'Aesthetics',
    short: 'AES',
    color: 'text-vital-400',
    hex: '#4ade80',
    blurb: 'Composition and control. Improves as body fat drops and volume rises.',
  },
  discipline: {
    label: 'Discipline',
    short: 'DIS',
    color: 'text-arcane-400',
    hex: '#c084fc',
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
