import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { pct } from '../../lib/safe';

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  className = '',
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-ink-850/80 ring-1 ring-white/5 backdrop-blur-sm transition duration-300 ${
        glow ? 'shadow-glow' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 p-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-0.5 shrink-0 text-slate-400">{icon}</div> : null}
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-200">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-forge-500 to-forge-400 text-ink-950 font-semibold hover:from-forge-400 hover:to-forge-300 shadow-glow-forge disabled:from-ink-700 disabled:to-ink-700 disabled:text-slate-500 disabled:shadow-none',
  secondary:
    'bg-ink-750 text-slate-200 ring-1 ring-white/10 hover:bg-ink-700 hover:text-white disabled:text-slate-600',
  ghost: 'text-slate-400 hover:bg-white/5 hover:text-slate-100 disabled:text-slate-600',
  danger:
    'bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/20 disabled:text-slate-600',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-rose-400">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl bg-ink-900 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-white/10 transition placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-forge-500 disabled:text-slate-500 ${className}`}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A progress bar that cannot render an invalid width — `value` and `max` are
 * both coerced, and the result is clamped into 0–100.
 */
export function ProgressBar({
  value,
  max,
  gradient = 'from-forge-500 to-forge-300',
  height = 'h-2',
  animated = true,
  transition = true,
  label,
}: {
  value: unknown;
  max: unknown;
  gradient?: string;
  height?: string;
  animated?: boolean;
  /** Set false when the caller animates `value` itself, frame by frame. */
  transition?: boolean;
  label?: string;
}) {
  const percent = pct(value, max);
  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-ink-900 ring-1 ring-inset ring-white/5 ${height}`}
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r ${gradient} ${
          transition ? 'transition-[width] duration-700 ease-out' : ''
        }`}
        style={{ width: `${percent}%` }}
      >
        {animated && percent > 0 ? (
          <div className="h-full w-full animate-shimmer rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)] bg-[length:200%_100%]" />
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges & chips                                                              */
/* -------------------------------------------------------------------------- */

export function Chip({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${className}`}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* States                                                                      */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? <div className="mb-4 text-slate-600">{icon}</div> : null}
      <h3 className="font-display text-base font-semibold text-slate-300">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoadingScreen({ message = 'Loading' }: { message?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-slate-500">
      <Spinner className="h-8 w-8 text-forge-400" />
      <p className="text-sm tracking-wide">{message}</p>
    </div>
  );
}

export function SkeletonBlock({ className = 'h-24' }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-2xl bg-[linear-gradient(90deg,#0f1119,#1a1f2e,#0f1119)] bg-[length:200%_100%] ${className}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Motion preference                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `index.css` already disarms CSS animation globally under reduced motion, but
 * JS-driven tweens and staggered delays have to opt out themselves.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
