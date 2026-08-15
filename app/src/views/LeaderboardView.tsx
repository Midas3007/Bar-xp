import { useEffect, useState } from 'react';
import { Crown, Flame, Medal, Trophy } from 'lucide-react';

import type { LeaderboardRow, Profile } from '../lib/types';
import { Card, CardHeader, EmptyState, SkeletonBlock } from '../components/ui/Primitives';
import { NeonName, TierBadge } from '../components/GameBits';
import { fetchLeaderboard } from '../lib/data';
import { fmt } from '../lib/safe';

export function LeaderboardView({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          'Could not load the leaderboard. It requires read access to the users collection — check your Firestore rules.',
        );
      });

    return () => {
      active = false;
    };
  }, [profile.totalXp]);

  const myRank = rows?.findIndex((row) => row.uid === profile.uid) ?? -1;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">
          Global Leaderboard
        </h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Every athlete on Bar XP, ranked by lifetime XP.
          {myRank >= 0 ? ` You are #${fmt(myRank + 1)}.` : ''}
        </p>
      </div>

      <Card>
        <CardHeader
          title="Top 50"
          subtitle="Updated whenever your own XP changes."
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
            message={
              error ??
              'Nobody has logged any XP. Be the first name on the board.'
            }
          />
        ) : (
          <ul className="divide-y divide-white/5">
            {rows.map((row, index) => {
              const isMe = row.uid === profile.uid;
              return (
                <li
                  key={row.uid}
                  className={`flex items-center gap-3 p-4 transition sm:gap-4 ${
                    isMe ? 'bg-forge-500/[0.07] ring-1 ring-inset ring-forge-500/20' : ''
                  }`}
                >
                  <RankMark rank={index + 1} />

                  <RowAvatar row={row} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold">
                      {/* Cosmetics from other users' documents are only honoured
                          when that user genuinely owns them. */}
                      <NeonName
                        name={row.displayName}
                        activeCosmetic={row.activeCosmetic}
                        ownedCosmetics={row.cosmetics}
                      />
                      {isMe ? (
                        <span className="ml-2 text-[11px] font-medium text-forge-400">you</span>
                      ) : null}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <TierBadge tierName={row.tier} size="sm" />
                      <span className="text-[11px] text-slate-500">Lv {fmt(row.level)}</span>
                      {row.streak > 0 ? (
                        <span className="flex items-center gap-1 text-[11px] text-ember-400/80">
                          <Flame className="h-3 w-3" aria-hidden />
                          {fmt(row.streak)}d
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-bold text-forge-300">
                      {fmt(row.totalXp)}
                    </p>
                    <p className="text-[11px] text-slate-600">XP</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-center text-xs leading-relaxed text-slate-600">
        Only your name, rank, level, streak and XP are public. Workouts and personal bests stay
        private to your account.
      </p>
    </div>
  );
}

function RankMark({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-500 to-amber-400 text-ink-950 shadow-glow-ember">
        <Crown className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  if (rank === 2 || rank === 3) {
    return (
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-950 ${
          rank === 2
            ? 'bg-gradient-to-br from-slate-300 to-slate-400'
            : 'bg-gradient-to-br from-amber-700 to-amber-600'
        }`}
      >
        <Medal className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center font-mono text-xs font-semibold text-slate-600">
      {fmt(rank)}
    </span>
  );
}

function RowAvatar({ row }: { row: LeaderboardRow }) {
  const initials = (row.displayName || 'A')
    .split(' ')
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (row.photoURL) {
    return (
      <img
        src={row.photoURL}
        alt=""
        width={36}
        height={36}
        className="hidden h-9 w-9 shrink-0 rounded-full ring-1 ring-white/10 sm:block"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ink-700 to-ink-600 font-display text-[11px] font-bold text-slate-400 ring-1 ring-white/10 sm:flex"
      aria-hidden
    >
      {initials || 'A'}
    </div>
  );
}
