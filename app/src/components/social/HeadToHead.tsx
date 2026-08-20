import { Swords, X } from 'lucide-react';

import type { LeaderboardRow, Profile } from '../../lib/types';
import type { FriendCard } from '../../lib/game/friends';
import { Card } from '../ui/Primitives';
import { TierBadge, meterPercent } from '../GameBits';
import { STAT_KEYS, STAT_META } from '../../lib/game/constants';
import { addDays, dayKey } from '../../lib/game/streak';
import { fmt, num } from '../../lib/safe';

/**
 * You against one friend.
 *
 * Reads only the friend card — the consent-gated projection. Nothing from
 * `workouts`, `personalBests`, `assessment`, `bodyFat`, `measurements` or
 * `muscleVolume` appears here, and the card cannot carry them.
 */
export function HeadToHead({
  profile,
  row,
  card,
  onClose,
}: {
  profile: Profile;
  row: LeaderboardRow | null;
  card: FriendCard | null;
  onClose: () => void;
}) {
  if (!row) return null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 border-b border-white/5 p-5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
            <Swords className="h-4 w-4 text-slate-500" aria-hidden />
            Head to head
          </h3>
          <p className="mt-1 truncate text-xs text-slate-500">
            {profile.displayName} versus {row.displayName}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-600 transition hover:text-slate-200"
          aria-label="Close comparison"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* --- Header: level, XP, tier from the public row --- */}
      <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5">
        <HeaderSide
          name={profile.displayName}
          level={profile.level}
          totalXp={profile.totalXp}
          tier={profile.tier}
        />
        <HeaderSide
          name={row.displayName}
          level={row.level}
          totalXp={row.totalXp}
          tier={row.tier}
        />
      </div>

      {card ? (
        <div className="space-y-5 p-5">
          {STAT_KEYS.map((key) => {
            const mine = Math.max(0, num(profile.stats?.[key], 0));
            const theirs = Math.max(0, num(card.stats?.[key], 0));
            const max = Math.max(mine, theirs);
            const meta = STAT_META[key];
            return (
              <div key={key}>
                <p className="mb-1.5 text-center font-display text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  {meta.label}
                </p>
                <div className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-right font-mono text-xs text-slate-300">
                    {fmt(mine)}
                  </span>
                  {/* Mirrored bars, so the longer one is visibly the winner
                      without needing to read either number. */}
                  <div className="flex h-2 flex-1 justify-end overflow-hidden rounded-full bg-ink-950">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${meterPercent(mine, max)}%`,
                        backgroundColor: meta.hex,
                      }}
                    />
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-950">
                    <div
                      className="h-full rounded-full opacity-60"
                      style={{
                        width: `${meterPercent(theirs, max)}%`,
                        backgroundColor: meta.hex,
                      }}
                    />
                  </div>
                  <span className="w-12 shrink-0 font-mono text-xs text-slate-300">
                    {fmt(theirs)}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/5 pt-5">
            <Compare label="Lifetime reps" mine={profile.totalReps} theirs={card.totalReps} />
            <Compare label="Sessions" mine={profile.workoutCount} theirs={card.workoutCount} />
            <Compare
              label="Streak"
              mine={profile.streak?.current}
              theirs={card.streak}
              suffix="w"
            />
            <Compare
              label="Best streak"
              mine={profile.streak?.best}
              theirs={card.bestStreak}
              suffix="w"
            />
          </div>

          <div className="border-t border-white/5 pt-5">
            <p className="mb-2 font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Last 14 days
            </p>
            <ActivityStrip label="You" days={profile.recentDays} />
            <ActivityStrip label={row.displayName} days={card.recentDays} />
          </div>
        </div>
      ) : (
        <div className="p-5">
          <p className="text-xs leading-relaxed text-slate-500">
            {row.displayName} has not opened the app since comparisons were added, so only their
            public rank is available. The rest appears the next time they do.
          </p>
        </div>
      )}
    </Card>
  );
}

function HeaderSide({
  name,
  level,
  totalXp,
  tier,
}: {
  name: string;
  level: number;
  totalXp: number;
  tier: string;
}) {
  return (
    <div className="p-4 text-center">
      <p className="truncate text-sm font-semibold text-slate-200">{name}</p>
      <p className="mt-1 font-display text-2xl font-bold text-forge-300">{fmt(totalXp)}</p>
      <p className="text-[11px] text-slate-600">XP · Lv {fmt(level)}</p>
      <div className="mt-2 flex justify-center">
        <TierBadge tierName={tier} size="sm" />
      </div>
    </div>
  );
}

function Compare({
  label,
  mine,
  theirs,
  suffix = '',
}: {
  label: string;
  mine: unknown;
  theirs: unknown;
  suffix?: string;
}) {
  const a = Math.max(0, num(mine, 0));
  const b = Math.max(0, num(theirs, 0));
  const ahead = a > b ? 'left' : b > a ? 'right' : 'tie';
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={`font-mono text-sm ${ahead === 'left' ? 'font-bold text-vital-300' : 'text-slate-400'}`}
      >
        {fmt(a)}
        {suffix}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-slate-600">{label}</span>
      <span
        className={`font-mono text-sm ${ahead === 'right' ? 'font-bold text-vital-300' : 'text-slate-400'}`}
      >
        {fmt(b)}
        {suffix}
      </span>
    </div>
  );
}

/** Fourteen boxes, oldest on the left, filled where a session was logged. */
function ActivityStrip({ label, days }: { label: string; days: unknown }) {
  const trained = new Set(Array.isArray(days) ? days.map((d) => String(d)) : []);
  const today = dayKey();
  const cells = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="w-20 shrink-0 truncate text-[11px] text-slate-500">{label}</span>
      <div className="flex flex-1 gap-1">
        {cells.map((day) => (
          <div
            key={day}
            title={day}
            className={`h-4 flex-1 rounded-sm ${
              trained.has(day) ? 'bg-forge-500' : 'bg-ink-900 ring-1 ring-inset ring-white/5'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
