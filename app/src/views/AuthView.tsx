import { useState, type FormEvent } from 'react';
import { Dumbbell, Flame, Shield, TrendingUp, TriangleAlert } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { Button, Field, Input, Spinner } from '../components/ui/Primitives';

type Mode = 'signin' | 'signup';

export function AuthView() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, authError, clearAuthError } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    clearAuthError();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password, displayName);
      }
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogle();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-950 px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 600px at 20% 0%, rgba(56,189,248,0.14), transparent 60%), radial-gradient(700px 500px at 85% 20%, rgba(168,85,247,0.12), transparent 55%)',
        }}
        aria-hidden
      />

      <div className="relative grid w-full max-w-5xl gap-10 lg:grid-cols-2 lg:gap-16">
        {/* --- Pitch --- */}
        <div className="flex flex-col justify-center">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-forge-500 to-arcane-500 shadow-glow-forge">
              <Dumbbell className="h-6 w-6 text-ink-950" aria-hidden />
            </div>
            <div>
              <p className="font-display text-xl font-bold leading-none tracking-tight text-slate-50">
                Bar XP
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-widest text-slate-500">
                Calisthenics RPG
              </p>
            </div>
          </div>

          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight text-slate-50 sm:text-5xl">
            Your training is a{' '}
            <span className="bg-gradient-to-r from-forge-400 via-arcane-400 to-ember-400 bg-clip-text text-transparent">
              character sheet
            </span>
            .
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-400">
            Log every set on the bar. Earn XP, level up, bank Bar Coins, and grow four stats that
            decide your rank — from Uninitiated all the way to Legend.
          </p>

          <ul className="mt-8 space-y-4">
            <Feature
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              title="Four core stats"
              body="Strength, Endurance, Aesthetics and Discipline, each moved by the work you actually do."
            />
            <Feature
              icon={<Flame className="h-4 w-4" aria-hidden />}
              title="Streaks and identity"
              body="Train consecutive days to climb from Fading to Relentless — and earn an XP multiplier while you do."
            />
            <Feature
              icon={<Shield className="h-4 w-4" aria-hidden />}
              title="An economy that protects you"
              body="Spend Bar Coins on Streak Shields, name cosmetics, and early access to advanced movements."
            />
          </ul>
        </div>

        {/* --- Form --- */}
        <div className="flex items-center">
          <div className="w-full rounded-2xl bg-ink-850/80 p-6 shadow-glow ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex rounded-xl bg-ink-900 p-1 ring-1 ring-white/5">
              <TabButton active={mode === 'signin'} onClick={() => switchMode('signin')}>
                Sign in
              </TabButton>
              <TabButton active={mode === 'signup'} onClick={() => switchMode('signup')}>
                Create account
              </TabButton>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {mode === 'signup' ? (
                <Field label="Display name" hint="Shown on the global leaderboard.">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your athlete name"
                    autoComplete="nickname"
                    maxLength={40}
                    required
                  />
                </Field>
              ) : null}

              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </Field>

              <Field
                label="Password"
                hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={6}
                  required
                />
              </Field>

              {authError ? (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-500/25">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden />
                  <p className="text-xs leading-relaxed text-rose-200">{authError}</p>
                </div>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : null}
                {mode === 'signin' ? 'Enter the gym' : 'Begin your journey'}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/5" />
              <span className="text-[11px] uppercase tracking-widest text-slate-600">or</span>
              <div className="h-px flex-1 bg-white/5" />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => void onGoogle()}
              disabled={busy}
            >
              <GoogleMark />
              Continue with Google
            </Button>

            <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-600">
              Your workout data is stored against your account only. Ranks and XP appear on the
              public leaderboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3.5">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-forge-300 ring-1 ring-white/10">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{body}</p>
      </div>
    </li>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
        active ? 'bg-ink-750 text-slate-100 shadow-sm' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.14 6.16-4.14Z"
      />
    </svg>
  );
}
