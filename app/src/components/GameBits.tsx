import { Coins, Flame, Shield, Trophy } from 'lucide-react';

import type { Profile, StatKey, Stats } from '../lib/types';
import { fmt, fmtDecimal, int, num, pct } from '../lib/safe';
import {
  STAT_META,
  identityForStreak,
  levelProgress,
  nextTier,
  statPower,
  tierByName,
  tierForStats,
} from '../lib/game/constants';
import { cosmeticNameClass } from '../lib/game/shop';
import { Card, Chip, ProgressBar } from './ui/Primitives';

/* -------------------------------------------------------------------------- */
/* Cosmetic-aware display name                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Renders a display name with the owner's active cosmetic applied.
 *
 * Used on the dashboard, profile *and* leaderboard — the leaderboard passes
 * another user's cosmetic data, and `cosmeticNameClass` verifies ownership
 * before applying anything, so a doctored document cannot mint a cosmetic.
 */
export function NeonName({
  name,
  activeCosmetic,
  ownedCosmetics,
  className = '',
}: {
  name: string;
  activeCosmetic: unknown;
  ownedCosmetics: unknown;
  className?: string;
}) {
  const cosmetic = cosmeticNameClass(activeCosmetic, ownedCosmetics);
  return (
    <span className={`${cosmetic || 'text-slate-100'} ${className}`}>
      {name || 'Unnamed Athlete'}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Tier badge                                                                  */
/* -------------------------------------------------------------------------- */

export function TierBadge({
  tierName,
  size = 'md',
}: {
  tierName: unknown;
  size?: 'sm' | 'md';
}) {
  const tier = tierByName(tierName);
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full bg-gradient-to-r ${tier.gradient} ${padding} font-display font-semibold uppercase tracking-wider text-ink-950 shadow-sm`}
    >
      {tier.name}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Identity chip                                                               */
/* -------------------------------------------------------------------------- */

export function IdentityChip({ streak }: { streak: unknown }) {
  const identity = identityForStreak(streak);
  return (
    <Chip className={`${identity.bg} ${identity.text}`}>
      <Flame className="h-3 w-3" aria-hidden />
      {identity.label}
    </Chip>
  );
}

/* -------------------------------------------------------------------------- */
/* Level + XP bar                                                              */
/* -------------------------------------------------------------------------- */

export function LevelBar({ totalXp, compact = false }: { totalXp: unknown; compact?: boolean }) {
  const progress = levelProgress(totalXp);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-slate-500">
            Level
          </span>
          <span className="font-display text-2xl font-bold leading-none text-slate-50">
            {progress.level}
          </span>
        </div>
        <span className="font-mono text-xs text-slate-500">
          {progress.isMax
            ? 'MAX LEVEL'
            : `${fmt(progress.xpIntoLevel)} / ${fmt(progress.xpForNext)} XP`}
        </span>
      </div>

      <ProgressBar
        value={progress.isMax ? 1 : progress.xpIntoLevel}
        max={progress.isMax ? 1 : progress.xpForNext}
        gradient="from-forge-500 via-forge-400 to-arcane-400"
        height={compact ? 'h-2' : 'h-3'}
        label={`Level ${progress.level} progress`}
      />

      {!compact ? (
        <p className="mt-2 text-xs text-slate-500">
          {progress.isMax
            ? 'You have reached the ceiling. The bar has nothing left to teach you.'
            : `${fmt(Math.max(0, progress.xpForNext - progress.xpIntoLevel))} XP to level ${progress.level + 1}`}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat display                                                                */
/* -------------------------------------------------------------------------- */

/** The stat value scale used for the bars — purely a display ceiling. */
const STAT_DISPLAY_MAX = 250;

export function StatCard({ statKey, value }: { statKey: StatKey; value: unknown }) {
  const meta = STAT_META[statKey];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          {meta.short}
        </span>
        <span className={`font-display text-xl font-bold leading-none ${meta.color}`}>
          {fmtDecimal(value, 1)}
        </span>
      </div>
      <div className="mt-3">
        <ProgressBar
          value={value}
          max={STAT_DISPLAY_MAX}
          gradient={statGradient(statKey)}
          height="h-1.5"
          animated={false}
          label={meta.label}
        />
      </div>
      <p className="mt-2 text-[11px] leading-tight text-slate-600">{meta.label}</p>
    </Card>
  );
}

export function statGradient(statKey: StatKey): string {
  switch (statKey) {
    case 'strength':
      return 'from-ember-500 to-ember-300';
    case 'endurance':
      return 'from-forge-500 to-forge-300';
    case 'aesthetics':
      return 'from-vital-500 to-vital-300';
    case 'discipline':
      return 'from-arcane-500 to-arcane-300';
  }
}

export function StatGrid({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard statKey="strength" value={stats.strength} />
      <StatCard statKey="endurance" value={stats.endurance} />
      <StatCard statKey="aesthetics" value={stats.aesthetics} />
      <StatCard statKey="discipline" value={stats.discipline} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rank progression                                                            */
/* -------------------------------------------------------------------------- */

export function TierProgress({ stats }: { stats: Stats }) {
  const current = tierForStats(stats);
  const next = nextTier(current);
  const power = statPower(stats);

  if (!next) {
    return (
      <div className="flex items-center gap-3">
        <Trophy className="h-4 w-4 text-orange-400" aria-hidden />
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-orange-300">Legend</span> — the highest rank. Nothing
          left above you.
        </p>
      </div>
    );
  }

  const span = Math.max(1, next.min - current.min);
  const into = Math.max(0, power - current.min);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-slate-500">
          Rank progress · <span className={current.text}>{current.name}</span>
        </span>
        <span className="font-mono text-slate-500">
          {fmtDecimal(power, 1)} / {fmt(next.min)}
        </span>
      </div>
      <ProgressBar
        value={into}
        max={span}
        gradient={`bg-gradient-to-r ${next.gradient}`.replace('bg-gradient-to-r ', '')}
        height="h-1.5"
        animated={false}
        label={`Progress to ${next.name}`}
      />
      <p className="mt-2 text-xs text-slate-500">
        {fmtDecimal(Math.max(0, next.min - power), 1)} average stat points to{' '}
        <span className={next.text}>{next.name}</span>.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Small readouts                                                              */
/* -------------------------------------------------------------------------- */

export function StreakPill({ profile }: { profile: Profile }) {
  const streak = Math.max(0, int(profile.streak?.current, 0));
  const shields = Math.max(0, int(profile.inventory?.streakShields, 0));

  return (
    <div className="flex items-center gap-2">
      <Chip
        className={
          streak > 0
            ? 'bg-ember-500/10 text-ember-300 ring-ember-500/30'
            : 'bg-slate-500/10 text-slate-400 ring-slate-500/30'
        }
      >
        <Flame className="h-3 w-3" aria-hidden />
        {fmt(streak)}-day streak
      </Chip>
      {shields > 0 ? (
        <Chip className="bg-forge-500/10 text-forge-300 ring-forge-500/30">
          <Shield className="h-3 w-3" aria-hidden />
          {fmt(shields)}
        </Chip>
      ) : null}
    </div>
  );
}

export function CoinPill({ coins }: { coins: unknown }) {
  return (
    <Chip className="bg-amber-500/10 text-amber-300 ring-amber-500/30">
      <Coins className="h-3 w-3" aria-hidden />
      {fmt(coins)}
    </Chip>
  );
}

/** A compact labelled figure used across the dashboard and profile headers. */
export function StatReadout({
  label,
  value,
  sub,
  accent = 'text-slate-100',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p className={`mt-1 font-display text-xl font-bold ${accent}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-slate-600">{sub}</p> : null}
    </div>
  );
}

/** Percentage helper re-exported for views that render inline meters. */
export function meterPercent(value: unknown, max: unknown): number {
  return pct(num(value, 0), num(max, 0));
}
