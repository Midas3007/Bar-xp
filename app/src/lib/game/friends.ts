import type { Profile, Stats } from '../types';
import { arr, int, num, str } from '../safe';
import { safeStats } from './constants';

/**
 * Friend identity helpers and the friend-card projection.
 *
 * Pure: no Firestore, no DOM. Everything here is compiled by the zero-dependency
 * test harness, so it may import only from `../safe`, `../types` and modules
 * already in `SOURCES`.
 */

/** Practical cap on the friend list. Not enforced in rules — rules cannot count documents. */
export const MAX_FRIENDS = 100;

/** Recent training days carried on the profile and mirrored to the friend card. */
export const RECENT_DAYS_KEPT = 14;

/**
 * The single canonical address for a pair of athletes, order-independent.
 *
 * This is what makes a friendship checkable from a rule without a query, and a
 * duplicate friendship impossible. Firebase uids are alphanumeric, so `__` is a
 * safe separator — only ids matching `__.*__` are reserved by Firestore.
 */
export function pairKey(a: unknown, b: unknown): string {
  const x = str(a, '');
  const y = str(b, '');
  return x < y ? `${x}__${y}` : `${y}__${x}`;
}

/** The address of a directed friend request. Not symmetric, unlike `pairKey`. */
export function requestId(from: unknown, to: unknown): string {
  return `${str(from, '')}__${str(to, '')}`;
}

/** The member of a two-person list that is not `me`, or '' if `me` is not in it. */
export function otherMember(members: unknown, me: unknown): string {
  const list = arr<unknown>(members).map((m) => str(m, ''));
  const self = str(me, '');
  if (!list.includes(self)) return '';
  return list.find((m) => m !== self) ?? '';
}

/**
 * Lowercased, trimmed, length-capped name for prefix search on `public_profiles`.
 *
 * Firestore has no case-insensitive comparison, so the lowercase form has to be
 * a stored field rather than something the query can derive.
 */
export function searchKey(name: unknown): string {
  return str(name, '').trim().toLowerCase().slice(0, 40);
}

/** Push today onto the rolling recent-days list, newest first, no duplicates. */
export function pushRecentDay(
  existing: unknown,
  day: string,
  keep: number = RECENT_DAYS_KEPT,
): string[] {
  const seen = arr<unknown>(existing)
    .map((d) => str(d, ''))
    .filter((d) => d !== '' && d !== day);
  return [day, ...seen].slice(0, Math.max(1, keep));
}

/**
 * Exactly the keys a friend card may contain.
 *
 * Mirrored by `hasOnly` in `firestore.rules` and asserted by a test. Adding a
 * field means changing all three together, deliberately.
 */
export const FRIEND_CARD_FIELDS = [
  'displayName',
  'photoURL',
  'level',
  'totalXp',
  'tier',
  'stats',
  'totalReps',
  'workoutCount',
  'streak',
  'bestStreak',
  'seasonId',
  'seasonXp',
  'recentDays',
  'updatedAt',
] as const;

export interface FriendCard {
  uid: string;
  displayName: string;
  photoURL: string;
  level: number;
  totalXp: number;
  tier: string;
  stats: Stats;
  totalReps: number;
  workoutCount: number;
  streak: number;
  bestStreak: number;
  seasonId: string;
  seasonXp: number;
  recentDays: string[];
  updatedAt: number;
}

/**
 * The friend projection of a profile.
 *
 * Built by explicit allow-list for the same reason `publicProfileFrom` is: a
 * field added to `Profile` later must not be able to reach another athlete by
 * default. Nothing about the body, the assessment, personal bests, goals,
 * custom movements, coins or inventory belongs here.
 */
export function friendCardFrom(
  profile: Profile,
  now: number = Date.now(),
): Record<string, unknown> {
  return {
    displayName: str(profile.displayName, 'Athlete'),
    photoURL: str(profile.photoURL, ''),
    level: Math.max(1, int(profile.level, 1)),
    totalXp: Math.max(0, num(profile.totalXp, 0)),
    tier: str(profile.tier, 'Uninitiated'),
    stats: safeStats(profile.stats),
    totalReps: Math.max(0, int(profile.totalReps, 0)),
    workoutCount: Math.max(0, int(profile.workoutCount, 0)),
    streak: Math.max(0, int(profile.streak?.current, 0)),
    bestStreak: Math.max(0, int(profile.streak?.best, 0)),
    seasonId: str(profile.season?.id, ''),
    seasonXp: Math.max(0, num(profile.season?.xp, 0)),
    recentDays: arr<unknown>(profile.recentDays)
      .map((d) => str(d, ''))
      .filter((d) => d !== '')
      .slice(0, RECENT_DAYS_KEPT),
    updatedAt: now,
  };
}

export function normalizeFriendCard(uid: string, raw: unknown): FriendCard {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    uid,
    displayName: str(data.displayName, 'Athlete'),
    photoURL: str(data.photoURL, ''),
    level: Math.max(1, int(data.level, 1)),
    totalXp: Math.max(0, num(data.totalXp, 0)),
    tier: str(data.tier, 'Uninitiated'),
    stats: safeStats(data.stats),
    totalReps: Math.max(0, int(data.totalReps, 0)),
    workoutCount: Math.max(0, int(data.workoutCount, 0)),
    streak: Math.max(0, int(data.streak, 0)),
    bestStreak: Math.max(0, int(data.bestStreak, 0)),
    seasonId: str(data.seasonId, ''),
    seasonXp: Math.max(0, num(data.seasonXp, 0)),
    recentDays: arr<unknown>(data.recentDays)
      .map((d) => str(d, ''))
      .filter((d) => d !== '')
      .slice(0, RECENT_DAYS_KEPT),
    updatedAt: num(data.updatedAt, 0),
  };
}
