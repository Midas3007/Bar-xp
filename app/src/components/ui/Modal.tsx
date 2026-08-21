import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/**
 * An accessible dialog, in about ninety lines and no dependency.
 *
 * The two overlays this replaces — the movement sheet and the nav drawer — had
 * no role, no `aria-modal`, no Escape handler, no focus trap and no scroll
 * lock, so Tab moved straight through the scrim into the page behind. Their
 * scrim was itself a focusable `<button>`, which puts a full-viewport tab stop
 * inside the trap; here it is an `aria-hidden` div, and the dialog's own close
 * button and Escape are the accessible paths out.
 */

const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  labelledBy,
  align = 'center',
  panelClassName = '',
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** id of the heading that titles this dialog. */
  labelledBy: string;
  /** 'center' = bottom sheet on mobile, centred card from sm up. 'left' = full-height drawer. */
  align?: 'center' | 'left';
  panelClassName?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const focusables = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === root,
    );
  }, []);

  useEffect(() => {
    if (!open) return;

    restoreTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const { body } = document;
    // Saved and restored rather than blindly reset to '', in case something
    // else is already managing it.
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const first = focusables()[0];
    (first ?? panelRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === firstItem || active === panelRef.current)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    // Capture phase, so Escape closes the dialog before any inner handler sees it.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      body.style.overflow = previousOverflow;
      restoreTo.current?.focus();
    };
  }, [open, onClose, focusables]);

  if (!open) return null;

  const container =
    align === 'left'
      ? 'fixed inset-0 z-50 flex'
      : 'fixed inset-0 z-50 flex items-end justify-center sm:items-center';

  return (
    <div className={container}>
      <div
        className="absolute inset-0 bg-surface-scrim backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`relative outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
