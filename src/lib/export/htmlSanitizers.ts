import type { ExportLayoutMode, FrameElement } from '../../types';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Strip characters that can break a CSS declaration, escape a <style> block, or
// smuggle a URL fetch into generic color/background/text fields. Dedicated URL
// fields must use the context-aware helpers from lib/security/urls instead.
export function sanitizeCssValue(value: string): string {
  return value
    .replace(/url\s*\([^)]*\)/gi, '')
    .replace(/[<>]/g, '')
    .replace(/"/g, "'")
    .replace(/[{};]/g, '')
    .replace(/[\\\r\n]/g, '')
    .trim();
}

export function safeCssVariableName(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'color';
}

export function sanitizeCssTokenValue(value: string): string {
  return sanitizeCssValue(value);
}

export function safeTransformOrigin(value: FrameElement['transformOrigin'] | undefined): string {
  const allowed = new Set([
    'center center',
    'top left',
    'top center',
    'top right',
    'center left',
    'center right',
    'bottom left',
    'bottom center',
    'bottom right',
  ]);
  return value && allowed.has(value) ? value : 'center center';
}

export function safeBlendMode(value: FrameElement['blendMode'] | undefined): string | null {
  const allowed = new Set([
    'darken',
    'multiply',
    'color-burn',
    'lighten',
    'screen',
    'color-dodge',
    'overlay',
    'soft-light',
    'hard-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
    'plus-darker',
    'plus-lighter',
  ]);
  return value && allowed.has(value) ? value : null;
}

// Simple luminance check for color-scheme meta; defaults to dark for gradients/complex values.
export function isDarkColor(color: string): boolean {
  const match = color.trim().match(/^#([0-9a-f]{3,8})$/i);
  if (!match) return true;
  const hex = match[1].length === 3 ? match[1].split('').map(character => character + character).join('') : match[1];
  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return 0.299 * red + 0.587 * green + 0.114 * blue < 128;
}

export function minifyGeneratedHTML(html: string): string {
  const withMinifiedStyle = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/g, (_match, attrs: string, css: string) => {
    const minifiedCss = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,>])\s*/g, '$1')
      .replace(/;}/g, '}')
      .trim();
    return `<style${attrs}>${minifiedCss}</style>`;
  });
  return withMinifiedStyle
    .replace(/>\s+</g, '><')
    .trim();
}

export interface GenerateHTMLOptions {
  minify?: boolean;
  /** Explicit export layout mode. Omitted preserves legacy absolute output for direct generator calls. */
  layoutMode?: ExportLayoutMode;
  strictCsp?: boolean;
  darkMode?: {
    enabled: boolean;
    palette: Record<string, string>;
  };
  pwa?: {
    enabled: boolean;
    manifestHref: string;
    serviceWorkerHref: string;
  };
  faviconHref?: string | null;
}

export function applyGenerateHTMLOptions(html: string, options: GenerateHTMLOptions = {}): string {
  return options.minify ? minifyGeneratedHTML(html) : html;
}
