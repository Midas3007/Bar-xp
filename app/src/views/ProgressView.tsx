import { useCallback, useEffect, useMemo, useState } from 'react';
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

import type { Exercise, Profile, StatKey, StatsSnapshot, Workout } from '../lib/types';
import type { ViewKey } from '../components/layout/AppShell';
import { Button, Card, CardHeader, Chip, EmptyState, SkeletonBlock, Spinner } from '../components/ui/Primitives';
import { MeasurementCharts } from '../components/MeasurementCharts';
import { STAT_META } from '../lib/game/constants';
import { useTheme } from '../context/ThemeContext';
import type { ResolvedTheme } from '../lib/theme';
import { fetchStatsHistory, fetchWorkouts, voidWorkout } from '../lib/data';
import { allExercisesFor } from '../lib/game/exercises';
import { withinCorrectionWindow } from '../lib/game/correction';
import { saveDraft } from '../lib/draft';
import { useToast } from '../context/ToastContext';
import { fmt, fmtDecimal, num, round, str } from '../lib/safe';
import { formatSetLadder } from '../lib/game/sets';

/** Chart palette, aligned with the stat colors used across the app. */
/**
 * Chart chrome, resolved per theme.
 *
 * Recharts takes literal colours rather than classes, so these cannot go
 * through the token layer. They are the measured equivalents of
 * `content-subtle` and a faint hairline on each surface.
 */
export function axisColor(theme: ResolvedTheme): string {
  return theme === 'dark' ? '#8494ab' : '#57657c';
}

export function gridColor(theme: ResolvedTheme): string {
  return theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)';
}

/** The stat's series colour for the active theme. */
export function statHex(key: StatKey, theme: ResolvedTheme): string {
  return theme === 'dark' ? STAT_META[key].hex : STAT_META[key].hexLight;
}

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

export function ProgressView({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (view: ViewKey) => void;
}) {
  const { resolved } = useTheme();
  const axis = axisColor(resolved);
  const grid = gridColor(resolved);

  const [history, setHistory] = useState<StatsSnapshot[] | null>(null);
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [failed, setFailed] = useState(false);
  /** Bumped by a correction, to pull the fresh ledger back down. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    Promise.all([fetchStatsHistory(profile.uid, 120), fetchWorkouts(profile.uid, 120)])
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
    // `recordedAt` changes exactly once per recording, so a measurement saved
    // from the profile refetches here and nothing else does.
  }, [profile.uid, profile.workoutCount, profile.measurements?.recordedAt ?? 0, reloadKey]);

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

  /** Ids of sessions a correction record already retracts. */
  const corrections = useMemo(
    () =>
      new Set(
        (workouts ?? [])
          .filter((w) => w.kind === 'correction')
          .map((w) => str(w.correctsId, ''))
          .filter((id) => id !== ''),
      ),
    [workouts],
  );

  // A correction is worth nothing by construction, so leaving it in would draw
  // a zero-XP spike on the volume chart and pad the session count.
  const sessions = useMemo(
    () => (workouts ?? []).filter((w) => w.kind !== 'correction'),
    [workouts],
  );

  /** Workout volume per session, oldest first. */
  const volumePoints = useMemo(() => {
    if (!workouts) return [];
    return [...sessions]
      .sort((a, b) => num(a.createdAt, 0) - num(b.createdAt, 0))
      .map((workout) => ({
        label: formatShortDay(workout.day, workout.createdAt),
        reps: Math.max(0, Math.floor(num(workout.totalReps, 0))),
        volume: Math.max(0, Math.floor(num(workout.totalVolume, 0))),
        xp: Math.max(0, Math.floor(num(workout.xpEarned, 0))),
      }));
  }, [workouts, sessions]);

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
          <p className="text-sm text-warn">
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
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={axis}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke={axis}
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
                    stroke={statHex('strength', resolved)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="endurance"
                    name={STAT_META.endurance.label}
                    stroke={statHex('endurance', resolved)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="aesthetics"
                    name={STAT_META.aesthetics.label}
                    stroke={statHex('aesthetics', resolved)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="discipline"
                    name={STAT_META.discipline.label}
                    stroke={statHex('discipline', resolved)}
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
                      <stop offset="0%" stopColor={statHex('endurance', resolved)} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={statHex('endurance', resolved)} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={axis}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    stroke={axis}
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
                    stroke={statHex('endurance', resolved)}
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
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={axis}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      stroke={axis}
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
                      stroke={statHex('aesthetics', resolved)}
                      strokeWidth={2}
                      dot={{ r: 3, fill: statHex('aesthetics', resolved) }}
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
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={axis}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={20}
                    />
                    <YAxis
                      stroke={axis}
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
                      fill={statHex('discipline', resolved)}
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

      {/* --- Body measurements --- */}
      <MeasurementCharts history={history ?? []} unitSystem={profile.unitSystem} />

      {/* --- Session history --- */}
      <WorkoutHistory
        profile={profile}
        workouts={sessions}
        corrections={corrections}
        onNavigate={onNavigate}
        onChanged={() => setReloadKey((k) => k + 1)}
      />

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
      <h1 className="font-display text-2xl font-bold tracking-tight text-content-strong">Progress</h1>
      <p className="mt-1.5 text-sm text-content-muted">
        Every assessment and session writes a snapshot. This is the long view.
      </p>
    </div>
  );
}

/** Full session log, newest first, with each session's movements on demand. */
function WorkoutHistory({
  profile,
  workouts,
  corrections,
  onNavigate,
  onChanged,
}: {
  profile: Profile;
  workouts: Workout[];
  corrections: Set<string>;
  onNavigate: (view: ViewKey) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Which row is one tap from committing, and to what. */
  const [confirming, setConfirming] = useState<{ id: string; mode: 'fix' | 'delete' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const catalog = useMemo(() => allExercisesFor(profile), [profile]);
  const resolve = useCallback(
    (id: string): Exercise | undefined => catalog.find((e) => e.id === id),
    [catalog],
  );

  const ordered = useMemo(
    () => [...workouts].sort((a, b) => num(b.createdAt, 0) - num(a.createdAt, 0)),
    [workouts],
  );

  // A pending confirmation lapses rather than lingering as an armed delete.
  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(null), 5000);
    return () => window.clearTimeout(id);
  }, [confirming]);

  const commit = async (workout: Workout, mode: 'fix' | 'delete') => {
    setConfirming(null);
    setBusyId(workout.id);
    try {
      const result = await voidWorkout(profile, workout, resolve);
      if (mode === 'fix') {
        // Hand the movements to the logger as a draft; the athlete edits the
        // numbers and logs it again. The re-log carries today's date, which is
        // the price of an append-only ledger and why the window is 48 hours.
        saveDraft(profile.uid, {
          entries: workout.entries,
          presetId: workout.presetId ?? null,
        });
        toast.success(
          'Session retracted',
          `${fmt(result.xpRemoved)} XP came back off. Fix the numbers and log it again.`,
        );
        onChanged();
        onNavigate('workout');
        return;
      }
      toast.success('Session deleted', `${fmt(result.xpRemoved)} XP came back off your total.`);
      onChanged();
    } catch (error) {
      console.error('[progress] failed to correct session', error);
      toast.error('Could not correct that session', 'Check your connection and try again.');
    } finally {
      setBusyId(null);
    }
  };

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
        <ul className="divide-y divide-line">
          {ordered.map((workout) => {
            const open = expanded === workout.id;
            const corrected = corrections.has(workout.id);
            const correctable = !corrected && withinCorrectionWindow(workout.createdAt);
            const armed = confirming?.id === workout.id ? confirming.mode : null;
            const busy = busyId === workout.id;

            return (
              <li key={workout.id} className={corrected ? 'opacity-50' : undefined}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : workout.id)}
                  className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-surface-hover"
                  aria-expanded={open}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium text-content">
                      <span className="truncate">
                        {formatShortDay(workout.day, workout.createdAt)} ·{' '}
                        {workout.entries.length} movement
                        {workout.entries.length === 1 ? '' : 's'}
                      </span>
                      {corrected ? <Chip>Corrected</Chip> : null}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-content-subtle">
                      {fmt(workout.totalVolume)} units · {fmt(workout.totalReps)} reps
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold text-forge">
                    +{fmt(workout.xpEarned)}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-content-subtle transition-transform ${
                      open ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  />
                </button>

                {open ? (
                  <div className="animate-fade-up bg-surface-sunken/40 px-4 pb-4 pt-1">
                    <ul className="space-y-1.5">
                      {workout.entries.map((entry, i) => (
                        <li
                          key={`${entry.exerciseId}-${i}`}
                          className="flex items-center justify-between gap-3 rounded-lg bg-surface-hover px-3 py-2"
                        >
                          <span className="min-w-0 truncate text-xs text-content">
                            {entry.exerciseName}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-content-muted">
                            {formatSetLadder(entry)}
                            {entry.unit === 'seconds' ? 's' : ''} · +{fmt(entry.xp)} XP
                          </span>
                        </li>
                      ))}
                    </ul>

                    {corrected ? (
                      <p className="mt-3 text-[11px] text-content-subtle">
                        This session was corrected. Its XP, coins, stats, reps and muscle volume
                        have already come back off.
                      </p>
                    ) : correctable ? (
                      <div className="mt-3">
                        {armed ? (
                          <p className="mb-2 text-[11px] leading-relaxed text-warn">
                            XP, coins, stats, reps and muscle volume are reversed. Personal bests,
                            streak and goal progress are not.
                            {armed === 'fix'
                              ? ' The corrected session is re-logged with today\u2019s date.'
                              : ''}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant={armed === 'fix' ? 'primary' : 'secondary'}
                            disabled={busy}
                            onClick={() =>
                              armed === 'fix'
                                ? void commit(workout, 'fix')
                                : setConfirming({ id: workout.id, mode: 'fix' })
                            }
                          >
                            {busy && armed === 'fix' ? <Spinner className="h-3.5 w-3.5" /> : null}
                            {armed === 'fix' ? 'Confirm — this cannot be undone' : 'Fix numbers'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busy}
                            onClick={() =>
                              armed === 'delete'
                                ? void commit(workout, 'delete')
                                : setConfirming({ id: workout.id, mode: 'delete' })
                            }
                          >
                            {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
                            {armed === 'delete'
                              ? 'Confirm — this cannot be undone'
                              : 'Delete session'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-[11px] text-content-subtle">
                        Sessions can be corrected for 48 hours.
                      </p>
                    )}
                  </div>
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
      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-content-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold text-content-strong">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-content-subtle">{hint}</p> : null}
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

/** Dark-mode tooltip that never prints NaN. Shared with `MeasurementCharts`. */
export function ChartTooltip({
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
    <div className="rounded-xl bg-surface-overlay/95 p-3 shadow-glow ring-1 ring-line-strong backdrop-blur-xl">
      <p className="mb-1.5 font-display text-[11px] font-semibold uppercase tracking-widest text-content-muted">
        {String(label ?? '')}
      </p>
      <ul className="space-y-1">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color ?? 'currentColor' }}
              aria-hidden
            />
            <span className="text-content-muted">{String(entry.name ?? '')}</span>
            <span className="ml-auto font-mono font-semibold text-content-strong">
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
export function formatShortDay(day: unknown, timestamp: unknown): string {
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
