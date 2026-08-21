import { useEffect, useState } from 'react';
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
import { Card, Chip, ProgressBar, usePrefersReducedMotion } from './ui/Primitives';

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
    <span className={`${cosmetic || 'text-content-strong'} ${className}`}>
      {name || 'Unnamed Athlete'}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Tier badge                                                                  */
/* -------------------------------------------------------------------------- */

export function TierBadge({ tierName, size = 'md' }: { tierName: unknown; size?: 'sm' | 'md' }) {
  const tier = tierByName(tierName);
  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full bg-gradient-to-r ${tier.gradient} ${padding} font-display font-semibold uppercase tracking-wider text-on-accent shadow-sm`}
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
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-content-muted">
            Level
          </span>
          <span className="font-display text-2xl font-bold leading-none text-content-strong">
            {progress.level}
          </span>
        </div>
        <span className="font-mono text-xs text-content-muted">
          {progress.isMax
            ? 'MAX LEVEL'
            : `${fmt(progress.xpIntoLevel)} / ${fmt(progress.xpForNext)} XP`}
        </span>
      </div>

      <ProgressBar
        value={progress.isMax ? 1 : progress.xpIntoLevel}
        max={progress.isMax ? 1 : progress.xpForNext}
        gradient="from-forge-vivid via-forge to-arcane"
        height={compact ? 'h-2' : 'h-3'}
        label={`Level ${progress.level} progress`}
      />

      {!compact ? (
        <p className="mt-2 text-xs text-content-muted">
          {progress.isMax
            ? 'You have reached the ceiling. The bar has nothing left to teach you.'
            : `${fmt(Math.max(0, progress.xpForNext - progress.xpIntoLevel))} XP to level ${progress.level + 1}`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The XP bar as a movement rather than a jump. Tweens lifetime XP and derives
 * the bar from it, so crossing a level renders as the bar filling, resetting
 * and continuing — which is what actually happened.
 */
export function AnimatedLevelBar({
  fromTotalXp,
  toTotalXp,
  durationMs = 1100,
}: {
  fromTotalXp: unknown;
  toTotalXp: unknown;
  durationMs?: number;
}) {
  const from = Math.max(0, num(fromTotalXp, 0));
  const to = Math.max(from, num(toTotalXp, from));
  const reduced = usePrefersReducedMotion();
  const [displayed, setDisplayed] = useState(reduced ? to : from);

  useEffect(() => {
    if (reduced || to <= from) {
      setDisplayed(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / Math.max(1, durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [from, to, durationMs, reduced]);

  const progress = levelProgress(displayed);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xs font-semibold uppercase tracking-widest text-content-muted">
            Level
          </span>
          <span className="font-display text-2xl font-bold leading-none text-content-strong">
            {progress.level}
          </span>
        </div>
        <span className="font-mono text-xs text-content-muted">
          {progress.isMax
            ? 'MAX LEVEL'
            : `${fmt(progress.xpIntoLevel)} / ${fmt(progress.xpForNext)} XP`}
        </span>
      </div>

      <ProgressBar
        value={progress.isMax ? 1 : progress.xpIntoLevel}
        max={progress.isMax ? 1 : progress.xpForNext}
        gradient="from-forge-vivid via-forge to-arcane"
        height="h-3"
        // The tween rewrites the width every frame; a 700ms CSS transition on
        // top of that would chase it and always arrive late.
        transition={false}
        label={`Level ${progress.level} progress`}
      />
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
        <span className="font-display text-[11px] font-semibold uppercase tracking-widest text-content-muted">
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
      <p className="mt-2 text-[11px] leading-tight text-content-subtle">{meta.label}</p>
    </Card>
  );
}

export function statGradient(statKey: StatKey): string {
  switch (statKey) {
    case 'strength':
      return 'from-ember-vivid to-ember';
    case 'endurance':
      return 'from-forge-vivid to-forge';
    case 'aesthetics':
      return 'from-vital-vivid to-vital';
    case 'discipline':
      return 'from-arcane-vivid to-arcane';
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
        <Trophy className="h-4 w-4 text-ember" aria-hidden />
        <p className="text-xs text-content-muted">
          <span className="font-semibold text-ember">Legend</span> — the highest rank. Nothing left
          above you.
        </p>
      </div>
    );
  }

  const span = Math.max(1, next.min - current.min);
  const into = Math.max(0, power - current.min);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-content-muted">
          Rank progress · <span className={current.text}>{current.name}</span>
        </span>
        <span className="font-mono text-content-muted">
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
      <p className="mt-2 text-xs text-content-muted">
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
            ? 'bg-ember/10 text-ember ring-ember/30'
            : 'bg-surface-hover text-content-muted ring-line-strong'
        }
      >
        <Flame className="h-3 w-3" aria-hidden />
        {fmt(streak)}-day streak
      </Chip>
      {shields > 0 ? (
        <Chip className="bg-forge/10 text-forge ring-forge/30">
          <Shield className="h-3 w-3" aria-hidden />
          {fmt(shields)}
        </Chip>
      ) : null}
    </div>
  );
}

export function CoinPill({ coins }: { coins: unknown }) {
  return (
    <Chip className="bg-warn/10 text-warn ring-warn/30">
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
  accent = 'text-content-strong',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-content-muted">
        {label}
      </p>
      <p className={`mt-1 font-display text-xl font-bold ${accent}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-content-subtle">{sub}</p> : null}
    </div>
  );
}

/** Percentage helper re-exported for views that render inline meters. */
export function meterPercent(value: unknown, max: unknown): number {
  return pct(num(value, 0), num(max, 0));
}
