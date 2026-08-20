import { Dumbbell, TriangleAlert } from "lucide-react";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { RestTimerProvider } from "./context/RestTimerContext";
import { AppShell, type ViewKey } from "./components/layout/AppShell";
import { LoadingScreen } from "./components/ui/Primitives";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthView } from "./views/AuthView";
import { OnboardingView } from "./views/OnboardingView";
import { DashboardView } from "./views/DashboardView";
import { WorkoutLoggerView } from "./views/WorkoutLoggerView";
import { ProgressView } from "./views/ProgressView";
import { LeaderboardView } from "./views/LeaderboardView";
import { ShopView } from "./views/ShopView";
import { ProfileView } from "./views/ProfileView";
import { isFirebaseConfigured, missingFirebaseKeys } from "./lib/firebase";
import { useRoute } from "./lib/routing";

export default function App() {
  // Without Firebase config nothing below can mount — show setup instructions
  // rather than letting the SDK throw on first use.
  // Outermost, so even the setup screen is themed.
  if (!isFirebaseConfigured) {
    return (
      <ThemeProvider>
        <ConfigNeeded />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <RestTimerProvider>
            <Router />
          </RestTimerProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function Router() {
  const { user, profile, loading } = useAuth();
  // Called unconditionally, above every early return — hooks cannot sit behind
  // a conditional. `AuthView` and `OnboardingView` have no route of their own;
  // the path is preserved and honoured once the athlete is signed in.
  const { view, navigate } = useRoute();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-base">
        <LoadingScreen message="Loading your character sheet" />
      </div>
    );
  }

  if (!user) return <AuthView />;

  // Signed in, but the profile snapshot has not arrived (or was deleted).
  if (!profile) {
    return (
      <div className="min-h-screen bg-surface-base">
        <LoadingScreen message="Syncing your profile" />
      </div>
    );
  }

  if (!profile.onboarded) return <OnboardingView profile={profile} />;

  return (
    <AppShell profile={profile} view={view} onNavigate={navigate}>
      <ErrorBoundary resetKey={view}>{renderView(view)}</ErrorBoundary>
    </AppShell>
  );

  function renderView(current: ViewKey) {
    if (!profile) return null;
    switch (current) {
      case "dashboard":
        return <DashboardView profile={profile} onNavigate={navigate} />;
      case "workout":
        return <WorkoutLoggerView profile={profile} onNavigate={navigate} />;
      case "progress":
        return <ProgressView profile={profile} onNavigate={navigate} />;
      case "leaderboard":
        return <LeaderboardView profile={profile} />;
      case "shop":
        return <ShopView profile={profile} />;
      case "profile":
        return <ProfileView profile={profile} />;
    }
  }
}

/** Shown when the Firebase env vars are missing or still placeholders. */
function ConfigNeeded() {
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
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-warn"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-warn">
            Firebase is not configured, so sign-in and data storage are
            unavailable.
          </p>
        </div>

        <p className="text-sm leading-relaxed text-content-muted">
          Copy{" "}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-forge">
            .env.example
          </code>{" "}
          to{" "}
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-forge">
            .env
          </code>{" "}
          and fill in your Firebase project credentials, then restart the dev
          server.
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

        <p className="mt-6 text-xs leading-relaxed text-content-subtle">
          The full setup walkthrough — including Firestore rules and the
          composite indexes the progress charts need — is in the README.
        </p>
      </div>
    </div>
  );
}
