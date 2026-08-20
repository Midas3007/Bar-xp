import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  ChevronDown,
  History,
  LineChart as LineChartIcon,
  Percent,
  TrendingUp,
} from 'lucide-react';

import type { Profile, StatsSnapshot, Workout } from '../lib/types';
import { Card, CardHeader, EmptyState, SkeletonBlock } from '../components/ui/Primitives';
import { STAT_META } from '../lib/game/constants';
import { fetchStatsHistory, fetchWorkouts } from '../lib/data';
import { fmt, fmtDecimal, num, round } from '../lib/safe';
import { formatSetLadder } from '../lib/game/sets';

/** Chart palette, aligned with the stat colors used across the app. */
const AXIS_COLOR = '#4a5266';
const GRID_COLOR = 'rgba(255,255,255,0.05)';

interface ChartPoint {
  label: string;
  timestamp: number;
  strength: number;
  endurance: number;
  aesthetics: number;
  discipline: number;
  totalXp: number;
  bodyFat: number;
  level: number;
}

export function ProgressView({ profile }: { profile: Profile }) {
  const [history, setHistory] = useState<StatsSnapshot[] | null>(null);
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([fetchStatsHistory(profile.uid, 120), fetchWorkouts(profile.uid, 60)])
      .then(([snapshots, sessions]) => {
        if (!active) return;
        setHistory(snapshots);
        setWorkouts(sessions);
      })
      .catch((error) => {
        console.error('[progress] failed to load history', error);
        if (!active) return;
        setHistory([]);
        setWorkouts([]);
        setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [profile.uid, profile.workoutCount]);

  /** Snapshots -> chart rows, with every value coerced to a finite number. */
  const points = useMemo<ChartPoint[]>(() => {
    if (!history) return [];
    return history.map((snapshot) => ({
      label: formatShortDay(snapshot.day, snapshot.createdAt),
      timestamp: num(snapshot.createdAt, 0),
      strength: round(snapshot.stats.strength, 1),
      endurance: round(snapshot.stats.endurance, 1),
      aesthetics: round(snapshot.stats.aesthetics, 1),
      discipline: round(snapshot.stats.discipline, 1),
      totalXp: Math.floor(num(snapshot.totalXp, 0)),
      bodyFat: round(snapshot.bodyFat, 1),
      level: Math.max(1, Math.floor(num(snapshot.level, 1))),
    }));
  }, [history]);

  /** Workout volume per session, oldest first. */
  const volumePoints = useMemo(() => {
    if (!workouts) return [];
    return [...workouts]
      .sort((a, b) => num(a.createdAt, 0) - num(b.createdAt, 0))
      .map((workout) => ({
        label: formatShortDay(workout.day, workout.createdAt),
        reps: Math.max(0, Math.floor(num(workout.totalReps, 0))),
        volume: Math.max(0, Math.floor(num(workout.totalVolume, 0))),
        xp: Math.max(0, Math.floor(num(workout.xpEarned, 0))),
      }));
  }, [workouts]);

  // Body fat is only plotted where a real reading exists.
  const bodyFatPoints = useMemo(() => points.filter((p) => p.bodyFat > 0), [points]);

  const loading = history === null || workouts === null;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Header />
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonBlock className="h-80" />
          <SkeletonBlock className="h-80" />
          <SkeletonBlock className="h-80" />
          <SkeletonBlock className="h-80" />
        </div>
      </div>
    );
  }

  const hasHistory = points.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Header />

      {failed ? (
        <Card className="p-4">
          <p className="text-sm text-amber-300">
            Some history could not be loaded. If this persists, check that the Firestore indexes in
            the README have been created.
          </p>
        </Card>
      ) : null}

      {!hasHistory ? (
        <Card>
          <EmptyState
            icon={<TrendingUp className="h-8 w-8" aria-hidden />}
            title="No history yet"
            message="Your assessment is the first data point, and every logged session adds another. Come back after a few workouts to watch the curves move."
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* --- Strength progression --- */}
          <Card>
            <CardHeader
              title="Strength Progression"
              subtitle="All four core stats over time."
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
            />
            <div className="h-72 p-4 pr-5">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={AXIS_COLOR}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke={AXIS_COLOR}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={7}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="strength"
                    name={STAT_META.strength.label}
                    stroke={STAT_META.strength.hex}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="endurance"
                    name={STAT_META.endurance.label}
                    stroke={STAT_META.endurance.hex}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="aesthetics"
                    name={STAT_META.aesthetics.label}
                    stroke={STAT_META.aesthetics.hex}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="discipline"
                    name={STAT_META.discipline.label}
                    stroke={STAT_META.discipline.hex}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* --- XP over time --- */}
          <Card>
            <CardHeader
              title="XP Over Time"
              subtitle="Lifetime experience, cumulative."
              icon={<LineChartIcon className="h-4 w-4" aria-hidden />}
            />
            <div className="h-72 p-4 pr-5">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                  <defs>
                    <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={AXIS_COLOR}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke={AXIS_COLOR}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v) => compactNumber(v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="totalXp"
                    name="Total XP"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill="url(#xpGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* --- Aesthetics / body fat --- */}
          <Card>
            <CardHeader
              title="Aesthetics — Body Fat %"
              subtitle="Recorded readings. Lower is a higher aesthetics floor."
              icon={<Percent className="h-4 w-4" aria-hidden />}
            />
            <div className="h-72 p-4 pr-5">
              {bodyFatPoints.length === 0 ? (
                <EmptyState
                  title="No body fat readings"
                  message="Record an estimate from your profile to start this chart."
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={bodyFatPoints}
                    margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
                  >
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={AXIS_COLOR}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      stroke={AXIS_COLOR}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      domain={['dataMin - 2', 'dataMax + 2']}
                      tickFormatter={(v) => `${fmtDecimal(v, 0)}%`}
                    />
                    <Tooltip content={<ChartTooltip suffix="%" />} />
                    <Line
                      type="monotone"
                      dataKey="bodyFat"
                      name="Body fat"
                      stroke={STAT_META.aesthetics.hex}
                      strokeWidth={2}
                      dot={{ r: 3, fill: STAT_META.aesthetics.hex }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* --- Workout volume --- */}
          <Card>
            <CardHeader
              title="Workout Volume"
              subtitle="Total reps logged per session."
              icon={<BarChart3 className="h-4 w-4" aria-hidden />}
            />
            <div className="h-72 p-4 pr-5">
              {volumePoints.length === 0 ? (
                <EmptyState
                  title="No sessions yet"
                  message="Log a workout and its volume will appear here."
                />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={volumePoints}
                    margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
                  >
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={AXIS_COLOR}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={20}
                    />
                    <YAxis
                      stroke={AXIS_COLOR}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                      tickFormatter={(v) => compactNumber(v)}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar
                      dataKey="reps"
                      name="Total reps"
                      fill="#a855f7"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* --- Session history --- */}
      <WorkoutHistory workouts={workouts ?? []} />

      {/* --- Summary strip --- */}
      {hasHistory ? (
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Summary label="Snapshots" value={fmt(points.length)} />
            <Summary label="Sessions logged" value={fmt(profile.workoutCount)} />
            <Summary label="Lifetime reps" value={fmt(profile.totalReps)} />
            <Summary
              label="Stat growth"
              value={`+${fmtDecimal(totalStatGrowth(points), 1)}`}
              hint="since your assessment"
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">Progress</h1>
      <p className="mt-1.5 text-sm text-slate-500">
        Every assessment and session writes a snapshot. This is the long view.
      </p>
    </div>
  );
}

/** Full session log, newest first, with each session's movements on demand. */
function WorkoutHistory({ workouts }: { workouts: Workout[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const ordered = useMemo(
    () => [...workouts].sort((a, b) => num(b.createdAt, 0) - num(a.createdAt, 0)),
    [workouts],
  );

  return (
    <Card>
      <CardHeader
        title="Session History"
        subtitle={`Your last ${ordered.length} logged session${ordered.length === 1 ? '' : 's'}. Tap one to expand.`}
        icon={<History className="h-4 w-4" aria-hidden />}
      />
      {ordered.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          message="Every workout you log will appear here with its full breakdown."
        />
      ) : (
        <ul className="divide-y divide-white/5">
          {ordered.map((workout) => {
            const open = expanded === workout.id;
            return (
              <li key={workout.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : workout.id)}
                  className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.03]"
                  aria-expanded={open}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {formatShortDay(workout.day, workout.createdAt)} ·{' '}
                      {workout.entries.length} movement
                      {workout.entries.length === 1 ? '' : 's'}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-600">
                      {fmt(workout.totalVolume)} units · {fmt(workout.totalReps)} reps
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold text-forge-300">
                    +{fmt(workout.xpEarned)}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${
                      open ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                </button>

                {open ? (
                  <ul className="animate-fade-up space-y-1.5 bg-ink-900/40 px-4 pb-4 pt-1">
                    {workout.entries.map((entry, i) => (
                      <li
                        key={`${entry.exerciseId}-${i}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-xs text-slate-300">
                          {entry.exerciseName}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-slate-500">
                          {formatSetLadder(entry)}
                          {entry.unit === 'seconds' ? 's' : ''} · +{fmt(entry.xp)} XP
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Summary({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-slate-100">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-600">{hint}</p> : null}
    </div>
  );
}

/** Total stat points gained between the first and last snapshot. */
function totalStatGrowth(points: ChartPoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  const before = first.strength + first.endurance + first.aesthetics + first.discipline;
  const after = last.strength + last.endurance + last.aesthetics + last.discipline;
  return Math.max(0, after - before);
}

interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
}

/** Dark-mode tooltip that never prints NaN. */
function ChartTooltip({
  active,
  payload,
  label,
  suffix = '',
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  suffix?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl bg-ink-800/95 p-3 shadow-glow ring-1 ring-white/10 backdrop-blur-xl">
      <p className="mb-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {String(label ?? '')}
      </p>
      <ul className="space-y-1">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color ?? '#64748b' }}
              aria-hidden
            />
            <span className="text-slate-400">{String(entry.name ?? '')}</span>
            <span className="ml-auto font-mono font-semibold text-slate-100">
              {fmtDecimal(entry.value, entry.value !== undefined && num(entry.value, 0) % 1 === 0 ? 0 : 1)}
              {suffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 12500 -> "12.5k". Always safe. */
function compactNumber(value: unknown): string {
  const n = num(value, 0);
  if (Math.abs(n) >= 1_000_000) return `${fmtDecimal(n / 1_000_000, 1)}M`;
  if (Math.abs(n) >= 1_000) return `${fmtDecimal(n / 1_000, 1)}k`;
  return fmt(n);
}

/** `YYYY-MM-DD` -> "12 Mar", falling back to the timestamp then a placeholder. */
function formatShortDay(day: unknown, timestamp: unknown): string {
  const value = typeof day === 'string' ? day : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }

  const ts = num(timestamp, 0);
  if (ts > 0) {
    const date = new Date(ts);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
  }

  return '—';
}
