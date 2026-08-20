import { useEffect, useState } from 'react';
import { CalendarClock, Trophy } from 'lucide-react';

import type { LeaderboardRow, Profile } from '../../lib/types';
import { Card, CardHeader, EmptyState, SkeletonBlock } from '../ui/Primitives';
import { LeaderRow } from './LeaderRow';
import { StatReadout } from '../GameBits';
import { daysLeftInSeason, seasonIdFor, seasonLabel } from '../../lib/game/season';
import { fetchSeasonLadder, type FriendGraph } from '../../lib/social';
import { fmt } from '../../lib/safe';

/**
 * The current season: your counters, the global ladder and the same friends
 * re-sorted by season XP.
 */
export function SeasonPanel({
  profile,
  graph,
  meRow,
}: {
  profile: Profile;
  graph: FriendGraph;
  meRow: LeaderboardRow | null;
}) {
  const seasonId = seasonIdFor();
  const [ladder, setLadder] = useState<LeaderboardRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSeasonLadder(seasonId, 50)
      .then((rows) => {
        if (active) setLadder(rows);
      })
      .catch((error) => {
        console.error('[season] failed to load ladder', error);
        if (!active) return;
        setLadder([]);
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [seasonId, profile.season?.xp]);

  const friendLadder = [...graph.rows];
  if (meRow) friendLadder.push(meRow);
  friendLadder.sort((a, b) => b.seasonXp - a.seasonXp);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-content">
              <CalendarClock className="h-4 w-4 text-content-muted" aria-hidden />
              {seasonLabel(seasonId)}
            </h3>
            <p className="mt-1 text-xs text-content-muted">
              {fmt(daysLeftInSeason())} day{daysLeftInSeason() === 1 ? '' : 's'} left.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatReadout label="Season XP" value={fmt(profile.season?.xp ?? 0)} accent="text-forge" />
          <StatReadout label="Sessions" value={fmt(profile.season?.sessions ?? 0)} />
          <StatReadout label="Days left" value={fmt(daysLeftInSeason())} />
        </div>

        <p className="mt-4 text-xs leading-relaxed text-content-muted">
          A season resets a scoreboard, not a character. Lifetime XP, your level, stats, tier,
          coins, unlocks and personal bests carry over untouched — only the season counter above
          goes back to zero, and your final placement is kept on your profile forever.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Season ladder"
          subtitle="Every athlete, ranked by XP earned this season only."
          icon={<Trophy className="h-4 w-4" aria-hidden />}
        />
        {ladder === null ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-14" />
            ))}
          </div>
        ) : ladder.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-8 w-8" aria-hidden />}
            title={failed ? 'Season ladder unavailable' : 'Nobody has scored yet'}
            message={
              failed
                ? 'This ladder needs its composite index. Deploy firestore.indexes.json and give it a few minutes to build.'
                : 'Log a session to put the first name on the board.'
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {ladder.map((row, index) => (
              <LeaderRow
                key={row.uid}
                row={row}
                rank={index + 1}
                isMe={row.uid === profile.uid}
                scoreValue={row.seasonXp}
                scoreLabel="season XP"
              />
            ))}
          </ul>
        )}
      </Card>

      {friendLadder.length > 1 ? (
        <Card>
          <CardHeader
            title="Friends this season"
            subtitle="The same people, ranked on this season only."
            icon={<Trophy className="h-4 w-4" aria-hidden />}
          />
          <ul className="divide-y divide-line">
            {friendLadder.map((row, index) => (
              <LeaderRow
                key={row.uid}
                row={row}
                rank={index + 1}
                isMe={row.uid === profile.uid}
                scoreValue={row.seasonXp}
                scoreLabel="season XP"
              />
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
