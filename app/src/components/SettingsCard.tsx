import { useState } from 'react';
import { Settings } from 'lucide-react';

import type { Profile, UnitSystem } from '../lib/types';
import { updatePreferences } from '../lib/data';
import { useToast } from '../context/ToastContext';
import { Card, Toggle } from './ui/Primitives';

/**
 * Per-user preferences.
 *
 * These live on the Profile view rather than in a settings screen of their own:
 * the mobile bottom bar carries exactly six destinations, and the Profile view
 * is already where the display name, body fat and custom movements are edited.
 */
export function SettingsCard({ profile }: { profile: Profile }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Both controls write through and let the profile listener re-render. No
  // optimistic local copy: the document is the only source of truth for these.
  const apply = async (patch: { unitSystem?: UnitSystem; gymBroMode?: boolean }) => {
    setBusy(true);
    try {
      await updatePreferences(profile, patch);
    } catch (err) {
      console.error('[profile] failed to save preferences', err);
      toast.error('Could not save that setting', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-content">
        <Settings className="h-4 w-4 text-content-muted" aria-hidden />
        Settings
      </h2>

      <div className="space-y-5">
        <div>
          <p className="text-sm font-medium text-content">Units</p>
          <p className="mt-0.5 text-xs text-content-muted">
            A display preference only. Measurements are always stored the same way, so switching
            never rewrites your history.
          </p>
          <div className="mt-3 inline-flex rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line">
            <UnitButton
              active={profile.unitSystem === 'metric'}
              disabled={busy}
              onClick={() => void apply({ unitSystem: 'metric' })}
            >
              Metric kg/cm
            </UnitButton>
            <UnitButton
              active={profile.unitSystem === 'imperial'}
              disabled={busy}
              onClick={() => void apply({ unitSystem: 'imperial' })}
            >
              Imperial lb/in
            </UnitButton>
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 border-t border-line pt-5">
          <div>
            <p className="text-sm font-medium text-content">Gym Bro Mode</p>
            <p className="mt-0.5 text-xs text-content-muted">
              Chud / Normie / Chad / GIGACHAD instead of Lagging / Building / Good / Standout in the
              Physique Lab. Same scores either way.
            </p>
          </div>
          <Toggle
            checked={profile.gymBroMode}
            disabled={busy}
            label="Gym Bro Mode"
            onChange={(next) => void apply({ gymBroMode: next })}
          />
        </div>
      </div>
    </Card>
  );
}

function UnitButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
        active
          ? 'bg-forge-vivid/20 text-forge ring-1 ring-inset ring-forge/30'
          : 'text-content-muted hover:text-content'
      }`}
    >
      {children}
    </button>
  );
}
