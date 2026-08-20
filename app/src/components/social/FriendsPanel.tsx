import { useState } from 'react';
import { Search, UserPlus, Users, X } from 'lucide-react';

import type { LeaderboardRow, Profile } from '../../lib/types';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Spinner,
} from '../ui/Primitives';
import { LeaderRow, RowAvatar } from './LeaderRow';
import { HeadToHead } from './HeadToHead';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  clearMirrorRequest,
  declineFriendRequest,
  removeFriend,
  searchAthletes,
  sendFriendRequest,
  type FriendGraph,
} from '../../lib/social';
import { useToast } from '../../context/ToastContext';
import { fmt } from '../../lib/safe';

/**
 * The friend list, the pending requests in both directions, and name search.
 *
 * Head-to-head renders inline beneath the list when a row is selected — there
 * is no modal primitive in this codebase and adding one is a different slice.
 */
export function FriendsPanel({
  profile,
  graph,
  meRow,
  onReload,
}: {
  profile: Profile;
  graph: FriendGraph;
  meRow: LeaderboardRow | null;
  onReload: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<LeaderboardRow[] | null>(null);
  const [searching, setSearching] = useState(false);

  const outgoingTo = new Set(graph.outgoing.map((r) => r.to));
  const friendSet = new Set(graph.friendUids);

  const ladder = [...graph.rows];
  if (meRow) ladder.push(meRow);
  ladder.sort((a, b) => b.totalXp - a.totalXp);

  const act = async (key: string, run: () => Promise<void>, message?: string) => {
    setBusy(key);
    try {
      await run();
      if (message) toast.success(message);
      onReload();
    } catch (error) {
      console.error('[friends] action failed', error);
      toast.error('That did not go through', 'Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const runSearch = async () => {
    setSearching(true);
    try {
      const found = await searchAthletes(term);
      // A query cannot express "not these", so self and existing friends are
      // filtered here rather than in the query.
      setResults(found.filter((r) => r.uid !== profile.uid && !friendSet.has(r.uid)));
    } catch (error) {
      console.error('[friends] search failed', error);
      toast.error('Search failed', 'Check your connection and try again.');
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* --- Requests --- */}
      {graph.incoming.length > 0 || graph.outgoing.length > 0 ? (
        <Card>
          <CardHeader
            title="Requests"
            subtitle="Nothing is shared until a request is accepted."
            icon={<UserPlus className="h-4 w-4" aria-hidden />}
          />
          <ul className="divide-y divide-white/5">
            {graph.incoming.map((request) => (
              <li key={request.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">
                    Request from{' '}
                    <span className="font-semibold">
                      {graph.people[request.from]?.displayName ?? 'An athlete'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">Wants to compare training.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(
                        request.id,
                        async () => {
                          await acceptFriendRequest(profile.uid, request.from);
                          // Best effort, and deliberately outside the accept
                          // batch: deleting a document that may not exist
                          // evaluates its rule with a null resource and would
                          // deny the whole batch.
                          await clearMirrorRequest(profile.uid, request.from);
                        },
                        'Friend added',
                      )
                    }
                  >
                    {busy === request.id ? <Spinner className="h-3.5 w-3.5" /> : null}
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      void act(
                        request.id,
                        () => declineFriendRequest(profile.uid, request.from),
                        'Request declined',
                      )
                    }
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}

            {graph.outgoing.map((request) => (
              <li key={request.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-400">
                    Sent to{' '}
                    <span className="font-semibold">
                      {graph.people[request.to]?.displayName ?? 'an athlete'}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">Waiting for a reply.</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(
                      request.id,
                      () => cancelFriendRequest(profile.uid, request.to),
                      'Request cancelled',
                    )
                  }
                >
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* --- Friends ladder --- */}
      <Card>
        <CardHeader
          title="Friends"
          subtitle={`${fmt(graph.friendUids.length)} friend${graph.friendUids.length === 1 ? '' : 's'}. Tap anyone to compare head to head.`}
          icon={<Users className="h-4 w-4" aria-hidden />}
        />
        {graph.friendUids.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" aria-hidden />}
            title="No friends yet"
            message="Search for someone by name, or add them from the global leaderboard."
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {ladder.map((row, index) => {
              const isMe = row.uid === profile.uid;
              return (
                <LeaderRow
                  key={row.uid}
                  row={row}
                  rank={index + 1}
                  isMe={isMe}
                  scoreValue={row.totalXp}
                  scoreLabel="XP"
                  onClick={isMe ? undefined : () => setSelected(selected === row.uid ? null : row.uid)}
                  action={
                    isMe ? null : (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void act(
                            row.uid,
                            () => removeFriend(profile.uid, row.uid),
                            'Friend removed',
                          )
                        }
                        className="rounded-lg p-1.5 text-slate-600 transition hover:text-rose-300"
                        aria-label={`Remove ${row.displayName}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )
                  }
                />
              );
            })}
          </ul>
        )}
      </Card>

      {selected ? (
        <HeadToHead
          profile={profile}
          row={graph.rows.find((r) => r.uid === selected) ?? null}
          card={graph.cards[selected] ?? null}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {/* --- Search --- */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
          <Search className="h-4 w-4 text-slate-500" aria-hidden />
          Find an athlete
        </h3>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Search by name" hint="At least two characters. Matches the start of a name.">
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="alex"
                autoComplete="off"
              />
            </Field>
          </div>
          <Button
            variant="secondary"
            disabled={searching || term.trim().length < 2}
            onClick={() => void runSearch()}
            className="mb-[22px]"
          >
            {searching ? <Spinner className="h-4 w-4" /> : null}
            Search
          </Button>
        </div>

        {results !== null ? (
          results.length === 0 ? (
            <p className="mt-3 text-xs text-slate-600">No athletes matched that name.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {results.map((row) => (
                <li
                  key={row.uid}
                  className="flex items-center gap-3 rounded-xl bg-ink-900/60 p-3 ring-1 ring-inset ring-white/5"
                >
                  <RowAvatar row={row} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{row.displayName}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      Lv {fmt(row.level)} · {row.tier}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null || outgoingTo.has(row.uid)}
                    onClick={() =>
                      void act(
                        row.uid,
                        () => sendFriendRequest(profile.uid, row.uid),
                        'Request sent',
                      )
                    }
                  >
                    {outgoingTo.has(row.uid) ? 'Requested' : 'Add'}
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>
    </div>
  );
}
