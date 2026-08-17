import type { Profile } from '../types';
import { int, num } from '../safe';
import { TIERS } from './constants';

/**
 * Achievements are *derived*, never stored.
 *
 * Every badge is computed from data the profile already holds, which means no
 * schema change, no extra writes, no security rules to extend — and no way for
 * the badge list to drift out of sync with reality.
 */

export type AchievementIcon =
  | 'flame'
  | 'trophy'
  | 'dumbbell'
  | 'zap'
  | 'crown'
  | 'shield'
  | 'target'
  | 'sparkles';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: AchievementIcon;
  /** 0–1 completion. */
  progress: number;
  earned: boolean;
  /** Human-readable "12 / 50" style progress. */
  detail: string;
}

interface Threshold {
  id: string;
  name: string;
  description: string;
  icon: AchievementIcon;
  target: number;
  value: (p: Profile) => number;
  unit?: string;
}

const THRESHOLDS: Threshold[] = [
  {
    id: 'first_session',
    name: 'First Blood',
    description: 'Log your first session.',
    icon: 'dumbbell',
    target: 1,
    value: (p) => int(p.workoutCount, 0),
    unit: 'session',
  },
  {
    id: 'sessions_10',
    name: 'Regular',
    description: 'Log 10 sessions.',
    icon: 'dumbbell',
    target: 10,
    value: (p) => int(p.workoutCount, 0),
    unit: 'sessions',
  },
  {
    id: 'sessions_50',
    name: 'Committed',
    description: 'Log 50 sessions.',
    icon: 'dumbbell',
    target: 50,
    value: (p) => int(p.workoutCount, 0),
    unit: 'sessions',
  },
  {
    id: 'sessions_200',
    name: 'Lifer',
    description: 'Log 200 sessions.',
    icon: 'crown',
    target: 200,
    value: (p) => int(p.workoutCount, 0),
    unit: 'sessions',
  },
  {
    id: 'reps_1000',
    name: 'Thousand Club',
    description: 'Move 1,000 lifetime reps.',
    icon: 'zap',
    target: 1000,
    value: (p) => int(p.totalReps, 0),
    unit: 'reps',
  },
  {
    id: 'reps_10000',
    name: 'Five Figures',
    description: 'Move 10,000 lifetime reps.',
    icon: 'zap',
    target: 10000,
    value: (p) => int(p.totalReps, 0),
    unit: 'reps',
  },
  {
    id: 'streak_7',
    name: 'Disciplined',
    description: 'Hold a 7-day streak.',
    icon: 'flame',
    target: 7,
    value: (p) => int(p.streak?.best, 0),
    unit: 'days',
  },
  {
    id: 'streak_30',
    name: 'Unbreakable',
    description: 'Hold a 30-day streak.',
    icon: 'flame',
    target: 30,
    value: (p) => int(p.streak?.best, 0),
    unit: 'days',
  },
  {
    id: 'streak_100',
    name: 'Immortal',
    description: 'Hold a 100-day streak.',
    icon: 'crown',
    target: 100,
    value: (p) => int(p.streak?.best, 0),
    unit: 'days',
  },
  {
    id: 'level_10',
    name: 'Double Digits',
    description: 'Reach level 10.',
    icon: 'trophy',
    target: 10,
    value: (p) => int(p.level, 1),
  },
  {
    id: 'level_25',
    name: 'Veteran',
    description: 'Reach level 25.',
    icon: 'trophy',
    target: 25,
    value: (p) => int(p.level, 1),
  },
  {
    id: 'pullups_20',
    name: 'Bar Bender',
    description: 'Hit 20 pull-ups in a single set.',
    icon: 'target',
    target: 20,
    value: (p) => int(p.personalBests?.pull_up?.value, 0),
    unit: 'reps',
  },
  {
    id: 'pushups_50',
    name: 'Century Chest',
    description: 'Hit 50 push-ups in a single set.',
    icon: 'target',
    target: 50,
    value: (p) => int(p.personalBests?.push_up?.value, 0),
    unit: 'reps',
  },
  {
    id: 'plank_180',
    name: 'Immovable',
    description: 'Hold a plank for 3 minutes.',
    icon: 'shield',
    target: 180,
    value: (p) => int(p.personalBests?.plank?.value, 0),
    unit: 'sec',
  },
  {
    id: 'coins_5000',
    name: 'Wealthy',
    description: 'Bank 5,000 Bar Coins at once.',
    icon: 'sparkles',
    target: 5000,
    value: (p) => int(p.coins, 0),
    unit: 'coins',
  },
  {
    id: 'library_10',
    name: 'Well Rounded',
    description: 'Set a personal best in 10 different movements.',
    icon: 'sparkles',
    target: 10,
    value: (p) => Object.keys(p.personalBests ?? {}).length,
    unit: 'movements',
  },
];

/** Every achievement with its live progress, earned ones first. */
export function achievementsFor(profile: Profile): Achievement[] {
  const list: Achievement[] = THRESHOLDS.map((t) => {
    const value = Math.max(0, num(t.value(profile), 0));
    const target = Math.max(1, t.target);
    const earned = value >= target;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      icon: t.icon,
      progress: Math.min(1, value / target),
      earned,
      detail: earned
        ? 'Earned'
        : `${Math.floor(value).toLocaleString('en-US')} / ${target.toLocaleString('en-US')}${
            t.unit ? ` ${t.unit}` : ''
          }`,
    };
  });

  // A tier badge for whichever rank the athlete has actually reached.
  const tierIndex = TIERS.findIndex((t) => t.name === profile.tier);
  if (tierIndex > 0) {
    list.unshift({
      id: `tier_${profile.tier.toLowerCase()}`,
      name: `${profile.tier} Rank`,
      description: `Reach the ${profile.tier} tier.`,
      icon: 'crown',
      progress: 1,
      earned: true,
      detail: 'Earned',
    });
  }

  return list.sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    return b.progress - a.progress;
  });
}

export function earnedCount(achievements: Achievement[]): number {
  return achievements.filter((a) => a.earned).length;
}
