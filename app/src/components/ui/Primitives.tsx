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
      className={`rounded-2xl bg-surface-raised/80 ring-1 ring-line backdrop-blur-sm transition duration-300 ${
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
    <div className="flex items-start justify-between gap-4 border-b border-line p-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-0.5 shrink-0 text-content-muted">{icon}</div> : null}
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-content">
            {title}
          </h2>
          {subtitle ? <p className="mt-1 text-xs text-content-muted">{subtitle}</p> : null}
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
    'bg-gradient-to-r from-forge-vivid to-forge text-on-accent font-semibold hover:from-forge-vivid hover:to-forge shadow-glow-forge disabled:from-surface-strong disabled:to-surface-strong disabled:text-content-muted disabled:shadow-none',
  secondary:
    'bg-surface-inset text-content ring-1 ring-line-strong hover:bg-surface-strong hover:text-content-strong disabled:text-content-subtle',
  ghost: 'text-content-muted hover:bg-surface-hover hover:text-content-strong disabled:text-content-subtle',
  danger:
    'bg-danger/10 text-danger ring-1 ring-danger/30 hover:bg-danger/20 disabled:text-content-subtle',
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
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
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-content-muted">
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-content-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl bg-surface-sunken px-3.5 py-2.5 text-sm text-content-strong ring-1 ring-line-strong transition placeholder:text-content-subtle focus:ring-2 focus:ring-forge disabled:text-content-muted ${className}`}
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
  gradient = 'from-forge-vivid to-forge',
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
      className={`relative w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-line ${height}`}
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
/* Toggle                                                                      */
/* -------------------------------------------------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ring-1 ring-inset transition disabled:opacity-50 ${
        checked ? 'bg-forge-vivid ring-forge/40' : 'bg-surface-strong ring-line-strong'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-surface-raised shadow transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
        aria-hidden
      />
    </button>
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
      {icon ? <div className="mb-4 text-content-subtle">{icon}</div> : null}
      <h3 className="font-display text-base font-semibold text-content">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-content-muted">{message}</p>
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-content-muted">
      <Spinner className="h-8 w-8 text-forge" />
      <p className="text-sm tracking-wide">{message}</p>
    </div>
  );
}

export function SkeletonBlock({ className = 'h-24' }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-2xl bg-[linear-gradient(90deg,rgb(var(--skeleton-a)),rgb(var(--skeleton-b)),rgb(var(--skeleton-a)))] bg-[length:200%_100%] ${className}`}
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
