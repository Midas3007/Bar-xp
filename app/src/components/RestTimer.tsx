import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';

import { clamp, int } from '../lib/safe';

const PRESETS = [60, 90, 120, 180] as const;

/**
 * Rest timer for between sets.
 *
 * Counts down from a chosen preset and vibrates when it lands — Android
 * supports `navigator.vibrate`, which matters because this app is mostly used
 * on a phone propped against a wall. The countdown is driven from a target
 * timestamp rather than by decrementing a counter, so it stays accurate even
 * when the browser throttles timers in a backgrounded tab.
 */
export function RestTimer() {
  const [duration, setDuration] = useState<number>(90);
  const [remaining, setRemaining] = useState<number>(90);
  const [running, setRunning] = useState(false);

  /** Wall-clock instant the countdown should reach zero. */
  const deadlineRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const alert = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    // Best-effort: unsupported on iOS Safari and behind a user-gesture
    // requirement elsewhere, so failure here is not worth surfacing.
    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!running) return;

    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setRunning(false);
        deadlineRef.current = null;
        alert();
      }
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running, alert]);

  const start = () => {
    firedRef.current = false;
    const from = remaining > 0 ? remaining : duration;
    deadlineRef.current = Date.now() + from * 1000;
    setRemaining(from);
    setRunning(true);
  };

  const pause = () => {
    setRunning(false);
    deadlineRef.current = null;
  };

  const reset = (next = duration) => {
    setRunning(false);
    deadlineRef.current = null;
    firedRef.current = false;
    setDuration(next);
    setRemaining(next);
  };

  const total = Math.max(1, duration);
  const progress = clamp((remaining / total) * 100, 0, 100);
  const done = remaining === 0;

  return (
    <div className="rounded-xl bg-ink-900/60 p-4 ring-1 ring-white/5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          <Timer className="h-3.5 w-3.5" aria-hidden />
          Rest Timer
        </span>
        <span
          className={`font-mono text-2xl font-bold tabular-nums ${
            done ? 'text-vital-300' : running ? 'text-forge-300' : 'text-slate-300'
          }`}
        >
          {formatClock(remaining)}
        </span>
      </div>

      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-950">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
            done ? 'bg-vital-400' : 'bg-gradient-to-r from-forge-500 to-forge-300'
          }`}
          style={{ width: `${done ? 100 : progress}%` }}
        />
      </div>

      <div className="mb-3 flex gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => reset(preset)}
            className={`flex-1 rounded-lg px-2 py-1.5 font-mono text-[11px] font-semibold transition ${
              duration === preset
                ? 'bg-forge-500/15 text-forge-300 ring-1 ring-forge-500/30'
                : 'bg-white/5 text-slate-500 hover:text-slate-300'
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
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink-750 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition hover:bg-ink-700"
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
          onClick={() => reset()}
          className="rounded-lg bg-white/5 px-3 py-2 text-slate-500 transition hover:text-slate-200"
          aria-label="Reset timer"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      {done ? (
        <p className="mt-2.5 text-center text-[11px] font-medium text-vital-300">
          Rest complete — back on the bar.
        </p>
      ) : null}
    </div>
  );
}

/** Seconds -> `M:SS`, always safe. */
function formatClock(seconds: unknown): string {
  const total = Math.max(0, int(seconds, 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
