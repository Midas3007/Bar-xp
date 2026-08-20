import { fmt, int, str } from '../safe';

/**
 * The share card, built as a string.
 *
 * Nothing here touches the DOM, which is what lets the escaping and the
 * numeric safety be pinned by the zero-dependency test harness — and what
 * keeps the rasteriser in `exportCard.ts` free of any logic worth testing.
 */

/** Portrait, 4:5 — the aspect a phone share sheet will not crop. */
export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

const MAX_ATHLETE = 22;
const MAX_LINE = 34;
const MAX_MOVEMENTS = 5;
const MAX_HIGHLIGHTS = 4;

export interface ShareCardData {
  athlete: string;
  /** `YYYY-MM-DD`. */
  day: string;
  level: number;
  tier: string;
  xpEarned: number;
  baseXp: number;
  streakBonusXp: number;
  coinsEarned: number;
  streakWeeks: number;
  totalReps: number;
  /** Movement names in session order. */
  movements: string[];
  /** Short lines: "Level 12 reached", "New rank — Silver", "PR — Pull-up, 14 reps". */
  highlights: string[];
}

/**
 * XML-escape a value for use inside an SVG text node or attribute.
 *
 * The ampersand is replaced first — doing it after `<` would turn the `&` of
 * an already-emitted `&lt;` into `&amp;lt;`. C0 control characters are illegal
 * in XML and make the browser reject the whole image rather than skip the one
 * character, so they are dropped outright. Display names arrive from the
 * sign-in provider and are entirely user-controlled.
 */
export function escapeXml(value: unknown): string {
  return str(value, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Cut to length, then escape.
 *
 * SVG `<text>` neither wraps nor clips, so an over-long string simply runs off
 * the canvas. Truncating after escaping would spend the budget on entity
 * characters and could sever an entity in half.
 */
function line(value: unknown, max: number): string {
  const raw = str(value, '').replace(/\s+/g, ' ').trim();
  if (raw.length <= max) return escapeXml(raw);
  return escapeXml(`${raw.slice(0, Math.max(1, max - 1)).trimEnd()}…`);
}

/** `bar-xp-2026-08-18.png`, with a stable fallback for junk input. */
export function shareCardFilename(day: unknown): string {
  const raw = str(day, '');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `bar-xp-${raw}.png` : 'bar-xp-session.png';
}

interface TextOptions {
  size: number;
  fill: string;
  weight?: number;
  anchor?: string;
  family?: string;
  spacing?: number;
}

const BODY_FONT = "Inter, 'Helvetica Neue', Arial, sans-serif";
const DISPLAY_FONT = "'Space Grotesk', Inter, Arial, sans-serif";

/** One `<text>` element. `content` must already be escaped by its caller. */
function text(x: number, y: number, content: string, opts: TextOptions): string {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${opts.family ?? BODY_FONT}"`,
    `font-size="${opts.size}"`,
    `font-weight="${opts.weight ?? 400}"`,
    `fill="${opts.fill}"`,
    opts.anchor ? `text-anchor="${opts.anchor}"` : '',
    opts.spacing ? `letter-spacing="${opts.spacing}"` : '',
  ].filter(Boolean);
  return `<text ${attrs.join(' ')}>${content}</text>`;
}

export function buildShareCardSvg(data: ShareCardData): string {
  const w = SHARE_CARD_WIDTH;
  const h = SHARE_CARD_HEIGHT;
  const pad = 80;

  const athlete = line(data.athlete, MAX_ATHLETE) || 'Athlete';
  const day = line(data.day, 12);
  const tier = line(data.tier, 16) || 'Uninitiated';

  const xpEarned = Math.max(0, int(data.xpEarned, 0));
  const baseXp = Math.max(0, int(data.baseXp, 0));
  const bonusXp = Math.max(0, int(data.streakBonusXp, 0));
  const coins = Math.max(0, int(data.coinsEarned, 0));
  const level = Math.max(1, int(data.level, 1));
  const streak = Math.max(0, int(data.streakWeeks, 0));
  const reps = Math.max(0, int(data.totalReps, 0));

  const allMovements = (Array.isArray(data.movements) ? data.movements : []).filter(
    (name) => str(name, '').trim().length > 0,
  );
  const shownMovements = allMovements.slice(0, MAX_MOVEMENTS);
  const overflow = allMovements.length - shownMovements.length;

  const highlights = (Array.isArray(data.highlights) ? data.highlights : [])
    .filter((entry) => str(entry, '').trim().length > 0)
    .slice(0, MAX_HIGHLIGHTS);

  const parts: string[] = [];

  // Wordmark and date.
  parts.push(
    text(pad, 132, 'BAR XP', {
      size: 40,
      fill: '#e2e8f0',
      weight: 700,
      family: DISPLAY_FONT,
      spacing: 8,
    }),
  );
  parts.push(text(w - pad, 132, day, { size: 30, fill: '#64748b', anchor: 'end' }));
  parts.push(
    `<rect x="${pad}" y="168" width="${w - pad * 2}" height="6" rx="3" fill="url(#rule)" />`,
  );

  // Who trained.
  parts.push(
    text(pad, 276, athlete, { size: 58, fill: '#f8fafc', weight: 700, family: DISPLAY_FONT }),
  );
  parts.push(text(pad, 322, `Level ${fmt(level)} · ${tier}`, { size: 30, fill: '#94a3b8' }));

  // The hero figure, with its two halves underneath so they can be checked.
  parts.push(
    text(pad, 520, `+${fmt(xpEarned)}`, {
      size: 180,
      fill: 'url(#rule)',
      weight: 700,
      family: DISPLAY_FONT,
    }),
  );
  parts.push(text(pad, 570, 'XP EARNED', { size: 30, fill: '#94a3b8', weight: 600, spacing: 6 }));
  parts.push(
    text(pad, 618, `${fmt(baseXp)} base  +  ${fmt(bonusXp)} streak bonus`, {
      size: 28,
      fill: '#64748b',
    }),
  );

  // Level / rank / coins / reps.
  const cols = [
    { label: 'LEVEL', value: fmt(level), fill: '#e2e8f0' },
    { label: 'RANK', value: tier, fill: '#e2e8f0' },
    { label: 'COINS', value: `+${fmt(coins)}`, fill: '#fbbf24' },
    { label: 'REPS', value: fmt(reps), fill: '#e2e8f0' },
  ];
  const colWidth = (w - pad * 2) / cols.length;
  parts.push(
    `<rect x="${pad}" y="672" width="${w - pad * 2}" height="140" rx="24" fill="#0b0e17" stroke="#1e293b" stroke-width="2" />`,
  );
  cols.forEach((col, index) => {
    const cx = pad + colWidth * index + colWidth / 2;
    parts.push(
      text(cx, 732, col.label, {
        size: 22,
        fill: '#64748b',
        weight: 600,
        anchor: 'middle',
        spacing: 4,
      }),
    );
    parts.push(
      text(cx, 786, col.value, {
        size: 40,
        fill: col.fill,
        weight: 700,
        anchor: 'middle',
        family: DISPLAY_FONT,
      }),
    );
  });

  parts.push(
    text(pad, 884, `${fmt(streak)} week streak`, { size: 34, fill: '#fb923c', weight: 600 }),
  );

  let y = 948;
  for (const highlight of highlights) {
    parts.push(`<circle cx="${pad + 8}" cy="${y - 10}" r="7" fill="url(#rule)" />`);
    parts.push(text(pad + 36, y, line(highlight, MAX_LINE), { size: 32, fill: '#cbd5e1' }));
    y += 48;
  }

  // Pinned above the footer rule whatever the highlights did. A card with four
  // highlights and a long movement list is the case that overflows, and an SVG
  // that overflows does not clip — it draws straight through the footer.
  const movementY = Math.min(Math.max(y + 16, 1128), h - 190);
  parts.push(
    text(pad, movementY, 'SESSION', { size: 22, fill: '#64748b', weight: 600, spacing: 4 }),
  );
  if (overflow > 0) {
    // On the label row rather than its own line, so the block is always two
    // lines tall regardless of how much was left out.
    parts.push(
      text(w - pad, movementY, `+${fmt(overflow)} more`, {
        size: 22,
        fill: '#475569',
        anchor: 'end',
      }),
    );
  }
  parts.push(
    text(pad, movementY + 46, line(shownMovements.join(' · '), MAX_LINE + 12), {
      size: 28,
      fill: '#94a3b8',
    }),
  );

  parts.push(`<rect x="${pad}" y="${h - 108}" width="${w - pad * 2}" height="2" fill="#1e293b" />`);
  parts.push(text(pad, h - 56, 'Train like it counts.', { size: 26, fill: '#475569' }));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    '<defs>',
    '<linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">',
    '<stop offset="0%" stop-color="#0ea5e9" />',
    '<stop offset="100%" stop-color="#a855f7" />',
    '</linearGradient>',
    '</defs>',
    `<rect width="${w}" height="${h}" fill="#07080d" />`,
    ...parts,
    '</svg>',
  ].join('');
}
