import type { Profile } from '../types';
import { arr, int } from '../safe';

export type ShopItemKind = 'consumable' | 'cosmetic' | 'unlock';

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  kind: ShopItemKind;
  price: number;
  /** Consumables only — how many the user may hold at once. */
  maxStack?: number;
  /** Cosmetics only — the Tailwind classes applied to the display name. */
  nameClass?: string;
  /** Unlocks only — the exercises this opens, for the shop copy. */
  unlocksLabel?: string;
  icon: 'shield' | 'sparkles' | 'flame' | 'moon' | 'lock';
}

export const SHOP_ITEMS: ShopItem[] = [
  /* --- Consumables ------------------------------------------------------ */
  {
    id: 'streak_shield',
    name: 'Streak Shield',
    description:
      'Automatically consumed to bridge a missed day. Your streak survives without you lifting a finger — one shield per missed day.',
    kind: 'consumable',
    price: 250,
    maxStack: 5,
    icon: 'shield',
  },

  /* --- Cosmetics -------------------------------------------------------- */
  {
    id: 'neon_name',
    name: 'Neon Name Color',
    description:
      'Your display name burns cyan-to-fuchsia everywhere it appears — dashboard, profile and the global leaderboard.',
    kind: 'cosmetic',
    price: 1200,
    nameClass:
      'bg-gradient-to-r from-prestige-diamond-deep via-prestige-mythic-deep to-prestige-violet-deep ' +
      'dark:from-prestige-aqua dark:via-prestige-diamond dark:to-prestige-violet ' +
      'bg-clip-text text-transparent',
    icon: 'sparkles',
  },
  {
    id: 'ember_name',
    name: 'Ember Name Color',
    description: 'A molten amber-to-rose gradient on your name. For people who train angry.',
    kind: 'cosmetic',
    price: 1200,
    nameClass:
      'bg-gradient-to-r from-prestige-bronze-deep via-prestige-legend-deep to-prestige-rose-deep ' +
      'dark:from-prestige-amber dark:via-prestige-legend dark:to-prestige-rose ' +
      'bg-clip-text text-transparent',
    icon: 'flame',
  },
  {
    id: 'void_name',
    name: 'Void Name Color',
    description: 'Deep violet fading to ice. Quiet, and slightly unsettling.',
    kind: 'cosmetic',
    price: 1600,
    nameClass:
      'bg-gradient-to-r from-prestige-violet-deep via-prestige-mythic-deep to-prestige-stone-deep ' +
      'dark:from-prestige-violet dark:via-prestige-mythic dark:to-prestige-silver ' +
      'bg-clip-text text-transparent',
    icon: 'moon',
  },

  /* --- Unlocks ---------------------------------------------------------- */
  {
    id: 'unlock_muscle_up',
    name: 'Muscle-up Access',
    description: 'Log muscle-ups before level 12. If you can already do them, prove it early.',
    kind: 'unlock',
    price: 800,
    unlocksLabel: 'Muscle-up',
    icon: 'lock',
  },
  {
    id: 'unlock_handstand',
    name: 'Handstand Push-up Access',
    description: 'Opens vertical pressing ahead of the level 16 requirement.',
    kind: 'unlock',
    price: 1000,
    unlocksLabel: 'Handstand Push-up',
    icon: 'lock',
  },
  {
    id: 'unlock_planche',
    name: 'Planche Line Access',
    description: 'Unlocks planche leans and the full planche without waiting for levels 14 and 20.',
    kind: 'unlock',
    price: 1500,
    unlocksLabel: 'Planche Lean · Full Planche',
    icon: 'lock',
  },
  {
    id: 'unlock_front_lever',
    name: 'Front Lever Access',
    description: 'The signature straight-arm pull, opened ahead of level 15.',
    kind: 'unlock',
    price: 1500,
    unlocksLabel: 'Front Lever',
    icon: 'lock',
  },
  {
    id: 'unlock_one_arm',
    name: 'One-arm Push-up Access',
    description: 'Unilateral pressing before level 18.',
    kind: 'unlock',
    price: 1800,
    unlocksLabel: 'One-arm Push-up',
    icon: 'lock',
  },
  {
    id: 'unlock_human_flag',
    name: 'Human Flag Access',
    description: 'The most photogenic thing you can do on a pole, opened ahead of level 20.',
    kind: 'unlock',
    price: 2000,
    unlocksLabel: 'Human Flag',
    icon: 'lock',
  },
];

export function findShopItem(id: unknown): ShopItem | undefined {
  return SHOP_ITEMS.find((item) => item.id === id);
}

export type PurchaseState = 'available' | 'owned' | 'maxed' | 'unaffordable';

/** What the shop button should say and do for this item. */
export function purchaseState(item: ShopItem, profile: Profile | null): PurchaseState {
  if (!profile) return 'unaffordable';

  if (item.kind === 'cosmetic' && arr<string>(profile.inventory?.cosmetics).includes(item.id)) {
    return 'owned';
  }
  if (item.kind === 'unlock' && arr<string>(profile.inventory?.unlocks).includes(item.id)) {
    return 'owned';
  }
  if (item.kind === 'consumable') {
    const held = int(profile.inventory?.streakShields, 0);
    if (item.maxStack !== undefined && held >= item.maxStack) return 'maxed';
  }

  return int(profile.coins, 0) >= int(item.price, 0) ? 'available' : 'unaffordable';
}

/** Tailwind classes for a user's active name cosmetic, or '' for the default. */
export function cosmeticNameClass(activeCosmetic: unknown, ownedCosmetics: unknown): string {
  const active = typeof activeCosmetic === 'string' ? activeCosmetic : null;
  if (!active) return '';
  // A cosmetic only renders if it is genuinely owned — this also guards the
  // leaderboard, where rows come from other users' documents.
  if (!arr<string>(ownedCosmetics).includes(active)) return '';
  return findShopItem(active)?.nameClass ?? '';
}
