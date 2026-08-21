import { Eye, X } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Primitives';
import { Modal } from '../ui/Modal';
import { DEMO_NAME } from '../../lib/demo/fixture';

/**
 * The read-only banner and the prompt that appears when a guest tries to do
 * something that needs an account.
 *
 * The demo is a local fixture rather than an anonymous Firebase session: an
 * anonymous account would write a real user document and a real leaderboard row
 * per visitor, onto the board the owner and his friends actually use, with no
 * cleanup. It would also start empty, which is exactly the impression the demo
 * exists to avoid.
 */
export function DemoBanner() {
  const { exitDemo, requestSignUp } = useAuth();

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 bg-arcane/10 px-4 py-2 text-center text-[11px] font-medium text-arcane ring-1 ring-inset ring-arcane/25">
      <span className="flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
        You are looking around as {DEMO_NAME}, a sample athlete. Nothing here can be changed.
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => requestSignUp('start your own character sheet')}
          className="rounded-full bg-arcane/15 px-2.5 py-0.5 font-semibold underline-offset-2 hover:underline"
        >
          Create an account
        </button>
        <button
          type="button"
          onClick={exitDemo}
          className="text-content-muted underline-offset-2 hover:text-content hover:underline"
        >
          Leave demo
        </button>
      </span>
    </div>
  );
}

/** Shown when a guest taps something that would write. */
export function DemoPrompt() {
  const { guestPrompt, dismissGuestPrompt, exitDemo } = useAuth();

  return (
    <Modal
      open={guestPrompt !== null}
      onClose={dismissGuestPrompt}
      labelledBy="demo-prompt-title"
      panelClassName="w-full max-w-sm animate-fade-up rounded-t-2xl bg-surface-overlay p-6 shadow-glow ring-1 ring-line-strong sm:rounded-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="demo-prompt-title" className="font-display text-lg font-bold text-content-strong">
          That needs an account
        </h2>
        <button
          type="button"
          onClick={dismissGuestPrompt}
          className="rounded-lg p-1.5 text-content-muted transition hover:bg-surface-hover"
          aria-label="Close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-content-muted">
        The demo athlete is read-only, so you can explore every screen without signing in — but to{' '}
        {guestPrompt ?? 'do that'} you need a character sheet of your own. It takes about a minute,
        and the assessment is four honest numbers.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          onClick={() => {
            dismissGuestPrompt();
            exitDemo();
          }}
        >
          Create an account
        </Button>
        <Button variant="ghost" onClick={dismissGuestPrompt}>
          Keep looking around
        </Button>
      </div>
    </Modal>
  );
}
