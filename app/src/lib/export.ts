import type { Profile, StatsSnapshot, Workout } from './types';
import { fetchStatsHistory, fetchWorkouts } from './data';
import { dayKey } from './game/streak';
import { num, str } from './safe';

/**
 * Take your data out.
 *
 * A precondition for the delete-account button beside it: erasing an account is
 * only a reasonable thing to offer if the athlete can keep a copy first.
 */

export interface ExportBundle {
  schema: 1;
  /** ISO 8601. */
  exportedAt: string;
  profile: Record<string, unknown>;
  workouts: Workout[];
  statsHistory: StatsSnapshot[];
}

/** Deep enough to cover a serious training history without paging. */
const EXPORT_LIMIT = 2000;

export async function buildExport(profile: Profile): Promise<ExportBundle> {
  const [workouts, statsHistory] = await Promise.all([
    fetchWorkouts(profile.uid, EXPORT_LIMIT),
    fetchStatsHistory(profile.uid, EXPORT_LIMIT),
  ]);

  // `storedTier` and `storedIdentity` are internal drift-detection helpers with
  // no meaning outside the app, so they would only confuse a reader.
  const { storedTier: _tier, storedIdentity: _identity, ...rest } = profile;

  return {
    schema: 1,
    exportedAt: new Date().toISOString(),
    profile: rest as Record<string, unknown>,
    workouts,
    statsHistory,
  };
}

/**
 * One row per *entry*, not per session.
 *
 * That is the shape anyone would actually load into a spreadsheet: a session
 * row would bury the movements inside a cell.
 */
export function bundleToCsv(bundle: ExportBundle): string {
  const header = [
    'date',
    'session_id',
    'kind',
    'exercise_id',
    'exercise_name',
    'unit',
    'sets',
    'amount',
    'volume',
    'entry_xp',
    'session_xp',
    'session_coins',
  ];

  const rows: string[] = [header.map(csvCell).join(',')];

  const ordered = [...bundle.workouts].sort((a, b) => num(a.createdAt, 0) - num(b.createdAt, 0));
  for (const workout of ordered) {
    for (const entry of workout.entries) {
      rows.push(
        [
          str(workout.day, ''),
          str(workout.id, ''),
          workout.kind === 'correction' ? 'correction' : 'session',
          str(entry.exerciseId, ''),
          str(entry.exerciseName, ''),
          str(entry.unit, 'reps'),
          num(entry.sets, 0),
          num(entry.amount, 0),
          num(entry.volume, 0),
          num(entry.xp, 0),
          num(workout.xpEarned, 0),
          num(workout.coinsEarned, 0),
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }

  return rows.join('\n');
}

/**
 * Always quoted, internal quotes doubled.
 *
 * Exercise names are user-authored, so `Front lever, tucked` has to survive as
 * one cell rather than splitting into two.
 */
function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function downloadFile(filename: string, mime: string, contents: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can beat the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportFilename(extension: 'json' | 'csv'): string {
  return extension === 'json'
    ? `bar-xp-export-${dayKey()}.json`
    : `bar-xp-sessions-${dayKey()}.csv`;
}
