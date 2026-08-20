import { useCallback, useEffect, useState } from 'react';
import type { ViewKey } from '../components/layout/AppShell';

/**
 * URL routing over the History API.
 *
 * Deliberately not `react-router`. The app has six flat, parameterless
 * destinations, no nested layouts, no loaders and no route params — this is
 * forty lines against a 20 kB dependency in a bundle already carrying Firebase
 * and Recharts. Revisit if the app ever gains nested or parameterised routes.
 */

/** The URL each destination lives at. Paths are stable — they get bookmarked. */
export const ROUTES: Record<ViewKey, string> = {
  dashboard: '/dashboard',
  workout: '/train',
  progress: '/progress',
  leaderboard: '/leaderboard',
  shop: '/shop',
  profile: '/profile',
};

const BY_PATH = new Map<string, ViewKey>(
  (Object.entries(ROUTES) as Array<[ViewKey, string]>).map(([view, path]) => [path, view]),
);

/** Path -> view, defaulting to the dashboard for `/` and anything unknown. */
export function viewForPath(pathname: string): ViewKey {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return BY_PATH.get(clean) ?? 'dashboard';
}

export interface Route {
  view: ViewKey;
  /** Push a new history entry. Ignored when already on that view. */
  navigate: (view: ViewKey) => void;
}

export function useRoute(): Route {
  const [view, setView] = useState<ViewKey>(() => viewForPath(window.location.pathname));

  // Normalise `/`, `/index.html` and unknown paths onto a real route without
  // adding a history entry, so the very first Back press leaves the app rather
  // than bouncing between two spellings of the dashboard.
  useEffect(() => {
    const resolved = viewForPath(window.location.pathname);
    const canonical = ROUTES[resolved];
    if (window.location.pathname !== canonical) {
      window.history.replaceState({ view: resolved }, '', canonical);
    }
  }, []);

  useEffect(() => {
    const onPop = () => setView(viewForPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: ViewKey) => {
    if (viewForPath(window.location.pathname) === next) return;
    window.history.pushState({ view: next }, '', ROUTES[next]);
    setView(next);
    window.scrollTo(0, 0);
  }, []);

  return { view, navigate };
}
