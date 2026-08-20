import { History } from 'lucide-react';

import type { Profile } from '../../lib/types';
import { Card, CardHeader, Chip, EmptyState } from '../ui/Primitives';
import { seasonLabel } from '../../lib/game/season';
import { fmt } from '../../lib/safe';

/**
 * Finished seasons, kept permanently.
 *
 * A season resets the scoreboard; this is the part that does not go away.
 */
export function SeasonHistoryCard({ profile }: { profile: Profile }) {
  const history = profile.seasonHistory ?? [];

  return (
    <Card>
      <CardHeader
        title="Season History"
        subtitle="Where you finished, kept for good."
        icon={<History className="h-4 w-4" aria-hidden />}
      />
      {history.length === 0 ? (
        <EmptyState
          title="No finished seasons yet"
          message="Your placement appears here once the current season ends."
        />
      ) : (
        <ul className="divide-y divide-line">
          {history.map((record) => (
            <li key={record.id} className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">
                  {seasonLabel(record.id)}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-content-subtle">
                  {fmt(record.xp)} XP · {fmt(record.sessions)} session
                  {record.sessions === 1 ? '' : 's'}
                </p>
              </div>
              <div className="shrink-0">
                {record.pending ? (
                  <Chip>Tallying</Chip>
                ) : record.rank > 0 ? (
                  <span className="font-mono text-sm font-bold text-forge">
                    #{fmt(record.rank)}
                    <span className="ml-1 text-[11px] font-normal text-content-subtle">
                      of {fmt(record.entrants)}
                    </span>
                  </span>
                ) : (
                  <Chip>Unranked</Chip>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
