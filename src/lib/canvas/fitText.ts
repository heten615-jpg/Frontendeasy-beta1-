/** Returns the longest line in a multiline string (by character count). */
export function longestLine(text: string): string {
  if (!text) return '';
  return text.split('\n').reduce((a, b) => b.length > a.length ? b : a, '');
}

/**
 * Computes the largest integer font-size (px) at which the longest line of
 * `text` fits within `boxWidth` pixels (after subtracting horizontal padding).
 *
 * In browser environments, uses CanvasRenderingContext2D.measureText for
 * accurate results. Falls back to a character-count approximation (≈0.52em
 * average for sans-serif) in Node/test environments or when canvas is
 * unavailable. Returns `maxFontSize` when there is nothing to measure
 * (empty text, zero width, etc.).
 */
export function computeFitFontSize(
  text: string,
  boxWidth: number,
  maxFontSize: number,
  fontWeight: string,
  fontFamily: string,
  horizontalPadding = 32, // matches the 12px 16px padding in element CSS
): number {
  const longest = longestLine(text);
  if (!longest || boxWidth <= 0 || maxFontSize <= 6) return maxFontSize;
  const available = Math.max(1, boxWidth - horizontalPadding);

  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Detect stub canvas (jsdom returns width:0 for all text).
        ctx.font = `${fontWeight} 16px ${fontFamily}, system-ui, sans-serif`;
        if (ctx.measureText('M').width > 0) {
          let lo = 6, hi = maxFontSize;
          while (lo < hi) {
            const mid = Math.floor((lo + hi + 1) / 2);
            ctx.font = `${fontWeight} ${mid}px ${fontFamily}, system-ui, sans-serif`;
            if (ctx.measureText(longest).width <= available) {
              lo = mid;
            } else {
              hi = mid - 1;
            }
          }
          return Math.max(6, lo);
        }
      }
    } catch {
      // canvas unavailable — fall through to approximation
    }
  }

  // Fallback: character-width approximation (sans-serif average ≈ 0.52em)
  const approxFit = Math.floor(available / (longest.length * 0.52));
  return Math.max(6, Math.min(maxFontSize, approxFit));
}
