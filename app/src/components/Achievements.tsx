import {
  Crown,
  Dumbbell,
  Flame,
  Medal,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';

import type { Profile } from '../lib/types';
import { Card, CardHeader } from './ui/Primitives';
import { achievementsFor, earnedCount, type AchievementIcon } from '../lib/game/achievements';
import { fmt, pct } from '../lib/safe';

/** Shared with `SessionSummary`, which announces newly earned badges. */
export const ICONS: Record<AchievementIcon, typeof Flame> = {
  flame: Flame,
  trophy: Trophy,
  dumbbell: Dumbbell,
  zap: Zap,
  crown: Crown,
  shield: Shield,
  target: Target,
  sparkles: Sparkles,
};

export function Achievements({ profile }: { profile: Profile }) {
  const achievements = achievementsFor(profile);
  const earned = earnedCount(achievements);

  return (
    <Card>
      <CardHeader
        title="Achievements"
        subtitle={`${fmt(earned)} of ${fmt(achievements.length)} earned`}
        icon={<Medal className="h-4 w-4" aria-hidden />}
      />
      <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3">
        {achievements.map((achievement) => {
          const Icon = ICONS[achievement.icon];
          return (
            <div
              key={achievement.id}
              className={`relative overflow-hidden rounded-xl p-3 ring-1 transition ${
                achievement.earned
                  ? 'bg-gradient-to-br from-warn-vivid/15 to-ember/5 ring-warn/30'
                  : 'bg-surface-sunken/50 ring-line'
              }`}
              title={achievement.description}
            >
              <Icon
                className={`h-5 w-5 ${achievement.earned ? 'text-warn' : 'text-content-faint'}`}
                aria-hidden
              />
              <p
                className={`mt-2 font-display text-xs font-bold leading-tight ${
                  achievement.earned ? 'text-content-strong' : 'text-content-muted'
                }`}
              >
                {achievement.name}
              </p>
              <p className="mt-0.5 text-[10px] leading-tight text-content-subtle">
                {achievement.description}
              </p>
              <p
                className={`mt-1.5 font-mono text-[10px] ${
                  achievement.earned ? 'text-warn/80' : 'text-content-subtle'
                }`}
              >
                {achievement.detail}
              </p>

              {/* Progress sliver along the bottom of unearned badges. */}
              {!achievement.earned ? (
                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-base">
                  <div
                    className="h-full bg-forge/60"
                    style={{ width: `${pct(achievement.progress, 1)}%` }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
