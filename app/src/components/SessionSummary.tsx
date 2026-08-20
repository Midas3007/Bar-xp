import { useEffect, useState, type CSSProperties } from 'react';
import { Coins, Share2, Sparkles, Trophy, Zap } from 'lucide-react';

import type { LogWorkoutResult } from '../lib/data';
import type { Profile } from '../lib/types';
import { fmt, fmtDecimal, str } from '../lib/safe';
import { streakMultiplier } from '../lib/game/streak';
import { isTierAchievement } from '../lib/game/achievements';
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  buildShareCardSvg,
  shareCardFilename,
  type ShareCardData,
} from '../lib/share/shareCard';
import { exportShareCard } from '../lib/share/exportCard';
import { useToast } from '../context/ToastContext';
import { Button, Spinner, usePrefersReducedMotion } from './ui/Primitives';
import { AnimatedLevelBar, NeonName, TierBadge } from './GameBits';
import { ICONS } from './Achievements';

/**
 * The screen a session ends on.
 *
 * Every number here comes from `result`, never from `profile`. The live
 * profile arrives through the Firestore listener and has already flipped to
 * post-session values by the time this mounts, so reading a figure off it
 * would make the whole "before" side of the screen wrong. `profile` is here
 * for identity alone — the display name and its cosmetic.
 */
export function SessionSummary({
  result,
  profile,
  onClose,
}: {
  result: LogWorkoutResult;
  profile: Profile;
  onClose: () => void;
}) {
  const toast = useToast();
  const reduced = usePrefersReducedMotion();
  const [sharing, setSharing] = useState(false);

  // Escape closes, and the page behind must not scroll while it is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const onShare = async () => {
    setSharing(true);
    try {
      const svg = buildShareCardSvg(shareDataFrom(result, profile));
      const outcome = await exportShareCard(
        svg,
        shareCardFilename(result.day),
        SHARE_CARD_WIDTH,
        SHARE_CARD_HEIGHT,
      );
      if (outcome === 'downloaded') toast.success('Card saved', 'Check your downloads.');
      if (outcome === 'failed') toast.error('Could not build the card', 'Try again in a moment.');
      // 'shared' and 'cancelled' say nothing: the share sheet is its own
      // feedback, and a dismissed sheet is not a failure.
    } finally {
      setSharing(false);
    }
  };

  // The session was scored with the *prior* streak — `logWorkout` advances the
  // streak only after scoring — so this is the multiplier that actually
  // applied. Showing the new one would make the three figures stop adding up.
  const multiplier = streakMultiplier(result.streakBefore);
  const badges = result.newAchievements.filter((a) => !isTierAchievement(a.id));

  // Sections fade in one after another. The delay is set in JS, so under
  // reduced motion it has to be dropped here: the global CSS rule shortens the
  // animation but leaves the delay, which would hold sections blank instead.
  let order = 0;
  const stagger = (): CSSProperties | undefined => {
    const style = reduced ? undefined : { animationDelay: `${order * 60}ms` };
    order += 1;
    return style;
  };
  const panel = `rounded-2xl border border-line bg-surface-sunken/70 p-5 ${
    reduced ? '' : 'animate-fade-up'
  }`;

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-surface-base/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-summary-title"
    >
      <div className="mx-auto flex min-h-full max-w-lg flex-col justify-center gap-4 px-5 py-10">
        {/* One static line for assistive tech, since the figures above it move. */}
        <p className="sr-only">
          Session complete. {fmt(result.xpEarned)} XP and {fmt(result.coinsEarned)} Bar Coins
          earned. Level {fmt(result.newLevel)}.
        </p>

        <div className={reduced ? '' : 'animate-fade-up'} style={stagger()}>
          <h2
            id="session-summary-title"
            className="font-display text-3xl font-bold tracking-tight text-content-strong"
          >
            Session complete
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            <NeonName
              name={str(profile.displayName, 'Athlete')}
              activeCosmetic={profile.activeCosmetic}
              ownedCosmetics={profile.inventory?.cosmetics}
            />{' '}
            · {fmt(result.entryCount)} movement{result.entryCount === 1 ? '' : 's'} ·{' '}
            {fmt(result.totalReps)} reps
          </p>
        </div>

        <div className={panel} style={stagger()}>
          <p
            aria-hidden="true"
            className="bg-gradient-to-r from-forge-vivid to-arcane bg-clip-text font-display text-5xl font-bold text-transparent"
          >
            +{fmt(result.xpEarned)} XP
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Base" value={`${fmt(result.baseXp)} XP`} />
            <Row
              label={`Streak bonus (${fmt(result.streak)} day${
                result.streak === 1 ? '' : 's'
              } · ×${fmtDecimal(multiplier, 2)})`}
              value={`+${fmt(result.streakBonusXp)} XP`}
            />
            {result.goalRewardXp > 0 ? (
              <Row label="Goal rewards" value={`+${fmt(result.goalRewardXp)} XP`} />
            ) : null}
          </dl>
        </div>

        <div className={panel} style={stagger()}>
          {result.levelsGained > 0 ? (
            <div className="mb-4 flex items-start gap-3 rounded-xl bg-forge/10 p-3 ring-1 ring-inset ring-forge/30">
              <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-forge" />
              <div>
                <p className="font-display font-semibold text-content-strong">
                  Level {fmt(result.newLevel)} reached
                </p>
                <p className="mt-0.5 text-xs text-content-muted">
                  {result.levelsGained > 1
                    ? `${fmt(result.levelsGained)} levels in one session. New movements may have unlocked in the logger.`
                    : 'New movements may have unlocked in the logger.'}
                </p>
              </div>
            </div>
          ) : null}
          <AnimatedLevelBar fromTotalXp={result.totalXpBefore} toTotalXp={result.totalXpAfter} />
        </div>

        {result.tierChanged ? (
          <div className={panel} style={stagger()}>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-content-muted">
              New rank
            </p>
            <div className="mt-2 flex items-center gap-3">
              <TierBadge tierName={result.tierBefore} size="sm" />
              <span aria-hidden="true" className="text-content-subtle">
                &rarr;
              </span>
              <TierBadge tierName={result.newTier} />
            </div>
          </div>
        ) : null}

        <div className={panel} style={stagger()}>
          <div className="flex items-center gap-3">
            <Coins className="h-5 w-5 shrink-0 text-warn" />
            <p className="font-display text-lg font-semibold text-content-strong">
              +{fmt(result.coinsEarned)} Bar Coins
            </p>
          </div>
          {result.goalRewardCoins > 0 ? (
            <p className="mt-1 text-xs text-content-muted">
              {fmt(result.sessionCoins)} from the session · {fmt(result.goalRewardCoins)} from goals
            </p>
          ) : null}
        </div>

        {result.completedGoals.length > 0 ? (
          <div className={panel} style={stagger()}>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-content-muted">
              Goal{result.completedGoals.length === 1 ? '' : 's'} complete
            </p>
            <ul className="mt-2 space-y-2">
              {result.completedGoals.map((goal, i) => (
                <li
                  key={`${goal.title}-${i}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="text-sm text-content">{goal.title}</span>
                  <span className="shrink-0 font-mono text-xs text-content-muted">
                    +{fmt(goal.rewardXp)} XP · +{fmt(goal.rewardCoins)} coins
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {result.newPersonalBests.length > 0 ? (
          <div className={panel} style={stagger()}>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-content-muted">
              Personal best{result.newPersonalBests.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-2 space-y-2">
              {result.newPersonalBests.map((pb) => (
                <li key={pb.exerciseId} className="flex items-baseline justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-content">
                    <Zap className="h-4 w-4 shrink-0 text-warn" />
                    {pb.exerciseName}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-content-muted">
                    {fmt(pb.value)} {pb.unit === 'seconds' ? 'sec' : 'reps'}
                    <span className="text-content-subtle"> · beat {fmt(pb.previousValue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {badges.length > 0 ? (
          <div className={panel} style={stagger()}>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-content-muted">
              Achievement{badges.length === 1 ? '' : 's'} unlocked
            </p>
            <ul className="mt-2 space-y-3">
              {badges.map((badge) => {
                const Icon = ICONS[badge.icon] ?? Sparkles;
                return (
                  <li key={badge.id} className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-arcane-vivid/15 ring-1 ring-inset ring-arcane/30">
                      <Icon className="h-4 w-4 text-arcane" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-content-strong">{badge.name}</p>
                      <p className="text-xs text-content-muted">{badge.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div
          className={`mt-2 flex gap-3 ${reduced ? '' : 'animate-fade-up'}`}
          style={stagger()}
        >
          <Button variant="secondary" className="flex-1" onClick={onShare} disabled={sharing}>
            {sharing ? <Spinner className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            Share card
          </Button>
          {/* Autofocused rather than ref-focused: `Button` does not forward a
              ref, and keyboard users should land on the way out either way. */}
          <Button className="flex-1" onClick={onClose} autoFocus>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-content-muted">{label}</dt>
      <dd className="shrink-0 font-mono text-content">{value}</dd>
    </div>
  );
}

/**
 * Everything the card draws, with the highlight lines in priority order.
 *
 * `buildShareCardSvg` does the truncating and the capping; this only decides
 * what matters most when there is more of it than fits.
 */
function shareDataFrom(result: LogWorkoutResult, profile: Profile): ShareCardData {
  const highlights: string[] = [];
  if (result.levelsGained > 0) highlights.push(`Level ${fmt(result.newLevel)} reached`);
  if (result.tierChanged) highlights.push(`New rank — ${result.newTier}`);
  for (const goal of result.completedGoals) highlights.push(`Goal — ${goal.title}`);
  for (const pb of result.newPersonalBests) {
    highlights.push(
      `PR — ${pb.exerciseName}, ${fmt(pb.value)} ${pb.unit === 'seconds' ? 'sec' : 'reps'}`,
    );
  }
  for (const badge of result.newAchievements) {
    if (!isTierAchievement(badge.id)) highlights.push(badge.name);
  }

  return {
    athlete: str(profile.displayName, 'Athlete'),
    day: result.day,
    level: result.newLevel,
    tier: result.newTier,
    xpEarned: result.xpEarned,
    baseXp: result.baseXp,
    streakBonusXp: result.streakBonusXp,
    coinsEarned: result.coinsEarned,
    streakWeeks: result.streak,
    totalReps: result.totalReps,
    movements: result.movementNames,
    highlights,
  };
}
