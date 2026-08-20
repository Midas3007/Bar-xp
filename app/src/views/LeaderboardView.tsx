import { useCallback, useEffect, useState } from 'react';
import { Flame, Swords, Trophy, UserPlus, Users } from 'lucide-react';

import type { LeaderboardRow, Profile } from '../lib/types';
import { Button, Card, CardHeader, EmptyState, SkeletonBlock } from '../components/ui/Primitives';
import { LeaderRow } from '../components/social/LeaderRow';
import { FriendsPanel } from '../components/social/FriendsPanel';
import { ChallengesPanel } from '../components/social/ChallengesPanel';
import { SeasonPanel } from '../components/social/SeasonPanel';
import { fetchLeaderboard } from '../lib/data';
import { EMPTY_GRAPH, fetchFriendGraph, sendFriendRequest, type FriendGraph } from '../lib/social';
import { useToast } from '../context/ToastContext';
import { fmt } from '../lib/safe';

type Tab = 'global' | 'friends' | 'season' | 'challenges';

const TABS: Array<{ key: Tab; label: string; icon: typeof Trophy }> = [
  { key: 'global', label: 'Global', icon: Trophy },
  { key: 'friends', label: 'Friends', icon: Users },
  { key: 'season', label: 'Season', icon: Flame },
  { key: 'challenges', label: 'Challenges', icon: Swords },
];

/**
 * The competitive shell.
 *
 * Owns the friend graph so the panels below stay dumb, and so one reload
 * refreshes every tab that depends on it.
 */
export function LeaderboardView({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('global');

  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<FriendGraph>(EMPTY_GRAPH);
  const [graphLoaded, setGraphLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    fetchLeaderboard(50)
      .then((result) => {
        if (active) setRows(result);
      })
      .catch((err) => {
        console.error('[leaderboard] failed to load', err);
        if (!active) return;
        setRows([]);
        setError(
          'Could not load the leaderboard. It reads the public profile projection — check your Firestore rules.',
        );
      });

    return () => {
      active = false;
    };
  }, [profile.totalXp]);

  const reloadGraph = useCallback(() => {
    fetchFriendGraph(profile.uid)
      .then((next) => {
        setGraph(next);
        setGraphLoaded(true);
      })
      .catch((err) => {
        console.error('[leaderboard] failed to load friend graph', err);
        setGraphLoaded(true);
      });
  }, [profile.uid]);

  useEffect(() => {
    reloadGraph();
  }, [reloadGraph]);

  const myRank = rows?.findIndex((row) => row.uid === profile.uid) ?? -1;
  const meRow = rows?.find((row) => row.uid === profile.uid) ?? null;

  const friendSet = new Set(graph.friendUids);
  const requestedSet = new Set(graph.outgoing.map((r) => r.to));

  const addFriend = async (uid: string) => {
    try {
      await sendFriendRequest(profile.uid, uid);
      toast.success('Request sent');
      reloadGraph();
    } catch (err) {
      console.error('[leaderboard] friend request failed', err);
      toast.error('Could not send that request', 'Check your connection and try again.');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">Compete</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Lifetime rank, your friends, this season, and whatever you have bet on.
          {tab === 'global' && myRank >= 0 ? ` You are #${fmt(myRank + 1)} overall.` : ''}
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-ink-900 p-1 ring-1 ring-inset ring-white/5">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-pressed={active}
              className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition ${
                active
                  ? 'bg-forge-500/20 text-forge-200 ring-1 ring-inset ring-forge-400/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'global' ? (
        <Card>
          <CardHeader
            title="Top 50"
            subtitle="Every athlete on Bar XP, ranked by lifetime XP."
            icon={<Trophy className="h-4 w-4" aria-hidden />}
          />

          {rows === null ? (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-14" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Trophy className="h-8 w-8" aria-hidden />}
              title={error ? 'Leaderboard unavailable' : 'No athletes yet'}
              message={error ?? 'Nobody has logged any XP. Be the first name on the board.'}
            />
          ) : (
            <ul className="divide-y divide-white/5">
              {rows.map((row, index) => {
                const isMe = row.uid === profile.uid;
                const addable =
                  graphLoaded && !isMe && !friendSet.has(row.uid) && !requestedSet.has(row.uid);
                return (
                  <LeaderRow
                    key={row.uid}
                    row={row}
                    rank={index + 1}
                    isMe={isMe}
                    scoreValue={row.totalXp}
                    scoreLabel="XP"
                    action={
                      addable ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void addFriend(row.uid)}
                          aria-label={`Add ${row.displayName} as a friend`}
                        >
                          <UserPlus className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      ) : null
                    }
                  />
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'friends' ? (
        <FriendsPanel profile={profile} graph={graph} meRow={meRow} onReload={reloadGraph} />
      ) : null}

      {tab === 'season' ? (
        <SeasonPanel profile={profile} graph={graph} meRow={meRow} />
      ) : null}

      {tab === 'challenges' ? <ChallengesPanel profile={profile} graph={graph} /> : null}

      <p className="text-center text-xs leading-relaxed text-slate-600">
        Only your name, rank, level, streak and XP are public. Friends additionally see your core
        stats, volume and training days. Workouts, personal bests and anything about your body stay
        private to your account.
      </p>
    </div>
  );
}
