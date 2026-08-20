import { useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Menu,
  Pause,
  ShoppingBag,
  Timer,
  Trophy,
  User as UserIcon,
  WifiOff,
  X,
} from 'lucide-react';

import type { Profile } from '../../lib/types';
import { useAuth } from '../../context/AuthContext';
import { CoinPill, NeonName, TierBadge } from '../GameBits';
import { levelProgress } from '../../lib/game/constants';
import { formatClock, useRestTimer } from '../../context/RestTimerContext';

export type ViewKey =
  | 'dashboard'
  | 'workout'
  | 'progress'
  | 'leaderboard'
  | 'shop'
  | 'profile';

interface NavItem {
  key: ViewKey;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'workout', label: 'Train', icon: Dumbbell },
  { key: 'progress', label: 'Progress', icon: BarChart3 },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { key: 'shop', label: 'Shop', icon: ShoppingBag },
  { key: 'profile', label: 'Profile', icon: UserIcon },
];

export function AppShell({
  profile,
  view,
  onNavigate,
  children,
}: {
  profile: Profile;
  view: ViewKey;
  onNavigate: (view: ViewKey) => void;
  children: ReactNode;
}) {
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // Close the mobile drawer whenever the view changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [view]);

  const progress = levelProgress(profile.totalXp);

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Ambient background wash */}
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(1000px 600px at 15% -10%, rgba(56,189,248,0.10), transparent 60%), radial-gradient(800px 500px at 90% 0%, rgba(168,85,247,0.08), transparent 55%)',
        }}
        aria-hidden
      />

      {online ? null : (
        <div className="relative z-40 flex items-center justify-center gap-2 bg-amber-500/15 px-4 py-2 text-center text-[11px] font-medium text-amber-200 ring-1 ring-inset ring-amber-500/25">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Offline — everything you log is saved on this device and syncs when you reconnect.
        </div>
      )}

      <div className="relative flex min-h-screen">
        {/* --- Desktop sidebar --- */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-ink-900/60 backdrop-blur-xl lg:flex">
          <Brand />
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV.map((item) => (
              <NavButton
                key={item.key}
                item={item}
                active={view === item.key}
                onClick={() => onNavigate(item.key)}
              />
            ))}
          </nav>
          <SidebarFooter profile={profile} onSignOut={() => void signOut()} />
        </aside>

        {/* --- Main column --- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="-ml-1 rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-slate-100 lg:hidden"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" aria-hidden />
                </button>
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-semibold">
                    <NeonName
                      name={profile.displayName}
                      activeCosmetic={profile.activeCosmetic}
                      ownedCosmetics={profile.inventory.cosmetics}
                    />
                  </p>
                  <p className="text-[11px] text-slate-500">Level {progress.level}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <TierBadge tierName={profile.tier} size="sm" />
                <CoinPill coins={profile.coins} />
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* --- Mobile drawer --- */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-fade-up flex-col border-r border-white/10 bg-ink-900">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                className="mr-3 rounded-lg p-2 text-slate-400 transition hover:bg-white/5"
                onClick={() => setMenuOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4">
              {NAV.map((item) => (
                <NavButton
                  key={item.key}
                  item={item}
                  active={view === item.key}
                  onClick={() => onNavigate(item.key)}
                />
              ))}
            </nav>
            <SidebarFooter profile={profile} onSignOut={() => void signOut()} />
          </div>
        </div>
      ) : null}

      {/* --- Mobile bottom bar --- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/5 bg-ink-900/95 backdrop-blur-xl lg:hidden">
        {/* All six destinations: Profile holds PRs, achievements and custom
            movements, so burying it in the drawer made it unreachable. */}
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                className={`flex flex-1 flex-col items-center gap-0.5 px-0.5 py-2 text-[9px] font-medium leading-tight transition ${
                  active ? 'text-forge-300' : 'text-slate-500 hover:text-slate-300'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* The whole point of lifting the timer out of the logger: it is visible
          and audible from wherever the athlete happens to be standing. */}
      {view === 'workout' ? null : <RestTimerBar />}
    </div>
  );
}

/** Floating countdown pill, above the mobile bottom bar. */
function RestTimerBar() {
  const { remaining, running, done, pause, acknowledge } = useRestTimer();
  if (!running && !done) return null;

  return (
    <div
      className={`fixed bottom-20 right-4 z-40 flex items-center gap-3 rounded-full py-2 pl-4 pr-2 shadow-glow ring-1 backdrop-blur-xl lg:bottom-6 ${
        done ? 'bg-vital-500/20 ring-vital-400/40' : 'bg-ink-800/95 ring-white/10'
      }`}
      role="status"
    >
      <Timer
        className={`h-4 w-4 shrink-0 ${done ? 'text-vital-300' : 'text-forge-300'}`}
        aria-hidden
      />
      <span
        className={`font-mono text-sm font-bold tabular-nums ${
          done ? 'text-vital-200' : 'text-slate-100'
        }`}
      >
        {done ? 'Rest done' : formatClock(remaining)}
      </span>
      <button
        type="button"
        onClick={done ? acknowledge : pause}
        className="rounded-full bg-white/5 p-1.5 text-slate-400 transition hover:text-slate-100"
        aria-label={done ? 'Dismiss the rest alert' : 'Pause the rest timer'}
      >
        {done ? <X className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-forge-500 to-arcane-500 shadow-glow-forge">
        <Dumbbell className="h-5 w-5 text-ink-950" aria-hidden />
      </div>
      <div>
        <p className="font-display text-base font-bold leading-none tracking-tight text-slate-50">
          Bar XP
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-widest text-slate-600">
          Calisthenics RPG
        </p>
      </div>
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        active
          ? 'bg-forge-500/10 text-forge-300 ring-1 ring-forge-500/25'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {item.label}
    </button>
  );
}

function SidebarFooter({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  return (
    <div className="border-t border-white/5 p-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <Avatar profile={profile} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            <NeonName
              name={profile.displayName}
              activeCosmetic={profile.activeCosmetic}
              ownedCosmetics={profile.inventory.cosmetics}
            />
          </p>
          <p className="truncate text-[11px] text-slate-600">{profile.email || 'Signed in'}</p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-rose-300"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function Avatar({ profile, size = 36 }: { profile: Profile; size?: number }) {
  const initials = (profile.displayName || 'A')
    .split(' ')
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (profile.photoURL) {
    return (
      <img
        src={profile.photoURL}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full ring-1 ring-white/10"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-ink-700 to-ink-600 font-display text-xs font-bold text-slate-300 ring-1 ring-white/10"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials || 'A'}
    </div>
  );
}
