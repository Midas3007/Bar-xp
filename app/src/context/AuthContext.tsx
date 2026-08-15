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
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile as updateAuthProfile,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

import { COLLECTIONS, getAuthOrThrow, getDbOrThrow, googleProvider, isFirebaseConfigured } from '../lib/firebase';
import type { Profile } from '../lib/types';
import { normalizeProfile } from '../lib/game/profile';
import { ensureProfile, persistRecalculation, decayPatch } from '../lib/data';
import { applyStreakDecay, dayKey, safeStreak } from '../lib/game/streak';
import { identityForStreak, tierForStats } from '../lib/game/constants';
import { int } from '../lib/safe';

/** How often the background recalculation runs. */
const RECALC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  /** True until the first auth state and profile snapshot have both resolved. */
  loading: boolean;
  /** The last auth error worth showing the user. */
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Notice raised by the background check, e.g. a consumed Streak Shield. */
  backgroundNotice: string | null;
  dismissBackgroundNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Auth errors the user caused deliberately — never surfaced as failures. */
const SILENT_AUTH_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

function authErrorMessage(error: unknown): string | null {
  const code = (error as { code?: string })?.code ?? '';
  if (SILENT_AUTH_CODES.has(code)) return null;

  switch (code) {
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that email.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return (error as { message?: string })?.message ?? 'Something went wrong. Try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [backgroundNotice, setBackgroundNotice] = useState<string | null>(null);

  /**
   * The live profile listener's teardown.
   *
   * Held in a ref rather than state so that sign-out can detach it
   * *synchronously*, before Firebase revokes the token. If the listener were
   * still attached at that moment Firestore would emit a permission-denied
   * error against a document the user can no longer read.
   */
  const unsubscribeProfileRef = useRef<(() => void) | null>(null);

  /** Latest profile, readable from the interval without re-arming it. */
  const profileRef = useRef<Profile | null>(null);
  /** Guards against overlapping recalculation writes. */
  const recalcInFlightRef = useRef(false);
  /** Set on unmount so late async callbacks stop touching state. */
  const mountedRef = useRef(true);

  const detachProfileListener = useCallback(() => {
    if (unsubscribeProfileRef.current) {
      unsubscribeProfileRef.current();
      unsubscribeProfileRef.current = null;
    }
  }, []);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  /* ---------------------------------------------------------------------- */
  /* Auth state -> profile listener                                          */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    mountedRef.current = true;

    if (!isFirebaseConfigured) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    const unsubscribeAuth = onAuthStateChanged(getAuthOrThrow(), async (nextUser) => {
      // Any previous user's listener must go before a new one is attached.
      detachProfileListener();

      if (!mountedRef.current) return;

      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        profileRef.current = null;
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Guarantees the document exists before the listener attaches, so the
        // first snapshot is never an empty placeholder.
        await ensureProfile(nextUser);
      } catch (error) {
        console.error('[auth] failed to create profile document', error);
        if (mountedRef.current) {
          setAuthError('Could not load your profile. Check your connection and reload.');
          setLoading(false);
        }
        return;
      }

      // The user may have signed out while ensureProfile was in flight.
      if (!mountedRef.current || getAuthOrThrow().currentUser?.uid !== nextUser.uid) return;

      const ref = doc(getDbOrThrow(), COLLECTIONS.users, nextUser.uid);
      unsubscribeProfileRef.current = onSnapshot(
        ref,
        (snapshot) => {
          if (!mountedRef.current) return;
          const next = snapshot.exists()
            ? normalizeProfile(nextUser.uid, snapshot.data())
            : null;
          setProfile(next);
          profileRef.current = next;
          setLoading(false);
        },
        (error) => {
          // A permission-denied here almost always means the listener outlived
          // the session. Detach rather than leaving it retrying forever.
          if ((error as { code?: string }).code === 'permission-denied') {
            detachProfileListener();
          } else {
            console.error('[auth] profile listener error', error);
          }
          if (mountedRef.current) setLoading(false);
        },
      );
    });

    return () => {
      mountedRef.current = false;
      unsubscribeAuth();
      detachProfileListener();
    };
  }, [detachProfileListener]);

  /* ---------------------------------------------------------------------- */
  /* Background recalculation                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Verify streak decay and recompute the derived tier/identity.
   *
   * Runs once on sign-in, hourly thereafter, and whenever the tab regains
   * focus — an hourly timer alone would miss a laptop that was asleep across
   * the day boundary.
   */
  const runRecalculation = useCallback(async () => {
    const current = profileRef.current;
    if (!current || !isFirebaseConfigured) return;
    if (recalcInFlightRef.current) return;

    recalcInFlightRef.current = true;
    try {
      const patch: Record<string, unknown> = {};
      const notices: string[] = [];

      const streak = safeStreak(current.streak);
      const shieldsHeld = Math.max(0, int(current.inventory.streakShields, 0));
      const decay = applyStreakDecay(streak, shieldsHeld, dayKey());

      if (decay.changed) {
        Object.assign(patch, decayPatch(decay, shieldsHeld));

        if (decay.shieldsConsumed > 0) {
          const plural = decay.shieldsConsumed === 1 ? '' : 's';
          notices.push(
            `${decay.shieldsConsumed} Streak Shield${plural} consumed — your ${decay.streak.current}-day streak survived.`,
          );
        } else if (decay.broken) {
          notices.push('Your streak has broken. One session restarts it.');
        }
      }

      // Tier and identity are derived for display but still persisted, since the
      // leaderboard reads other users' stored tier. Compare the freshly derived
      // value against what is actually in the document and correct any drift —
      // from an older client, or from the streak just changing underneath it.
      const effectiveStreak = decay.changed ? decay.streak.current : streak.current;
      const tier = tierForStats(current.stats).name;
      const identity = identityForStreak(effectiveStreak).label;

      if (tier !== current.storedTier) {
        patch.tier = tier;
        // Only worth announcing when the rank actually moved for the user,
        // rather than when we are repairing a document that was merely stale.
        if (current.storedTier) notices.push(`Rank recalculated — you are now ${tier}.`);
      }
      if (identity !== current.storedIdentity) patch.identity = identity;

      if (Object.keys(patch).length === 0) return;

      await persistRecalculation(current.uid, patch);
      if (mountedRef.current && notices.length > 0) setBackgroundNotice(notices.join(' '));
    } catch (error) {
      // A failed background pass is not worth interrupting the user over — the
      // next tick will retry.
      console.error('[auth] background recalculation failed', error);
    } finally {
      recalcInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user || !isFirebaseConfigured) return;

    // Run once as soon as a profile is available, then on the hourly cadence.
    const initial = window.setTimeout(() => void runRecalculation(), 1500);
    const interval = window.setInterval(() => void runRecalculation(), RECALC_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void runRecalculation();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, runRecalculation]);

  /* ---------------------------------------------------------------------- */
  /* Auth actions                                                            */
  /* ---------------------------------------------------------------------- */

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(getAuthOrThrow(), googleProvider);
    } catch (error) {
      // Closing the popup is a deliberate user action, not a failure — it is
      // swallowed without ever reaching the UI.
      const message = authErrorMessage(error);
      if (message) setAuthError(message);
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(getAuthOrThrow(), email.trim(), password);
    } catch (error) {
      const message = authErrorMessage(error);
      if (message) setAuthError(message);
    }
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName: string) => {
      setAuthError(null);
      try {
        const credential = await createUserWithEmailAndPassword(
          getAuthOrThrow(),
          email.trim(),
          password,
        );
        const name = displayName.trim();
        if (name) await updateAuthProfile(credential.user, { displayName: name });
      } catch (error) {
        const message = authErrorMessage(error);
        if (message) setAuthError(message);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    // Detach first: an attached listener plus a revoked token produces a
    // permission-denied storm that also leaks the subscription.
    detachProfileListener();
    setProfile(null);
    profileRef.current = null;
    setBackgroundNotice(null);
    try {
      await fbSignOut(getAuthOrThrow());
    } catch (error) {
      console.error('[auth] sign out failed', error);
    }
  }, [detachProfileListener]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      authError,
      clearAuthError: () => setAuthError(null),
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      backgroundNotice,
      dismissBackgroundNotice: () => setBackgroundNotice(null),
    }),
    [
      user,
      profile,
      loading,
      authError,
      backgroundNotice,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
