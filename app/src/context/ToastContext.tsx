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
import { CheckCircle2, Info, TriangleAlert, X, Zap } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info' | 'xp';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastContextValue {
  push: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  xp: (title: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_MS = 5200;

/**
 * Visible toasts, oldest evicted first.
 *
 * Toasts are for incidental confirmations only. Anything a user has earned and
 * would be upset to miss belongs on the session summary, which cannot be
 * evicted by whatever fires next.
 */
const MAX_VISIBLE_TOASTS = 4;

const KIND_STYLES: Record<ToastKind, { icon: typeof Info; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'ring-vital-500/30', iconColor: 'text-vital-400' },
  error: { icon: TriangleAlert, ring: 'ring-rose-500/30', iconColor: 'text-rose-400' },
  info: { icon: Info, ring: 'ring-forge-500/30', iconColor: 'text-forge-400' },
  xp: { icon: Zap, ring: 'ring-amber-500/30', iconColor: 'text-amber-400' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [
        ...current.slice(-(MAX_VISIBLE_TOASTS - 1)),
        { ...toast, id },
      ]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), TOAST_MS));
    },
    [dismiss],
  );

  // Clear every pending timer on unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, detail) => push({ kind: 'success', title, detail }),
      error: (title, detail) => push({ kind: 'error', title, detail }),
      info: (title, detail) => push({ kind: 'info', title, detail }),
      xp: (title, detail) => push({ kind: 'xp', title, detail }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // Anchored to the top on phones: the bottom edge is occupied by the
        // nav bar and the logger's sticky session summary.
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-4 pt-[68px] sm:right-0 sm:items-end sm:p-6"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const style = KIND_STYLES[toast.kind];
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex w-full max-w-sm animate-scale-in items-start gap-3 rounded-xl bg-ink-800/95 p-4 ring-1 backdrop-blur-xl ${style.ring} shadow-glow`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.iconColor}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">{toast.title}</p>
                {toast.detail ? (
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{toast.detail}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="-m-1 rounded-lg p-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside a ToastProvider');
  return context;
}
