import { Pause, Play, RotateCcw, Timer, Volume2, VolumeX } from 'lucide-react';

import { clamp } from '../lib/safe';
import { REST_PRESETS, formatClock, useRestTimer } from '../context/RestTimerContext';

/**
 * Rest timer for between sets.
 *
 * Purely presentational now: every piece of state lives in `RestTimerContext`,
 * mounted above the router, so the countdown survives navigation and the alert
 * still lands when the athlete has wandered off to the Dashboard.
 */
export function RestTimer() {
  const { duration, remaining, running, done, soundOn, start, pause, reset, setSoundOn } =
    useRestTimer();

  const total = Math.max(1, duration);
  const progress = clamp((remaining / total) * 100, 0, 100);

  return (
    <div className="rounded-xl bg-surface-sunken/60 p-4 ring-1 ring-line">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-widest text-content-muted">
          <Timer className="h-3.5 w-3.5" aria-hidden />
          Rest Timer
        </span>
        <span
          className={`font-mono text-2xl font-bold tabular-nums ${
            done ? 'text-vital' : running ? 'text-forge' : 'text-content'
          }`}
        >
          {formatClock(remaining)}
        </span>
      </div>

      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-base">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
            done ? 'bg-vital-vivid' : 'bg-gradient-to-r from-forge-vivid to-forge'
          }`}
          style={{ width: `${done ? 100 : progress}%` }}
        />
      </div>

      <div className="mb-3 flex gap-1.5">
        {REST_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => reset(preset)}
            className={`flex-1 rounded-lg px-2 py-1.5 font-mono text-[11px] font-semibold transition ${
              duration === preset
                ? 'bg-forge/15 text-forge ring-1 ring-forge/30'
                : 'bg-surface-hover text-content-muted hover:text-content'
            }`}
          >
            {preset}s
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={running ? pause : start}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-surface-inset py-2 text-xs font-semibold text-content ring-1 ring-line-strong transition hover:bg-surface-strong"
        >
          {running ? (
            <>
              <Pause className="h-3.5 w-3.5" aria-hidden />
              Pause
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden />
              {done ? 'Go again' : 'Start'}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSoundOn(!soundOn)}
          className="rounded-lg bg-surface-hover px-3 py-2 text-content-muted transition hover:text-content"
          aria-label={soundOn ? 'Mute the rest alert' : 'Unmute the rest alert'}
          aria-pressed={!soundOn}
        >
          {soundOn ? (
            <Volume2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <VolumeX className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-surface-hover px-3 py-2 text-content-muted transition hover:text-content"
          aria-label="Reset timer"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {done ? (
        <p className="mt-2.5 text-center text-[11px] font-medium text-vital">
          Rest complete — back on the bar.
        </p>
      ) : null}
    </div>
  );
}
