/**
 * The rasteriser: SVG string in, PNG out, share sheet or download.
 *
 * Everything here needs a DOM, so it holds no logic worth unit-testing and is
 * kept out of `shareCard.ts` — which does, and is compiled by the test
 * harness. Nothing in the card references an external URL, which is what
 * keeps the canvas untainted and `toBlob` legal.
 */

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/** A browser that silently refuses the SVG must not spin the button forever. */
const LOAD_TIMEOUT_MS = 10_000;

type ShareCapableNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
  share?: (data?: ShareData) => Promise<void>;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error('decode failed'));
    };
    // No `crossOrigin`: a blob URL is same-origin already, and setting it can
    // break the load outright.
    image.src = url;
  });
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      // A tainted canvas throws SecurityError synchronously in some engines
      // and hands back null in others. Both end up at the SVG fallback.
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked a tick later so Safari has committed the navigation first.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Rasterise an SVG string and hand it to the share sheet, or download it.
 *
 * Where a browser refuses to rasterise the SVG at all, the SVG itself is
 * downloaded under a `.svg` name — a less convenient file, never a dead
 * button.
 */
export async function exportShareCard(
  svg: string,
  filename: string,
  width: number,
  height: number,
): Promise<ShareOutcome> {
  // eslint-disable-next-line no-useless-assignment -- TypeScript needs the
  // initialiser: the catch below returns, so it cannot prove definite
  // assignment across the try/finally, and `toPng` can legitimately yield null.
  let png: Blob | null = null;
  const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(source);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return failWithSvg(source, filename);
    ctx.drawImage(image, 0, 0, width, height);
    png = await toPng(canvas);
  } catch (error) {
    console.error('[share] could not rasterise the card', error);
    return failWithSvg(source, filename);
  } finally {
    // The draw is synchronous once onload has fired, so this is safe here.
    URL.revokeObjectURL(url);
  }

  if (!png) return failWithSvg(source, filename);

  const file = new File([png], filename, { type: 'image/png' });
  const nav = navigator as ShareCapableNavigator;
  // Safari throws on `share` with unsupported members rather than returning
  // false, so `canShare` is asked first and its answer is trusted.
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Bar XP' });
      return 'shared';
    } catch (error) {
      // Dismissing the sheet is a decision, not a failure.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }

  download(png, filename);
  return 'downloaded';
}

/** Last resort: hand over the vector file rather than nothing at all. */
function failWithSvg(source: Blob, filename: string): ShareOutcome {
  try {
    download(source, filename.replace(/\.png$/, '.svg'));
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
