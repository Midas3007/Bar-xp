import { useMemo } from 'react';
import { Ruler } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { MeasurementKey, StatsSnapshot, UnitSystem } from '../lib/types';
import { fmtDecimal, num } from '../lib/safe';
import {
  MEASUREMENT_HEX,
  MEASUREMENT_SITES,
  displayFromMetric,
  unitLabel,
  type MeasurementSite,
} from '../lib/game/measurements';
import { Card, CardHeader, EmptyState } from './ui/Primitives';
import { axisColor, ChartTooltip, gridColor, formatShortDay } from '../views/ProgressView';
import { useTheme } from '../context/ThemeContext';

/**
 * Measurement history, as small multiples rather than one six-line overlay.
 *
 * Six categorical hues bright enough for this near-black surface cannot be told
 * apart under deuteranopia across every pair, and chest centimetres and calf
 * centimetres share an axis unit but nothing else — overlaying them invites a
 * comparison this feature deliberately avoids. One panel per site means colour
 * carries no identity at all, so a single accent is correct for every panel and
 * the title does the identifying.
 */

interface SitePoint {
  label: string;
  timestamp: number;
  value: number;
}

function seriesFor(
  history: StatsSnapshot[],
  key: MeasurementKey,
  kind: MeasurementSite['kind'],
  unitSystem: UnitSystem,
): SitePoint[] {
  const points: SitePoint[] = [];
  for (const snapshot of history) {
    const values = snapshot.measurements;
    if (!values) continue;
    const metric = values[key];
    if (typeof metric !== 'number' || !Number.isFinite(metric)) continue;
    points.push({
      label: formatShortDay(snapshot.day, snapshot.createdAt),
      timestamp: num(snapshot.createdAt, 0),
      value: displayFromMetric(metric, kind, unitSystem),
    });
  }
  return points.sort((a, b) => a.timestamp - b.timestamp);
}

export function MeasurementCharts({
  history,
  unitSystem,
}: {
  history: StatsSnapshot[];
  unitSystem: UnitSystem;
}) {
  const { resolved } = useTheme();
  const axis = axisColor(resolved);
  const grid = gridColor(resolved);

  const series = useMemo(() => {
    const out = new Map<MeasurementKey, SitePoint[]>();
    for (const site of MEASUREMENT_SITES) {
      out.set(site.key, seriesFor(history, site.key, site.kind, unitSystem));
    }
    return out;
  }, [history, unitSystem]);

  const anything = MEASUREMENT_SITES.some((s) => (series.get(s.key)?.length ?? 0) > 0);
  if (!anything) {
    return (
      <Card>
        <CardHeader
          title="Body Measurements"
          subtitle="Charted over time, and never compared to anyone else."
          icon={<Ruler className="h-4 w-4" aria-hidden />}
        />
        <div className="p-4">
          <EmptyState
            title="No measurements yet"
            message="Record bodyweight or a tape measurement from your profile and it will be charted here."
          />
        </div>
      </Card>
    );
  }

  const bodyweight = MEASUREMENT_SITES[0];
  const bodyweightPoints = series.get(bodyweight.key) ?? [];
  const girths = MEASUREMENT_SITES.slice(1);
  const bwUnit = unitLabel(bodyweight.kind, unitSystem);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={`Bodyweight (${bwUnit})`}
          subtitle="Recorded readings. Not scored, and not compared to anyone else."
          icon={<Ruler className="h-4 w-4" aria-hidden />}
        />
        <div className="h-64 p-4 pr-5">
          {bodyweightPoints.length === 0 ? (
            <EmptyState
              title="No bodyweight readings"
              message="Record one from your profile to start this chart."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={bodyweightPoints}
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
                  width={48}
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tickFormatter={(v) => `${fmtDecimal(v, 0)}${bwUnit}`}
                />
                <Tooltip content={<ChartTooltip suffix={` ${bwUnit}`} />} />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Bodyweight"
                  stroke={MEASUREMENT_HEX}
                  strokeWidth={2}
                  dot={{ r: 3, fill: MEASUREMENT_HEX }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Girths"
          subtitle="One panel per site — the numbers move independently and are not compared to each other."
          icon={<Ruler className="h-4 w-4" aria-hidden />}
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {girths.map((site) => (
            <GirthPanel
              key={site.key}
              site={site}
              points={series.get(site.key) ?? []}
              unitSystem={unitSystem}
              axis={axis}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function GirthPanel({
  site,
  points,
  unitSystem,
  axis,
}: {
  site: MeasurementSite;
  points: SitePoint[];
  unitSystem: UnitSystem;
  axis: string;
}) {
  const unit = unitLabel(site.kind, unitSystem);
  const latest = points.length > 0 ? points[points.length - 1].value : null;
  const first = points.length > 1 ? points[0].value : null;
  const delta = latest !== null && first !== null ? latest - first : null;

  return (
    <div className="rounded-xl bg-surface-sunken/60 p-3 ring-1 ring-inset ring-line">
      <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-content-muted">
        {site.label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold text-content-strong">
        {latest === null ? (
          <span className="text-content-subtle">—</span>
        ) : (
          <>
            {fmtDecimal(latest, 1)}
            <span className="ml-1 text-xs font-medium text-content-muted">{unit}</span>
          </>
        )}
      </p>
      {delta !== null ? (
        <p className="mt-0.5 text-xs text-content-muted">
          {delta >= 0 ? '+' : '−'}
          {fmtDecimal(Math.abs(delta), 1)} {unit} since first reading
        </p>
      ) : null}

      {points.length > 0 ? (
        <div className="mt-3 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="label" hide />
              <YAxis
                stroke={axis}
                width={34}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                domain={['dataMin - 1', 'dataMax + 1']}
              />
              <Tooltip content={<ChartTooltip suffix={` ${unit}`} />} />
              <Line
                type="monotone"
                dataKey="value"
                name={site.label}
                stroke={MEASUREMENT_HEX}
                strokeWidth={2}
                dot={{ r: 2, fill: MEASUREMENT_HEX }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}
