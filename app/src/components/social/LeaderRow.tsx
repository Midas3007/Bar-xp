import type { ReactNode } from 'react';
import { Crown, Flame, Medal } from 'lucide-react';

import type { LeaderboardRow } from '../../lib/types';
import { NeonName, TierBadge } from '../GameBits';
import { fmt } from '../../lib/safe';

/**
 * One row of a ladder.
 *
 * Extracted so the global, friends and season ladders render identically —
 * three lists of the same thing must not drift into three visual styles.
 */
export function LeaderRow({
  row,
  rank,
  isMe,
  scoreValue,
  scoreLabel,
  action,
  onClick,
}: {
  row: LeaderboardRow;
  rank: number;
  isMe: boolean;
  /** The number this ladder ranks by — lifetime XP, or season XP. */
  scoreValue: number;
  scoreLabel: string;
  action?: ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <RankMark rank={rank} />
      <RowAvatar row={row} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold">
          {/* Cosmetics from other users' documents are only honoured when that
              user genuinely owns them. */}
          <NeonName
            name={row.displayName}
            activeCosmetic={row.activeCosmetic}
            ownedCosmetics={row.cosmetics}
          />
          {isMe ? <span className="ml-2 text-[11px] font-medium text-forge">you</span> : null}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <TierBadge tierName={row.tier} size="sm" />
          <span className="text-[11px] text-content-muted">Lv {fmt(row.level)}</span>
          {row.streak > 0 ? (
            <span className="flex items-center gap-1 text-[11px] text-ember/80">
              <Flame className="h-3 w-3" aria-hidden />
              {fmt(row.streak)}w
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-bold text-forge">{fmt(scoreValue)}</p>
        <p className="text-[11px] text-content-subtle">{scoreLabel}</p>
      </div>
    </>
  );

  const highlight = isMe ? 'bg-forge-vivid/[0.07] ring-1 ring-inset ring-forge/20' : '';

  return (
    <li className={`flex items-center gap-3 p-4 transition sm:gap-4 ${highlight}`}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-80 sm:gap-4"
        >
          {inner}
        </button>
      ) : (
        inner
      )}
      {action ? <div className="shrink-0">{action}</div> : null}
    </li>
  );
}

export function RankMark({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-warn-vivid to-warn text-on-accent shadow-glow-ember">
        <Crown className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  if (rank === 2 || rank === 3) {
    return (
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-accent ${
          rank === 2
            ? 'bg-gradient-to-br from-surface-strong to-surface-inset'
            : 'bg-gradient-to-br from-warn-vivid to-warn-vivid'
        }`}
      >
        <Medal className="h-4 w-4" aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center font-mono text-xs font-semibold text-content-subtle">
      {fmt(rank)}
    </span>
  );
}

export function RowAvatar({ row }: { row: LeaderboardRow }) {
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
        className="hidden h-9 w-9 shrink-0 rounded-full ring-1 ring-line-strong sm:block"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surface-strong to-surface-inset font-display text-[11px] font-bold text-content-muted ring-1 ring-line-strong sm:flex"
      aria-hidden
    >
      {initials || 'A'}
    </div>
  );
}
