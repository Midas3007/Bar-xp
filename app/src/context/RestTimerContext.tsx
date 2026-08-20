import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { int, num } from '../lib/safe';

/**
 * The rest timer, lifted to app level.
 *
 * It used to live inside the logger's session panel, which meant it unmounted
 * the moment the athlete opened the Dashboard to check their level — that is,
 * it stopped working at exactly the moment it exists for. It also alerted only
 * through `navigator.vibrate`, a no-op on iOS Safari, so on an iPhone it was
 * entirely silent while running against a screen in a pocket.
 */

export const REST_PRESETS = [60, 90, 120, 180] as const;

const STATE_KEY = 'barxp.rest.v1';
const SOUND_KEY = 'barxp.rest.sound';

/**
 * How stale an expired deadline can be and still be worth announcing on
 * restore. You are not still resting from a set you did an hour ago.
 */
const STALE_DONE_MS = 60 * 1000;

export interface RestTimerValue {
  duration: number;
  remaining: number;
  running: boolean;
  done: boolean;
  soundOn: boolean;
  start: () => void;
  pause: () => void;
  reset: (next?: number) => void;
  setSoundOn: (on: boolean) => void;
  /** Clears the "rest complete" state after the athlete acknowledges it. */
  acknowledge: () => void;
}

const RestTimerContext = createContext<RestTimerValue | null>(null);

function readStoredSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'false';
  } catch {
    return true;
  }
}

interface StoredState {
  duration: number;
  deadline: number | null;
}

function readStoredState(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const duration = Math.max(1, int(parsed.duration, 90));
    const deadline = num(parsed.deadline, 0);
    return { duration, deadline: deadline > 0 ? deadline : null };
  } catch {
    return null;
  }
}

function writeStoredState(state: StoredState): void {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* private mode; the timer still works for this session */
  }
}

/**
 * Three short blips through Web Audio — no asset, no dependency.
 *
 * A hard gain gate clicks audibly, so each blip ramps in and out instead.
 */
function playChime(ctx: AudioContext): void {
  const beep = (at: number, freq: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.35, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.2);
  };

  const now = ctx.currentTime;
  beep(now, 880);
  beep(now + 0.25, 880);
  beep(now + 0.5, 1174);
}

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const stored = useMemo(readStoredState, []);

  const [duration, setDuration] = useState<number>(stored?.duration ?? 90);
  const [remaining, setRemaining] = useState<number>(stored?.duration ?? 90);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [soundOn, setSoundOnState] = useState<boolean>(readStoredSound);

  /** Wall-clock instant the countdown should reach zero. */
  const deadlineRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const alert = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    try {
      navigator.vibrate?.([200, 100, 200]);
    } catch {
      /* unsupported, and not worth surfacing */
    }

    if (!soundRef.current) return;
    try {
      const ctx = audioRef.current;
      if (!ctx) return;
      // iOS suspends the context whenever the page is backgrounded, which is
      // precisely the case this alert exists for.
      void ctx.resume();
      playChime(ctx);
    } catch {
      // A browser that refuses audio must not break the countdown.
    }
  }, []);

  /**
   * Deadline-based, never a decrementing counter: a background tab throttles
   * `setInterval` to roughly once a minute, and a counter would drift by
   * exactly that much.
   */
  const tick = useCallback(() => {
    const deadline = deadlineRef.current;
    if (deadline === null) return;
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    setRemaining(left);
    if (left <= 0) {
      setRunning(false);
      setDone(true);
      deadlineRef.current = null;
      writeStoredState({ duration, deadline: null });
      alert();
    }
  }, [alert, duration]);

  useEffect(() => {
    if (!running) return;
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [running, tick]);

  // A throttled background tab can deliver the expiry up to a minute late, so
  // catch up the moment the athlete looks at the screen again.
  //
  // The honest limit: a fully backgrounded browser on iOS cannot reliably play
  // audio, so the alert may land on return to the app rather than on time.
  // Fixing that properly needs Notifications or a wake lock, which are
  // deliberately out of scope.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [tick]);

  // Restore across reload and PWA resume.
  useEffect(() => {
    const state = readStoredState();
    if (!state?.deadline) return;

    const left = state.deadline - Date.now();
    if (left > 0) {
      deadlineRef.current = state.deadline;
      firedRef.current = false;
      setRemaining(Math.ceil(left / 1000));
      setRunning(true);
      return;
    }

    if (left > -STALE_DONE_MS) {
      setRemaining(0);
      setDone(true);
      alert();
    } else {
      setRemaining(state.duration);
    }
    writeStoredState({ duration: state.duration, deadline: null });
    // Restoring once on mount is the whole intent; `alert` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    firedRef.current = false;
    // Constructed inside a user gesture, which is the only time a browser will
    // hand one over unsuspended.
    if (!audioRef.current) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) audioRef.current = new Ctor();
      } catch {
        /* no audio available; vibration and the visible pill still work */
      }
    }
    try {
      void audioRef.current?.resume();
    } catch {
      /* ignore */
    }

    setDone(false);
    setRemaining((current) => {
      const from = current > 0 ? current : duration;
      const deadline = Date.now() + from * 1000;
      deadlineRef.current = deadline;
      writeStoredState({ duration, deadline });
      return from;
    });
    setRunning(true);
  }, [duration]);

  const pause = useCallback(() => {
    setRunning(false);
    deadlineRef.current = null;
    writeStoredState({ duration, deadline: null });
  }, [duration]);

  const reset = useCallback(
    (next?: number) => {
      const value = Math.max(1, int(next ?? duration, 90));
      setRunning(false);
      setDone(false);
      deadlineRef.current = null;
      firedRef.current = false;
      setDuration(value);
      setRemaining(value);
      writeStoredState({ duration: value, deadline: null });
    },
    [duration],
  );

  const setSoundOn = useCallback((on: boolean) => {
    setSoundOnState(on);
    try {
      window.localStorage.setItem(SOUND_KEY, on ? 'true' : 'false');
    } catch {
      /* preference is per-session only in private mode */
    }
  }, []);

  const acknowledge = useCallback(() => {
    setDone(false);
    firedRef.current = false;
  }, []);

  const value = useMemo<RestTimerValue>(
    () => ({
      duration,
      remaining,
      running,
      done,
      soundOn,
      start,
      pause,
      reset,
      setSoundOn,
      acknowledge,
    }),
    [duration, remaining, running, done, soundOn, start, pause, reset, setSoundOn, acknowledge],
  );

  return <RestTimerContext.Provider value={value}>{children}</RestTimerContext.Provider>;
}

export function useRestTimer(): RestTimerValue {
  const value = useContext(RestTimerContext);
  if (!value) throw new Error('useRestTimer must be used inside a RestTimerProvider');
  return value;
}

/** Seconds -> `M:SS`, always safe. */
export function formatClock(seconds: unknown): string {
  const total = Math.max(0, int(seconds, 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
