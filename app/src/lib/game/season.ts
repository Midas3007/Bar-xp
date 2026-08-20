import { arr, int, num, str } from '../safe';
import { dayKey, daysBetween } from './streak';

/**
 * Competitive seasons.
 *
 * Derived from the calendar rather than from an admin document, so every client
 * computes identical boundaries from its own clock and nothing needs a server,
 * a scheduler or coordination.
 *
 * A season resets a *scoreboard*, not a character. Lifetime XP, level, stats,
 * tier, coins, unlocks and personal bests are not inputs to anything in this
 * file and therefore cannot be outputs of it — that guarantee is structural
 * here rather than something a reviewer has to remember.
 */

/** A season is one calendar quarter. */
export const SEASON_LENGTH_MONTHS = 3;

export interface SeasonWindow {
  /** `2026-S3` — sorts lexicographically in chronological order. */
  id: string;
  /** `2026 · Season 3` — deliberately not "Summer", which is wrong in half the world. */
  label: string;
  year: number;
  /** 1–4. */
  index: number;
  startDay: string;
  /** Inclusive. */
  endDay: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function windowFor(year: number, index: number): SeasonWindow {
  const startMonth = (index - 1) * SEASON_LENGTH_MONTHS;
  // Day 0 of the *next* month is the last day of this one, which handles
  // February and leap years without a table.
  const end = new Date(year, startMonth + SEASON_LENGTH_MONTHS, 0);
  return {
    id: `${year}-S${index}`,
    label: `${year} · Season ${index}`,
    year,
    index,
    startDay: `${year}-${pad(startMonth + 1)}-01`,
    endDay: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`,
  };
}

export function seasonWindowFor(date: Date = new Date()): SeasonWindow {
  return windowFor(date.getFullYear(), Math.floor(date.getMonth() / SEASON_LENGTH_MONTHS) + 1);
}

export function seasonIdFor(date: Date = new Date()): string {
  return seasonWindowFor(date).id;
}

export function seasonWindowById(id: unknown): SeasonWindow | null {
  const match = /^(\d{4})-S([1-4])$/.exec(str(id, ''));
  if (!match) return null;
  return windowFor(Number(match[1]), Number(match[2]));
}

export function seasonLabel(id: unknown): string {
  return seasonWindowById(id)?.label ?? str(id, 'Unknown season');
}

/** Days remaining including today. 0 when the id cannot be parsed. */
export function daysLeftInSeason(date: Date = new Date()): number {
  const window = seasonWindowFor(date);
  const left = daysBetween(dayKey(date), window.endDay);
  return left === null ? 0 : Math.max(0, left) + 1;
}

/* -------------------------------------------------------------------------- */
/* State carried on the profile                                                */
/* -------------------------------------------------------------------------- */

export interface SeasonState {
  /** The season the counters below belong to. '' on a profile that predates seasons. */
  id: string;
  xp: number;
  sessions: number;
  startedAt: number;
}

export interface SeasonRecord {
  id: string;
  xp: number;
  sessions: number;
  /** Final placement on the global season ladder. 0 while unresolved or unranked. */
  rank: number;
  entrants: number;
  /** True until the placement has been resolved against the ladder. */
  pending: boolean;
  endedAt: number;
}

export const EMPTY_SEASON: SeasonState = { id: '', xp: 0, sessions: 0, startedAt: 0 };

/** Six years of quarters. */
export const MAX_SEASON_HISTORY = 24;

export function safeSeason(value: unknown): SeasonState {
  const data = (value ?? {}) as Record<string, unknown>;
  return {
    id: str(data.id, ''),
    xp: Math.max(0, num(data.xp, 0)),
    sessions: Math.max(0, int(data.sessions, 0)),
    startedAt: num(data.startedAt, 0),
  };
}

export function safeSeasonRecord(value: unknown): SeasonRecord {
  const data = (value ?? {}) as Record<string, unknown>;
  return {
    id: str(data.id, ''),
    xp: Math.max(0, num(data.xp, 0)),
    sessions: Math.max(0, int(data.sessions, 0)),
    rank: Math.max(0, int(data.rank, 0)),
    entrants: Math.max(0, int(data.entrants, 0)),
    pending: data.pending === true,
    endedAt: num(data.endedAt, 0),
  };
}

/** Deduped by id, newest first, capped. */
export function safeSeasonHistory(value: unknown): SeasonRecord[] {
  const seen = new Set<string>();
  const out: SeasonRecord[] = [];
  for (const raw of arr<unknown>(value)) {
    const record = safeSeasonRecord(raw);
    if (record.id === '' || seen.has(record.id)) continue;
    seen.add(record.id);
    out.push(record);
  }
  return out.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, MAX_SEASON_HISTORY);
}

/* -------------------------------------------------------------------------- */
/* Rollover                                                                    */
/* -------------------------------------------------------------------------- */

export interface RolloverResult {
  changed: boolean;
  season: SeasonState;
  history: SeasonRecord[];
}

/**
 * Close out an elapsed season, if one has elapsed.
 *
 * Returns *only* season fields. One function used by both the logging path and
 * the background pass, so the two can never disagree about what a rollover does.
 *
 * `pending: true` is what makes the ordering race harmless: if a workout is
 * logged before the background pass runs, the numbers are still recorded
 * correctly and only the rank is left to fill in later. Nothing is lost, and no
 * code path has to do a network read inside a batched write.
 */
export function rolloverSeason(
  state: unknown,
  history: unknown,
  currentId: string,
  now: number = Date.now(),
): RolloverResult {
  const current = safeSeason(state);
  const past = safeSeasonHistory(history);

  if (current.id === currentId) {
    return { changed: false, season: current, history: past };
  }

  // A profile written before seasons existed. Initialise it, but do NOT invent
  // a placement for a season it never had a counter in.
  if (current.id === '') {
    return {
      changed: true,
      season: { id: currentId, xp: 0, sessions: 0, startedAt: now },
      history: past,
    };
  }

  const worthRecording = current.xp > 0 || current.sessions > 0;
  const nextHistory = worthRecording
    ? safeSeasonHistory([
        {
          id: current.id,
          xp: current.xp,
          sessions: current.sessions,
          rank: 0,
          entrants: 0,
          pending: current.xp > 0,
          endedAt: now,
        },
        ...past,
      ])
    : past;

  return {
    changed: true,
    season: { id: currentId, xp: 0, sessions: 0, startedAt: now },
    history: nextHistory,
  };
}

export function accrueSeason(state: SeasonState, xp: unknown, now: number = Date.now()): SeasonState {
  const base = safeSeason(state);
  return {
    id: base.id,
    xp: Math.max(0, base.xp + Math.max(0, num(xp, 0))),
    sessions: base.sessions + 1,
    startedAt: base.startedAt > 0 ? base.startedAt : now,
  };
}

/* -------------------------------------------------------------------------- */
/* Standings                                                                   */
/* -------------------------------------------------------------------------- */

export interface SeasonStanding {
  uid: string;
  displayName: string;
  xp: number;
}

function safeStanding(raw: unknown): SeasonStanding | null {
  const data = (raw ?? {}) as Record<string, unknown>;
  const uid = str(data.uid, '');
  if (uid === '') return null;
  return { uid, displayName: str(data.displayName, 'Athlete'), xp: Math.max(0, num(data.xp, 0)) };
}

/**
 * Union two standings lists by uid, higher XP winning a duplicate.
 *
 * An athlete who has already rolled over into the next season appears in the
 * `lastSeasonId` query with their final total; one who has not appears in the
 * live `seasonId` query. Without the union, whoever opens the app last would be
 * ranked against an empty field and told they came first.
 */
export function mergeSeasonStandings(a: unknown, b: unknown): SeasonStanding[] {
  const byUid = new Map<string, SeasonStanding>();
  for (const raw of [...arr<unknown>(a), ...arr<unknown>(b)]) {
    const standing = safeStanding(raw);
    if (!standing) continue;
    const existing = byUid.get(standing.uid);
    if (!existing || standing.xp > existing.xp) byUid.set(standing.uid, standing);
  }
  return [...byUid.values()].sort((x, y) => y.xp - x.xp);
}

/** 1-based competition rank — equal XP shares a rank — and the size of the field. */
export function placementIn(
  standings: SeasonStanding[],
  uid: string,
): { rank: number; entrants: number } {
  const list = arr<SeasonStanding>(standings);
  const entrants = list.length;
  const mine = list.find((s) => s.uid === uid);
  if (!mine) return { rank: 0, entrants };
  const ahead = list.filter((s) => s.xp > mine.xp).length;
  return { rank: ahead + 1, entrants };
}
