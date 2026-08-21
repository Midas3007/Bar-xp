import { Dumbbell, Eye, TriangleAlert } from 'lucide-react';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { RestTimerProvider } from './context/RestTimerContext';
import { AppShell, type ViewKey } from './components/layout/AppShell';
import { Button, LoadingScreen } from './components/ui/Primitives';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthView } from './views/AuthView';
import { OnboardingView } from './views/OnboardingView';
import { DashboardView } from './views/DashboardView';
import { WorkoutLoggerView } from './views/WorkoutLoggerView';
import { ProgressView } from './views/ProgressView';
import { SkillTreeView } from './views/SkillTreeView';
import { LeaderboardView } from './views/LeaderboardView';
import { ShopView } from './views/ShopView';
import { ProfileView } from './views/ProfileView';
import { isFirebaseConfigured, missingFirebaseKeys } from './lib/firebase';
import { useRoute } from './lib/routing';
import { getDemoData } from './lib/demo/fixture';
import { DemoBanner, DemoPrompt } from './components/demo/DemoChrome';

export default function App() {
  // Without Firebase config nothing below can mount — show setup instructions
  // rather than letting the SDK throw on first use.
  // Outermost, so even the setup screen is themed.
  // The provider tree mounts either way. Without Firebase config the app used
  // to short-circuit to a list of missing environment variables, so a reviewer
  // who cloned the repo and ran `npm run dev` saw no product at all — but the
  // demo is a local fixture and needs no Firebase, so it can still be offered.
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <RestTimerProvider>
            {isFirebaseConfigured ? <Router /> : <UnconfiguredRouter />}
          </RestTimerProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function Router() {
  const { user, profile, loading, isGuest } = useAuth();
  // Called unconditionally, above every early return — hooks cannot sit behind
  // a conditional. `AuthView` and `OnboardingView` have no route of their own;
  // the path is preserved and honoured once the athlete is signed in.
  const { view, navigate } = useRoute();

  // A guest never waits on Firebase — the demo athlete is already in memory.
  if (loading && !isGuest) {
    return (
      <div className="min-h-screen bg-surface-base">
        <LoadingScreen message="Loading your character sheet" />
      </div>
    );
  }

  if (!user && !isGuest) return <AuthView />;

  // Signed in, but the profile snapshot has not arrived (or was deleted). A
  // guest always has one.
  if (!profile) {
    return (
      <div className="min-h-screen bg-surface-base">
        <LoadingScreen message="Syncing your profile" />
      </div>
    );
  }

  if (!profile.onboarded) return <OnboardingView profile={profile} />;

  return (
    <AppShell
      profile={profile}
      view={view}
      onNavigate={navigate}
      banner={isGuest ? <DemoBanner /> : null}
    >
      <ErrorBoundary resetKey={view}>{renderView(view)}</ErrorBoundary>
      {isGuest ? <DemoPrompt /> : null}
    </AppShell>
  );

  function renderView(current: ViewKey) {
    if (!profile) return null;
    switch (current) {
      case 'dashboard':
        return <DashboardView profile={profile} onNavigate={navigate} />;
      case 'workout':
        return <WorkoutLoggerView profile={profile} onNavigate={navigate} />;
      case 'progress':
        return <ProgressView profile={profile} onNavigate={navigate} />;
      case 'skills':
        return <SkillTreeView profile={profile} onNavigate={navigate} />;
      case 'leaderboard':
        return <LeaderboardView profile={profile} />;
      case 'shop':
        return <ShopView profile={profile} />;
      case 'profile':
        return <ProfileView profile={profile} />;
    }
  }
}

/**
 * No Firebase config: the setup screen, unless the visitor has chosen to look
 * around, in which case the demo runs perfectly well without it.
 */
function UnconfiguredRouter() {
  const { isGuest } = useAuth();
  const { view, navigate } = useRoute();
  const profile = isGuest ? getDemoData().profile : null;

  if (!isGuest || !profile) return <ConfigNeeded />;

  return (
    <AppShell profile={profile} view={view} onNavigate={navigate} banner={<DemoBanner />}>
      <ErrorBoundary resetKey={view}>
        {view === 'dashboard' ? <DashboardView profile={profile} onNavigate={navigate} /> : null}
        {view === 'workout' ? <WorkoutLoggerView profile={profile} onNavigate={navigate} /> : null}
        {view === 'progress' ? <ProgressView profile={profile} onNavigate={navigate} /> : null}
        {view === 'skills' ? <SkillTreeView profile={profile} onNavigate={navigate} /> : null}
        {view === 'leaderboard' ? <LeaderboardView profile={profile} /> : null}
        {view === 'shop' ? <ShopView profile={profile} /> : null}
        {view === 'profile' ? <ProfileView profile={profile} /> : null}
      </ErrorBoundary>
      <DemoPrompt />
    </AppShell>
  );
}

/** Shown when the Firebase env vars are missing or still placeholders. */
function ConfigNeeded() {
  const { enterDemo } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl bg-surface-raised p-8 shadow-glow ring-1 ring-line-strong">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-forge-vivid to-arcane-vivid">
            <Dumbbell className="h-5 w-5 text-on-accent" aria-hidden />
          </div>
          <div>
            <p className="font-display text-lg font-bold leading-none text-content-strong">
              Bar XP
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-content-subtle">
              Calisthenics RPG
            </p>
          </div>
        </div>

        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-warn/10 p-3.5 ring-1 ring-warn/25">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
          <p className="text-xs leading-relaxed text-warn">
            Firebase is not configured, so sign-in and data storage are unavailable.
          </p>
        </div>

        <p className="text-sm leading-relaxed text-content-muted">
          Copy{' '}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-forge">.env.example</code>{' '}
          to <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-forge">.env</code> and
          fill in your Firebase project credentials, then restart the dev server.
        </p>

        <p className="mt-5 text-xs font-medium uppercase tracking-widest text-content-muted">
          Missing keys
        </p>
        <ul className="mt-2 space-y-1">
          {missingFirebaseKeys.map((key) => (
            <li key={key} className="font-mono text-xs text-danger">
              {key}
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-line pt-5">
          <Button className="w-full" onClick={enterDemo}>
            <Eye className="h-4 w-4" aria-hidden />
            Look around the demo instead
          </Button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-content-subtle">
            The sample athlete is a local fixture and needs no Firebase project at all.
          </p>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-content-subtle">
          The full setup walkthrough — including Firestore rules and the composite indexes the
          progress charts need — is in the README.
        </p>
      </div>
    </div>
  );
}
