import { useEffect, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Compass,
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
import { Modal } from '../ui/Modal';
import { levelProgress } from '../../lib/game/constants';
import { formatClock, useRestTimer } from '../../context/RestTimerContext';

export type ViewKey =
  'dashboard' | 'workout' | 'progress' | 'skills' | 'leaderboard' | 'shop' | 'profile';

interface NavItem {
  key: ViewKey;
  label: string;
  /** Used by the bottom bar, where six columns share a 320px screen. */
  shortLabel?: string;
  icon: typeof LayoutDashboard;
  /**
   * On the mobile bottom bar as well as in the sidebar.
   *
   * Six destinations already share a 320px screen at a 10px type size; a
   * seventh column would make every label unreadable to save one tap. The
   * skill tree is therefore a sidebar and drawer destination with its own URL,
   * reached on a phone from the Progress screen. It wants a proper home
   * whenever navigation is reworked.
   */
  primary: boolean;
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { key: 'workout', label: 'Train', icon: Dumbbell, primary: true },
  { key: 'progress', label: 'Progress', icon: BarChart3, primary: true },
  { key: 'skills', label: 'Skill Tree', icon: Compass, primary: false },
  { key: 'leaderboard', label: 'Compete', shortLabel: 'Ranks', icon: Trophy, primary: true },
  { key: 'shop', label: 'Shop', icon: ShoppingBag, primary: true },
  { key: 'profile', label: 'Profile', icon: UserIcon, primary: true },
];

/** Exactly the six that fit across a phone. */
const BOTTOM_NAV = NAV.filter((item) => item.primary);

export function AppShell({
  profile,
  view,
  onNavigate,
  banner,
  children,
}: {
  profile: Profile;
  view: ViewKey;
  onNavigate: (view: ViewKey) => void;
  /** Rendered above everything — the demo's read-only notice uses it. */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const { signOut, isGuest, exitDemo } = useAuth();
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
    <div className="min-h-screen bg-surface-base">
      {/* Ambient background wash */}
      <div
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(1000px 600px at 15% -10%, rgb(var(--wash-forge) / var(--wash-alpha)), transparent 60%), radial-gradient(800px 500px at 90% 0%, rgb(var(--wash-arcane) / var(--wash-alpha)), transparent 55%)',
        }}
        aria-hidden
      />

      {banner}

      {online ? null : (
        <div className="relative z-40 flex items-center justify-center gap-2 bg-warn-vivid/15 px-4 py-2 text-center text-[11px] font-medium text-warn ring-1 ring-inset ring-warn/25">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Offline — everything you log is saved on this device and syncs when you reconnect.
        </div>
      )}

      <div className="relative flex min-h-screen">
        {/* --- Desktop sidebar --- */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface-sunken/60 backdrop-blur-xl lg:flex">
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
          <SidebarFooter
            profile={profile}
            onSignOut={() => (isGuest ? exitDemo() : void signOut())}
            signOutLabel={isGuest ? 'Leave demo' : undefined}
          />
        </aside>

        {/* --- Main column --- */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-surface-scrim backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="-ml-1 rounded-lg p-2 text-content-muted transition hover:bg-surface-hover hover:text-content-strong lg:hidden"
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
                  <p className="text-[11px] text-content-muted">Level {progress.level}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <TierBadge tierName={profile.tier} size="sm" />
                <CoinPill coins={profile.coins} />
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 pb-nav-offset pt-6 sm:px-6 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* --- Mobile drawer --- */}
      <Modal
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        labelledBy="nav-drawer-title"
        align="left"
        panelClassName="flex h-full w-72 animate-fade-up flex-col border-r border-line-strong bg-surface-sunken lg:hidden"
      >
        <div className="flex items-center justify-between">
          <Brand id="nav-drawer-title" />
          <button
            type="button"
            className="mr-3 rounded-lg p-2 text-content-muted transition hover:bg-surface-hover"
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
        <SidebarFooter
          profile={profile}
          onSignOut={() => (isGuest ? exitDemo() : void signOut())}
          signOutLabel={isGuest ? 'Leave demo' : undefined}
        />
      </Modal>

      {/* --- Mobile bottom bar --- */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-sunken/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl lg:hidden"
      >
        {/* All six primary destinations: Profile holds PRs, achievements and
            custom movements, so burying it in the drawer made it unreachable.
            Making six fit is the fix, not cutting one — hence the short label
            on Compete and a 10px type size with truncation. A seventh would
            undo that, so the skill tree lives in the sidebar and drawer and is
            reached on a phone from the Progress screen. */}
        <div className="mx-auto flex h-14 max-w-lg items-stretch justify-around">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.key)}
                aria-current={active ? 'page' : undefined}
                // The focus outline is drawn inside: a fixed bar clips an
                // outward one against the viewport edge.
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium leading-none transition focus-visible:outline-offset-[-3px] ${
                  active ? 'text-forge' : 'text-content-muted hover:text-content'
                }`}
              >
                {/* Active state is not carried by colour alone. */}
                {active ? (
                  <span
                    className="absolute inset-x-2.5 top-0 h-0.5 rounded-full bg-forge-vivid"
                    aria-hidden
                  />
                ) : null}
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                <span className="w-full truncate text-center">{item.shortLabel ?? item.label}</span>
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
        done ? 'bg-vital-vivid/20 ring-vital/40' : 'bg-surface-overlay/95 ring-line-strong'
      }`}
      role="status"
    >
      <Timer className={`h-4 w-4 shrink-0 ${done ? 'text-vital' : 'text-forge'}`} aria-hidden />
      <span
        className={`font-mono text-sm font-bold tabular-nums ${
          done ? 'text-vital' : 'text-content-strong'
        }`}
      >
        {done ? 'Rest done' : formatClock(remaining)}
      </span>
      <button
        type="button"
        onClick={done ? acknowledge : pause}
        className="rounded-full bg-surface-hover p-1.5 text-content-muted transition hover:text-content-strong"
        aria-label={done ? 'Dismiss the rest alert' : 'Pause the rest timer'}
      >
        {done ? (
          <X className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Pause className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
    </div>
  );
}

function Brand({ id }: { id?: string } = {}) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-forge-vivid to-arcane-vivid shadow-glow-forge">
        <Dumbbell className="h-5 w-5 text-on-accent" aria-hidden />
      </div>
      <div>
        <p
          id={id}
          className="font-display text-base font-bold leading-none tracking-tight text-content-strong"
        >
          Bar XP
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-widest text-content-subtle">
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
          ? 'bg-forge/10 text-forge ring-1 ring-forge/25'
          : 'text-content-muted hover:bg-surface-hover hover:text-content-strong'
      }`}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {item.label}
    </button>
  );
}

function SidebarFooter({
  profile,
  onSignOut,
  signOutLabel = 'Sign out',
}: {
  profile: Profile;
  onSignOut: () => void;
  signOutLabel?: string;
}) {
  return (
    <div className="border-t border-line p-3">
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
          <p className="truncate text-[11px] text-content-subtle">
            {profile.email || (signOutLabel === 'Sign out' ? 'Signed in' : 'Sample athlete')}
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg p-2 text-content-muted transition hover:bg-surface-hover hover:text-danger"
          aria-label={signOutLabel}
          title={signOutLabel}
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
        className="shrink-0 rounded-full ring-1 ring-line-strong"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-surface-strong to-surface-inset font-display text-xs font-bold text-content ring-1 ring-line-strong"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials || 'A'}
    </div>
  );
}
