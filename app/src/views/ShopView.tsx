import { useState } from 'react';
import { Check, Coins, Flame, Lock, Moon, Shield, Sparkles } from 'lucide-react';

import type { Profile } from '../lib/types';
import { Button, Card, CardHeader, Chip, Spinner } from '../components/ui/Primitives';
import { NeonName } from '../components/GameBits';
import { SHOP_ITEMS, purchaseState, type ShopItem } from '../lib/game/shop';
import { purchaseItem, setActiveCosmetic } from '../lib/data';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { arr, fmt, int } from '../lib/safe';

const ICONS = {
  shield: Shield,
  sparkles: Sparkles,
  flame: Flame,
  moon: Moon,
  lock: Lock,
} as const;

const SECTIONS: Array<{ kind: ShopItem['kind']; title: string; subtitle: string }> = [
  {
    kind: 'consumable',
    title: 'Consumables',
    subtitle: 'Spent automatically when you need them.',
  },
  {
    kind: 'cosmetic',
    title: 'Cosmetics',
    subtitle: 'Applied to your name everywhere it appears, leaderboard included.',
  },
  {
    kind: 'unlock',
    title: 'Movement Unlocks',
    subtitle: 'Permanent early access to advanced movements, ahead of their level gate.',
  },
];

export function ShopView({ profile }: { profile: Profile }) {
  const toast = useToast();
  const { isGuest, requestSignUp } = useAuth();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const buy = async (item: ShopItem) => {
    if (isGuest) {
      requestSignUp('spend Bar Coins');
      return;
    }
    if (pendingId) return;
    setPendingId(item.id);
    try {
      const result = await purchaseItem(profile, item.id);
      if (result.ok) {
        toast.success(`Purchased ${item.name}`, purchaseBlurb(item));
      } else {
        toast.error('Purchase failed', result.error);
      }
    } catch (error) {
      console.error('[shop] purchase failed', error);
      toast.error('Purchase failed', 'Check your connection and try again.');
    } finally {
      setPendingId(null);
    }
  };

  const equip = async (cosmeticId: string | null) => {
    if (isGuest) {
      requestSignUp('change your name colour');
      return;
    }
    try {
      await setActiveCosmetic(profile, cosmeticId);
      toast.success(cosmeticId ? 'Cosmetic equipped' : 'Cosmetic removed');
    } catch (error) {
      console.error('[shop] failed to equip cosmetic', error);
      toast.error('Could not update your cosmetic');
    }
  };

  const shields = Math.max(0, int(profile.inventory.streakShields, 0));
  const owned = arr<string>(profile.inventory.cosmetics);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* --- Header --- */}
      <Card className="overflow-hidden" glow>
        <div
          className="flex flex-wrap items-center justify-between gap-4 p-6"
          style={{
            background:
              'radial-gradient(500px 250px at 100% 0%, rgb(var(--wash-warn) / var(--wash-alpha)), transparent 65%)',
          }}
        >
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-content-strong">
              The Shop
            </h1>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-content-muted">
              Bar Coins are earned from every session and every completed goal. Spend them on
              protection, vanity, or a head start.
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-content-muted">
              Balance
            </p>
            <p className="mt-1 flex items-center justify-end gap-2 font-display text-3xl font-bold text-warn">
              <Coins className="h-6 w-6" aria-hidden />
              {fmt(profile.coins)}
            </p>
          </div>
        </div>
      </Card>

      {/* --- Equipped cosmetic --- */}
      {owned.length > 0 ? (
        <Card>
          <CardHeader
            title="Equipped Cosmetic"
            subtitle="Only one name style can be active at a time."
            icon={<Sparkles className="h-4 w-4" aria-hidden />}
          />
          <div className="flex flex-wrap items-center gap-3 p-5">
            <button
              type="button"
              onClick={() => void equip(null)}
              className={`rounded-xl px-4 py-2 text-sm font-medium ring-1 transition ${
                profile.activeCosmetic === null
                  ? 'bg-surface-inset text-content-strong ring-line-strong'
                  : 'text-content-muted ring-line hover:text-content'
              }`}
            >
              Default
            </button>
            {owned.map((cosmeticId) => {
              const item = SHOP_ITEMS.find((i) => i.id === cosmeticId);
              if (!item) return null;
              const active = profile.activeCosmetic === cosmeticId;
              return (
                <button
                  key={cosmeticId}
                  type="button"
                  onClick={() => void equip(cosmeticId)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ring-1 transition ${
                    active
                      ? 'bg-surface-inset ring-line-strong'
                      : 'ring-line hover:ring-line-strong'
                  }`}
                >
                  <NeonName
                    name={profile.displayName}
                    activeCosmetic={cosmeticId}
                    ownedCosmetics={owned}
                  />
                  {active ? (
                    <Check className="ml-2 inline h-3.5 w-3.5 text-vital" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* --- Sections --- */}
      {SECTIONS.map((section) => {
        const items = SHOP_ITEMS.filter((item) => item.kind === section.kind);
        return (
          <div key={section.kind}>
            <div className="mb-3">
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-content">
                {section.title}
              </h2>
              <p className="mt-1 text-xs text-content-muted">{section.subtitle}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const state = purchaseState(item, profile);
                const Icon = ICONS[item.icon];
                const pending = pendingId === item.id;

                return (
                  <Card key={item.id} className="flex flex-col p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-hover text-forge ring-1 ring-line-strong">
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-sm font-semibold text-content-strong">
                            {item.name}
                          </h3>
                          {state === 'owned' ? (
                            <Chip className="bg-vital-vivid/10 text-vital ring-vital/30">
                              <Check className="h-3 w-3" aria-hidden />
                              Owned
                            </Chip>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-content-muted">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    {/* Cosmetic preview, rendered with the item's own style. */}
                    {item.kind === 'cosmetic' ? (
                      <p className="mt-4 rounded-xl bg-surface-sunken/70 px-3 py-2.5 text-center font-display text-sm font-bold ring-1 ring-line">
                        <NeonName
                          name={profile.displayName}
                          activeCosmetic={item.id}
                          ownedCosmetics={[item.id]}
                        />
                      </p>
                    ) : null}

                    {item.kind === 'consumable' ? (
                      <p className="mt-4 text-xs text-content-muted">
                        You hold{' '}
                        <span className="font-mono font-semibold text-forge">{fmt(shields)}</span>{' '}
                        of {fmt(item.maxStack ?? 0)}.
                      </p>
                    ) : null}

                    {item.unlocksLabel ? (
                      <p className="mt-4 text-[11px] text-content-subtle">
                        Unlocks: <span className="text-content-muted">{item.unlocksLabel}</span>
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                      <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-warn">
                        <Coins className="h-4 w-4" aria-hidden />
                        {fmt(item.price)}
                      </span>
                      <Button
                        size="sm"
                        variant={state === 'available' ? 'primary' : 'secondary'}
                        disabled={state !== 'available' || pending}
                        onClick={() => void buy(item)}
                      >
                        {pending ? <Spinner className="h-3.5 w-3.5" /> : null}
                        {buttonLabel(state)}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buttonLabel(state: ReturnType<typeof purchaseState>): string {
  switch (state) {
    case 'owned':
      return 'Owned';
    case 'maxed':
      return 'Max held';
    case 'unaffordable':
      return 'Not enough';
    case 'available':
      return 'Buy';
  }
}

function purchaseBlurb(item: ShopItem): string {
  switch (item.kind) {
    case 'consumable':
      return 'It will be spent automatically the next time you miss a day.';
    case 'cosmetic':
      return 'Equipped now — it applies everywhere your name appears.';
    case 'unlock':
      return 'The movement is available in the logger immediately.';
  }
}
