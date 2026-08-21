import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { CHALLENGE_SCORES, COLLECTIONS, getDbOrThrow } from './firebase';
import type { Challenge, ChallengeScore, FriendRequest, LeaderboardRow, Profile } from './types';
import { arr, int, num, str } from './safe';
import { fetchWorkouts } from './data';
import {
  normalizeFriendCard,
  pairKey,
  requestId,
  searchKey,
  type FriendCard,
} from './game/friends';
import {
  mergeSeasonStandings,
  placementIn,
  safeSeasonHistory,
  seasonIdFor,
  type SeasonRecord,
  type SeasonStanding,
} from './game/season';
import {
  challengeWindowDays,
  safeChallengeScore,
  scoreChallenge,
  templateById,
  type ChallengeTemplate,
} from './game/challenges';

/**
 * Every Firestore read and write for friends, challenges and seasons.
 *
 * Separate from `data.ts` so that file does not keep growing, and the
 * dependency runs one way only: `social.ts` imports from `data.ts`, never the
 * reverse.
 */

/** Firestore's `in` / `array-contains-any` operators cap out here. */
const IN_CHUNK = 30;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Row mapping                                                                 */
/* -------------------------------------------------------------------------- */

function rowFrom(uid: string, raw: unknown): LeaderboardRow {
  const data = (raw ?? {}) as Record<string, unknown>;
  const cosmetics = arr<string>(data.cosmetics);
  const active = str(data.activeCosmetic, '');
  return {
    uid,
    displayName: str(data.displayName, 'Athlete'),
    photoURL: str(data.photoURL, ''),
    level: Math.max(1, int(data.level, 1)),
    totalXp: Math.max(0, num(data.totalXp, 0)),
    tier: str(data.tier, 'Uninitiated'),
    streak: Math.max(0, int(data.streak, 0)),
    activeCosmetic: active && cosmetics.includes(active) ? active : null,
    cosmetics,
    seasonId: str(data.seasonId, ''),
    seasonXp: Math.max(0, num(data.seasonXp, 0)),
  };
}

/* -------------------------------------------------------------------------- */
/* Friends                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Prefix search on the stored lowercase name.
 *
 * `\uf8ff` is a very high private-use code point, so `>= q` and `<= q + \uf8ff`
 * bracket every string that starts with `q`. Written as an escape rather than a
 * literal character on purpose: the literal is invisible in an editor and was
 * silently lost once already, which turned this into an exact-match query that
 * only ever found someone by typing their whole name.
 *
 * Self and existing friends are filtered by the caller, not the query — a
 * Firestore query cannot express "not these".
 */
export async function searchAthletes(term: string, max = 10): Promise<LeaderboardRow[]> {
  const q = searchKey(term);
  if (q.length < 2) return [];

  const db = getDbOrThrow();
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.publicProfiles),
      where('searchName', '>=', q),
      where('searchName', '<=', `${q}\uf8ff`),
      orderBy('searchName'),
      fbLimit(max),
    ),
  );
  return snapshot.docs.map((d) => rowFrom(d.id, d.data()));
}

export async function sendFriendRequest(fromUid: string, toUid: string): Promise<void> {
  if (fromUid === toUid) return;
  const db = getDbOrThrow();
  await setDoc(doc(db, COLLECTIONS.friendRequests, requestId(fromUid, toUid)), {
    from: fromUid,
    to: toUid,
    createdAt: Date.now(),
  });
}

/**
 * Accept: create the friendship and delete the request, in one batch.
 *
 * Rules `get()`/`exists()` inside a batch see the *pre-batch* state, so the
 * friendship's `exists(request)` check passes even though this same batch
 * deletes that request.
 */
export async function acceptFriendRequest(me: string, fromUid: string): Promise<void> {
  const db = getDbOrThrow();
  const batch = writeBatch(db);

  const members = [me, fromUid].sort();
  batch.set(doc(db, COLLECTIONS.friendships, pairKey(me, fromUid)), {
    members,
    createdAt: Date.now(),
  });
  batch.delete(doc(db, COLLECTIONS.friendRequests, requestId(fromUid, me)));

  await batch.commit();
}

/**
 * If both people happened to request each other, the mirror request is now
 * meaningless. Deleted separately and best-effort, never inside the accept
 * batch: a delete against a *missing* document evaluates its rule with a null
 * `resource`, `resource.data.from` throws, and the whole batch is denied.
 */
export async function clearMirrorRequest(me: string, otherUid: string): Promise<void> {
  try {
    await deleteDoc(doc(getDbOrThrow(), COLLECTIONS.friendRequests, requestId(me, otherUid)));
  } catch {
    // There was probably no mirror. Nothing depends on this succeeding.
  }
}

export async function declineFriendRequest(me: string, fromUid: string): Promise<void> {
  await deleteDoc(doc(getDbOrThrow(), COLLECTIONS.friendRequests, requestId(fromUid, me)));
}

export async function cancelFriendRequest(me: string, toUid: string): Promise<void> {
  await deleteDoc(doc(getDbOrThrow(), COLLECTIONS.friendRequests, requestId(me, toUid)));
}

export async function removeFriend(me: string, friendUid: string): Promise<void> {
  await deleteDoc(doc(getDbOrThrow(), COLLECTIONS.friendships, pairKey(me, friendUid)));
}

export interface FriendGraph {
  friendUids: string[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  /** Public rows for `friendUids`, sorted by lifetime XP descending. */
  rows: LeaderboardRow[];
  cards: Record<string, FriendCard>;
  /**
   * Public rows for everyone in the graph, friends and requesters alike, keyed
   * by uid. Requests would otherwise render as a raw uid.
   */
  people: Record<string, LeaderboardRow>;
}

export const EMPTY_GRAPH: FriendGraph = {
  friendUids: [],
  incoming: [],
  outgoing: [],
  rows: [],
  cards: {},
  people: {},
};

function requestFrom(id: string, raw: unknown): FriendRequest {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    id,
    from: str(data.from, ''),
    to: str(data.to, ''),
    createdAt: num(data.createdAt, 0),
  };
}

/**
 * The whole friend graph in one call.
 *
 * None of the three queries is ordered — sorting happens client-side — which
 * keeps all of them on automatic single-field indexes rather than needing
 * composite ones.
 */
export async function fetchFriendGraph(uid: string): Promise<FriendGraph> {
  const db = getDbOrThrow();

  const [friendships, incomingSnap, outgoingSnap] = await Promise.all([
    getDocs(
      query(collection(db, COLLECTIONS.friendships), where('members', 'array-contains', uid)),
    ),
    getDocs(query(collection(db, COLLECTIONS.friendRequests), where('to', '==', uid))),
    getDocs(query(collection(db, COLLECTIONS.friendRequests), where('from', '==', uid))),
  ]);

  const friendUids = friendships.docs
    .flatMap((d) => arr<unknown>((d.data() ?? {}).members).map((m) => str(m, '')))
    .filter((id) => id !== '' && id !== uid);

  const byCreated = (a: FriendRequest, b: FriendRequest) => b.createdAt - a.createdAt;
  const incoming = incomingSnap.docs.map((d) => requestFrom(d.id, d.data())).sort(byCreated);
  const outgoing = outgoingSnap.docs.map((d) => requestFrom(d.id, d.data())).sort(byCreated);

  const cards: Record<string, FriendCard> = {};
  const people: Record<string, LeaderboardRow> = {};

  // Requesters are looked up too, so a pending request renders as a name rather
  // than a raw uid.
  const everyone = [
    ...new Set([...friendUids, ...incoming.map((r) => r.from), ...outgoing.map((r) => r.to)]),
  ].filter((id) => id !== '');

  if (everyone.length > 0) {
    const rowChunks = await Promise.all(
      chunk(everyone, IN_CHUNK).map((ids) =>
        getDocs(query(collection(db, COLLECTIONS.publicProfiles), where(documentId(), 'in', ids))),
      ),
    );
    for (const snap of rowChunks) {
      for (const d of snap.docs) people[d.id] = rowFrom(d.id, d.data());
    }
  }

  if (friendUids.length > 0) {
    // A friend who has not opened the new build has no card. That is a normal
    // state, not an error — the UI falls back to their public row.
    const cardDocs = await Promise.all(
      friendUids.map((id) => getDoc(doc(db, COLLECTIONS.friendCards, id)).catch(() => null)),
    );
    for (const snap of cardDocs) {
      if (snap?.exists()) cards[snap.id] = normalizeFriendCard(snap.id, snap.data());
    }
  }

  const rows = friendUids
    .map((id) => people[id])
    .filter((row): row is LeaderboardRow => Boolean(row))
    .sort((a, b) => b.totalXp - a.totalXp);

  return { friendUids, incoming, outgoing, rows, cards, people };
}

/* -------------------------------------------------------------------------- */
/* Challenges                                                                  */
/* -------------------------------------------------------------------------- */

function challengeFrom(id: string, raw: unknown): Challenge {
  const data = (raw ?? {}) as Record<string, unknown>;
  const status = str(data.status, 'pending');
  return {
    id,
    createdBy: str(data.createdBy, ''),
    members: arr<unknown>(data.members).map((m) => str(m, '')),
    templateId: str(data.templateId, ''),
    title: str(data.title, 'Challenge'),
    metric:
      data.metric === 'volume' || data.metric === 'xp' || data.metric === 'exercise_volume'
        ? data.metric
        : 'sessions',
    window: data.window === 'month' ? 'month' : 'week',
    exerciseId: str(data.exerciseId, '') || null,
    startDay: str(data.startDay, ''),
    endDay: str(data.endDay, ''),
    endsAt: num(data.endsAt, 0),
    status: status === 'active' || status === 'declined' ? status : 'pending',
    createdAt: num(data.createdAt, 0),
    respondedAt: data.respondedAt == null ? null : num(data.respondedAt, 0),
  };
}

export async function createChallenge(
  me: Profile,
  friendUid: string,
  template: ChallengeTemplate,
): Promise<string> {
  const db = getDbOrThrow();
  const window = challengeWindowDays(template.window);
  const ref = doc(collection(db, COLLECTIONS.challenges));

  await setDoc(ref, {
    createdBy: me.uid,
    members: [me.uid, friendUid],
    templateId: template.id,
    title: template.title,
    metric: template.metric,
    window: template.window,
    exerciseId: template.exerciseId ?? null,
    startDay: window.startDay,
    endDay: window.endDay,
    endsAt: window.endsAt,
    status: 'pending',
    createdAt: Date.now(),
    respondedAt: null,
  });

  return ref.id;
}

export async function respondToChallenge(id: string, accept: boolean): Promise<void> {
  await updateDoc(doc(getDbOrThrow(), COLLECTIONS.challenges, id), {
    status: accept ? 'active' : 'declined',
    respondedAt: Date.now(),
  });
}

export async function deleteChallenge(id: string): Promise<void> {
  await deleteDoc(doc(getDbOrThrow(), COLLECTIONS.challenges, id));
}

export async function fetchChallenges(uid: string): Promise<Challenge[]> {
  const db = getDbOrThrow();
  const snapshot = await getDocs(
    query(collection(db, COLLECTIONS.challenges), where('members', 'array-contains', uid)),
  );
  return snapshot.docs
    .map((d) => challengeFrom(d.id, d.data()))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchChallengeScores(id: string): Promise<Record<string, ChallengeScore>> {
  const db = getDbOrThrow();
  const snapshot = await getDocs(collection(db, COLLECTIONS.challenges, id, CHALLENGE_SCORES));
  const out: Record<string, ChallengeScore> = {};
  for (const d of snapshot.docs) out[d.id] = safeChallengeScore(d.id, d.data());
  return out;
}

/**
 * Recompute and publish your own score for one challenge.
 *
 * Reads your workouts through the existing `uid + createdAt` index and filters
 * by day in memory, so a window of at most a month needs no new composite
 * index. Called on panel load and from a manual refresh — never from the
 * logging path, which must not gain a network write.
 */
export async function syncChallengeScore(
  profile: Profile,
  challenge: Challenge,
): Promise<ChallengeScore> {
  const workouts = await fetchWorkouts(profile.uid, 200);
  const scored = scoreChallenge(
    challenge.metric,
    challenge.exerciseId,
    workouts,
    challenge.startDay,
    challenge.endDay,
  );

  const score: ChallengeScore = {
    uid: profile.uid,
    value: scored.value,
    sessions: scored.sessions,
    updatedAt: Date.now(),
  };

  await setDoc(
    doc(getDbOrThrow(), COLLECTIONS.challenges, challenge.id, CHALLENGE_SCORES, profile.uid),
    score,
  );
  return score;
}

export function challengeTemplateFor(challenge: Challenge): ChallengeTemplate | undefined {
  return templateById(challenge.templateId);
}

/* -------------------------------------------------------------------------- */
/* Seasons                                                                     */
/* -------------------------------------------------------------------------- */

export async function fetchSeasonLadder(seasonId: string, max = 50): Promise<LeaderboardRow[]> {
  const db = getDbOrThrow();
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.publicProfiles),
      where('seasonId', '==', seasonId),
      orderBy('seasonXp', 'desc'),
      fbLimit(max),
    ),
  );
  return snapshot.docs.map((d) => rowFrom(d.id, d.data()));
}

/** How deep a season ladder is read when computing a placement. */
const STANDINGS_LIMIT = 200;

/**
 * Both halves of a season's field, unioned.
 *
 * An athlete who has already rolled over appears under `lastSeasonId` with
 * their final total; one who has not appears under the live `seasonId`. Without
 * the union, whoever opens the app last would be ranked against an empty field
 * and told they came first.
 */
export async function fetchSeasonStandings(seasonId: string): Promise<SeasonStanding[]> {
  const db = getDbOrThrow();
  const [live, finished] = await Promise.all([
    getDocs(
      query(
        collection(db, COLLECTIONS.publicProfiles),
        where('seasonId', '==', seasonId),
        orderBy('seasonXp', 'desc'),
        fbLimit(STANDINGS_LIMIT),
      ),
    ),
    getDocs(
      query(
        collection(db, COLLECTIONS.publicProfiles),
        where('lastSeasonId', '==', seasonId),
        orderBy('lastSeasonXp', 'desc'),
        fbLimit(STANDINGS_LIMIT),
      ),
    ),
  ]);

  return mergeSeasonStandings(
    live.docs.map((d) => ({
      uid: d.id,
      displayName: str((d.data() ?? {}).displayName, 'Athlete'),
      xp: num((d.data() ?? {}).seasonXp, 0),
    })),
    finished.docs.map((d) => ({
      uid: d.id,
      displayName: str((d.data() ?? {}).displayName, 'Athlete'),
      xp: num((d.data() ?? {}).lastSeasonXp, 0),
    })),
  );
}

/** Seasons older than this are marked resolved without a query — their ladder is gone. */
const RESOLVABLE_SEASONS = 2;

/**
 * Fill in the placement for the newest pending season record.
 *
 * Returns a patched history array, or null when there is nothing to do.
 * Anything older than two seasons is marked resolved with rank 0 rather than
 * queried: the ladder for it no longer exists, and pretending otherwise would
 * invent a number.
 */
export async function resolvePendingSeasonPlacements(
  profile: Profile,
): Promise<SeasonRecord[] | null> {
  const history = safeSeasonHistory(profile.seasonHistory);
  const pending = history.filter((r) => r.pending);
  if (pending.length === 0) return null;

  const currentId = seasonIdFor();
  const recent = history.filter((r) => r.id < currentId).slice(0, RESOLVABLE_SEASONS);
  const resolvable = pending.find((r) => recent.some((x) => x.id === r.id));

  let patched = history;

  if (resolvable) {
    const standings = await fetchSeasonStandings(resolvable.id);
    const { rank, entrants } = placementIn(standings, profile.uid);
    patched = patched.map((r) =>
      r.id === resolvable.id ? { ...r, rank, entrants, pending: false } : r,
    );
  }

  // Everything still pending and too old to score is closed out unranked.
  patched = patched.map((r) =>
    r.pending && !recent.some((x) => x.id === r.id)
      ? { ...r, rank: 0, entrants: 0, pending: false }
      : r,
  );

  const changed = patched.some(
    (r, i) => r.pending !== history[i].pending || r.rank !== history[i].rank,
  );
  return changed ? patched : null;
}
