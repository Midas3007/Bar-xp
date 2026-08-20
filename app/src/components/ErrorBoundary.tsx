import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

import { Button } from './ui/Primitives';

interface Props {
  children: ReactNode;
  /** Changing this clears a caught error — used to recover on navigation. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catch a render throw and offer a way out.
 *
 * React 18 unmounts the entire tree on an uncaught render error, so without
 * this one unexpected value anywhere leaves the user on a blank page with no
 * message. The fallback shows the error text deliberately: this app is used by
 * a handful of people who can report it, and a silent card would be worse.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[boundary] render failed', error, info.componentStack);
  }

  override componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private readonly retry = () => this.setState({ error: null });

  private readonly reload = () => window.location.reload();

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-surface-base px-4 py-10">
        <div className="w-full max-w-md rounded-2xl bg-surface-raised/80 p-6 ring-1 ring-line-strong">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0">
              <h1 className="font-display text-lg font-semibold tracking-tight text-content-strong">
                Something broke on this screen
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-content-muted">
                Your training data is safe — nothing was lost. Try again, and if it keeps happening
                send this message on.
              </p>
              <p className="mt-3 break-words rounded-lg bg-surface-sunken p-3 font-mono text-[11px] leading-relaxed text-content-muted">
                {error.message || 'Unknown error'}
              </p>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Button onClick={this.retry}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Try again
            </Button>
            <Button variant="secondary" onClick={this.reload}>
              Reload
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
