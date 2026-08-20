import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Coins,
  Dumbbell,
  Flame,
  Info,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';

import type { Profile, Workout } from '../lib/types';
import type { ViewKey } from '../components/layout/AppShell';
import { Button, Card, CardHeader, EmptyState, ProgressBar, SkeletonBlock } from '../components/ui/Primitives';
import {
  IdentityChip,
  LevelBar,
  NeonName,
  StatGrid,
  StatReadout,
  StreakPill,
  TierBadge,
  TierProgress,
} from '../components/GameBits';
import { fmt, fmtDecimal, int, arr } from '../lib/safe';
import { identityForStreak, tierByName } from '../lib/game/constants';
import { goalPercent } from '../lib/game/goals';
import { streakMultiplier } from '../lib/game/xp';
import { trainedToday } from '../lib/game/streak';
import { fetchWorkouts } from '../lib/data';
import { useAuth } from '../context/AuthContext';

export function DashboardView({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (view: ViewKey) => void;
}) {
  const { backgroundNotice, dismissBackgroundNotice } = useAuth();
  const [recent, setRecent] = useState<Workout[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchWorkouts(profile.uid, 5)
      .then((workouts) => {
        if (active) setRecent(workouts);
      })
      .catch((error) => {
        console.error('[dashboard] failed to load recent workouts', error);
        if (active) setRecent([]);
      });
    return () => {
      active = false;
    };
    // Refetch when the workout count changes so a new session appears at once.
  }, [profile.uid, profile.workoutCount]);

  const tier = tierByName(profile.tier);
  const identity = identityForStreak(profile.streak.current);
  const multiplier = streakMultiplier(profile.streak.current);
  const didTrainToday = trainedToday(profile.streak);
  const goals = arr<Profile['goals'][number]>(profile.goals);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* --- Background notice (streak shield consumed, rank recalculated) --- */}
      {backgroundNotice ? (
        <div className="flex animate-fade-up items-start gap-3 rounded-2xl bg-forge-500/10 p-4 ring-1 ring-forge-500/25">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-forge-300" aria-hidden />
          <p className="flex-1 text-sm leading-relaxed text-forge-100">{backgroundNotice}</p>
          <button
            type="button"
            onClick={dismissBackgroundNotice}
            className="text-xs font-medium text-forge-300 transition hover:text-forge-200"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* --- Hero --- */}
      <Card className="overflow-hidden" glow>
        <div
          className="relative p-6 sm:p-8"
          style={{
            background:
              'radial-gradient(600px 300px at 0% 0%, rgba(56,189,248,0.10), transparent 65%)',
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-slate-500">
                {didTrainToday ? 'Session logged today' : 'Ready to train'}
              </p>
              <h1 className="mt-1.5 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                <NeonName
                  name={profile.displayName}
                  activeCosmetic={profile.activeCosmetic}
                  ownedCosmetics={profile.inventory.cosmetics}
                />
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <TierBadge tierName={profile.tier} />
                <IdentityChip streak={profile.streak.current} />
                <StreakPill profile={profile} />
              </div>
            </div>

            <Button onClick={() => onNavigate('workout')} size="lg">
              <Dumbbell className="h-4 w-4" aria-hidden />
              {didTrainToday ? 'Log another session' : 'Start training'}
            </Button>
          </div>

          <p className="mt-4 max-w-xl text-sm italic leading-relaxed text-slate-500">
            {identity.blurb} {tier.blurb}
          </p>

          <div className="mt-7">
            <LevelBar totalXp={profile.totalXp} />
          </div>

          <div className="mt-7 grid grid-cols-2 gap-5 border-t border-white/5 pt-6 sm:grid-cols-4">
            <StatReadout
              label="Total XP"
              value={fmt(profile.totalXp)}
              sub="lifetime"
              accent="text-forge-300"
            />
            <StatReadout
              label="Bar Coins"
              value={fmt(profile.coins)}
              sub="spendable"
              accent="text-amber-300"
            />
            <StatReadout
              label="Sessions"
              value={fmt(profile.workoutCount)}
              sub={`${fmt(profile.totalReps)} reps moved`}
            />
            <StatReadout
              label="XP Multiplier"
              value={`${fmtDecimal(multiplier, 2)}×`}
              sub={
                multiplier > 1
                  ? `from a ${fmt(profile.streak.current)}-day streak`
                  : 'train today to start one'
              }
              accent={multiplier > 1 ? 'text-ember-300' : 'text-slate-400'}
            />
          </div>
        </div>
      </Card>

      {/* --- Stats --- */}
      <div>
        <SectionTitle
          icon={<Zap className="h-4 w-4" aria-hidden />}
          title="Core Stats"
          action={
            <button
              type="button"
              onClick={() => onNavigate('progress')}
              className="inline-flex items-center gap-1 text-xs font-medium text-forge-300 transition hover:text-forge-200"
            >
              View progression
              <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
          }
        />
        <StatGrid stats={profile.stats} />
        <Card className="mt-3 p-5">
          <TierProgress stats={profile.stats} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* --- Active goals --- */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader
              title="Active Goals"
              subtitle="Completed goals pay out instantly and are replaced."
              icon={<Target className="h-4 w-4" aria-hidden />}
            />
            <div className="divide-y divide-white/5">
              {goals.length === 0 ? (
                <EmptyState
                  icon={<Target className="h-8 w-8" aria-hidden />}
                  title="No active goals"
                  message="Log your first session and a fresh set of goals will be rolled for you."
                />
              ) : (
                goals.map((goal) => {
                  const percent = goalPercent(goal);
                  return (
                    <div key={goal.id} className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-100">{goal.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                            {goal.description}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-mono text-xs text-slate-400">
                            {fmt(goal.progress)} / {fmt(goal.target)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-amber-400/80">
                            +{fmt(goal.rewardXp)} XP · +{fmt(goal.rewardCoins)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <ProgressBar
                          value={goal.progress}
                          max={goal.target}
                          gradient={
                            percent >= 100
                              ? 'from-vital-500 to-vital-300'
                              : 'from-arcane-500 to-forge-400'
                          }
                          height="h-2"
                          label={goal.title}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* --- Recent sessions --- */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader
              title="Recent Sessions"
              subtitle="Your last five logged workouts."
              icon={<Flame className="h-4 w-4" aria-hidden />}
            />
            {recent === null ? (
              <div className="space-y-2 p-5">
                <SkeletonBlock className="h-14" />
                <SkeletonBlock className="h-14" />
                <SkeletonBlock className="h-14" />
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                icon={<Dumbbell className="h-8 w-8" aria-hidden />}
                title="Nothing logged yet"
                message="Your first session is the hardest one to start and the easiest one to win."
                action={
                  <Button onClick={() => onNavigate('workout')} size="sm">
                    Log a workout
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-white/5">
                {recent.map((workout) => (
                  <li key={workout.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">
                        {arr(workout.entries).length} exercise
                        {arr(workout.entries).length === 1 ? '' : 's'} ·{' '}
                        {fmt(workout.totalVolume)} units
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-600">
                        {formatDay(workout.day)} ·{' '}
                        {arr<{ exerciseName: string }>(workout.entries)
                          .slice(0, 2)
                          .map((e) => e.exerciseName)
                          .join(', ') || 'Session'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-semibold text-forge-300">
                        +{fmt(workout.xpEarned)}
                      </p>
                      <p className="flex items-center justify-end gap-1 text-[11px] text-amber-400/80">
                        <Coins className="h-3 w-3" aria-hidden />
                        {fmt(workout.coinsEarned)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* --- Footer nudges --- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <NudgeCard
          icon={<Trophy className="h-5 w-5" aria-hidden />}
          title="See where you rank"
          body="Every athlete on Bar XP, sorted by lifetime XP."
          cta="Open leaderboard"
          onClick={() => onNavigate('leaderboard')}
        />
        <NudgeCard
          icon={<Coins className="h-5 w-5" aria-hidden />}
          title={`${fmt(profile.coins)} Bar Coins ready to spend`}
          body="Streak Shields, name cosmetics, and early access to advanced movements."
          cta="Visit the shop"
          onClick={() => onNavigate('shop')}
        />
      </div>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <h2 className="font-display text-sm font-semibold uppercase tracking-widest">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function NudgeCard({
  icon,
  title,
  body,
  cta,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <Card className="group cursor-pointer p-5 transition hover:ring-white/10" >
      <button type="button" onClick={onClick} className="flex w-full items-start gap-4 text-left">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-forge-300 ring-1 ring-white/10">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{body}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-forge-300 transition group-hover:gap-1.5">
            {cta}
            <ArrowRight className="h-3 w-3" aria-hidden />
          </span>
        </div>
      </button>
    </Card>
  );
}

/** `YYYY-MM-DD` -> a short readable label, tolerant of malformed values. */
function formatDay(day: unknown): string {
  const value = typeof day === 'string' ? day : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'Recently';

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return 'Recently';

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((startOfToday.getTime() - date.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${int(diffDays, 0)} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
