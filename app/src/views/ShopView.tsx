import { useState } from 'react';
import { Check, Coins, Flame, Lock, Moon, Shield, Sparkles } from 'lucide-react';

import type { Profile } from '../lib/types';
import { Button, Card, CardHeader, Chip, Spinner } from '../components/ui/Primitives';
import { NeonName } from '../components/GameBits';
import { SHOP_ITEMS, purchaseState, type ShopItem } from '../lib/game/shop';
import { purchaseItem, setActiveCosmetic } from '../lib/data';
import { useToast } from '../context/ToastContext';
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
  const [pendingId, setPendingId] = useState<string | null>(null);

  const buy = async (item: ShopItem) => {
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
              'radial-gradient(500px 250px at 100% 0%, rgba(251,191,36,0.10), transparent 65%)',
          }}
        >
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">
              The Shop
            </h1>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
              Bar Coins are earned from every session and every completed goal. Spend them on
              protection, vanity, or a head start.
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Balance
            </p>
            <p className="mt-1 flex items-center justify-end gap-2 font-display text-3xl font-bold text-amber-300">
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
                  ? 'bg-ink-750 text-slate-100 ring-white/20'
                  : 'text-slate-500 ring-white/5 hover:text-slate-300'
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
                    active ? 'bg-ink-750 ring-white/20' : 'ring-white/5 hover:ring-white/10'
                  }`}
                >
                  <NeonName
                    name={profile.displayName}
                    activeCosmetic={cosmeticId}
                    ownedCosmetics={owned}
                  />
                  {active ? (
                    <Check className="ml-2 inline h-3.5 w-3.5 text-vital-400" aria-hidden />
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
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-slate-300">
                {section.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{section.subtitle}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const state = purchaseState(item, profile);
                const Icon = ICONS[item.icon];
                const pending = pendingId === item.id;

                return (
                  <Card key={item.id} className="flex flex-col p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-forge-300 ring-1 ring-white/10">
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-sm font-semibold text-slate-100">
                            {item.name}
                          </h3>
                          {state === 'owned' ? (
                            <Chip className="bg-vital-500/10 text-vital-300 ring-vital-500/30">
                              <Check className="h-3 w-3" aria-hidden />
                              Owned
                            </Chip>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    {/* Cosmetic preview, rendered with the item's own style. */}
                    {item.kind === 'cosmetic' ? (
                      <p className="mt-4 rounded-xl bg-ink-900/70 px-3 py-2.5 text-center font-display text-sm font-bold ring-1 ring-white/5">
                        <NeonName
                          name={profile.displayName}
                          activeCosmetic={item.id}
                          ownedCosmetics={[item.id]}
                        />
                      </p>
                    ) : null}

                    {item.kind === 'consumable' ? (
                      <p className="mt-4 text-xs text-slate-500">
                        You hold{' '}
                        <span className="font-mono font-semibold text-forge-300">
                          {fmt(shields)}
                        </span>{' '}
                        of {fmt(item.maxStack ?? 0)}.
                      </p>
                    ) : null}

                    {item.unlocksLabel ? (
                      <p className="mt-4 text-[11px] text-slate-600">
                        Unlocks: <span className="text-slate-400">{item.unlocksLabel}</span>
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                      <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-amber-300">
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
