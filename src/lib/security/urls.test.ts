import { describe, expect, it } from 'vitest';
import {
  isSafeIframeSrc,
  isSafeImageLikeUrl,
  isSafeInlineHref,
  safeExportResourceHref,
  safeIframeSrc,
  safeImageLikeCssUrl,
  safeImageLikeUrl,
  safeInlineHref,
  safeUrlForContext,
} from './urls';

describe('URL security helpers', () => {
  it('allows only web and relative iframe sources', () => {
    expect(safeIframeSrc('https://example.test/embed')).toBe('https://example.test/embed');
    expect(safeIframeSrc('http://example.test/embed')).toBe('http://example.test/embed');
    expect(safeIframeSrc('/embed.html')).toBe('/embed.html');
    expect(safeIframeSrc('../embed.html')).toBe('../embed.html');
    expect(safeIframeSrc('about:blank')).toBe('about:blank');

    expect(safeIframeSrc('javascript:alert(1)')).toBe('about:blank');
    expect(safeIframeSrc('data:text/html,boom')).toBe('about:blank');
    expect(safeIframeSrc('blob:https://example.test/id')).toBe('about:blank');
    expect(safeIframeSrc('//example.test/embed')).toBe('about:blank');
    expect(safeIframeSrc('https://example.test/\nembed')).toBe('about:blank');
    expect(isSafeIframeSrc('javascript:alert(1)')).toBe(false);
  });

  it('validates image-like asset URLs for storage, favicon, and CSS export', () => {
    expect(safeImageLikeUrl('https://example.test/image.png')).toBe('https://example.test/image.png');
    expect(safeImageLikeUrl('data:image/svg+xml,%3Csvg%2F%3E')).toBe('data:image/svg+xml,%3Csvg%2F%3E');
    expect(safeImageLikeUrl('blob:https://example.test/id')).toBe('blob:https://example.test/id');
    expect(safeImageLikeUrl('#paint')).toBe('#paint');
    expect(safeImageLikeUrl('/asset.png')).toBe('/asset.png');
    expect(safeImageLikeUrl('./asset.png')).toBe('./asset.png');

    expect(isSafeImageLikeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageLikeUrl('data:text/html,boom')).toBe(false);
    expect(isSafeImageLikeUrl('//example.test/image.png')).toBe(false);
    expect(isSafeImageLikeUrl('https://example.test/\nimage.png')).toBe(false);
    expect(safeImageLikeCssUrl('https://example.test/image.png"bad<{x}>')).toBe('https://example.test/image.pngbadx');
    expect(safeImageLikeCssUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });

  it('validates inline text hrefs separately from asset URLs', () => {
    expect(safeInlineHref('https://example.test/docs')).toBe('https://example.test/docs');
    expect(safeInlineHref('mailto:hello@example.test')).toBe('mailto:hello@example.test');
    expect(safeInlineHref('tel:+123456789')).toBe('tel:+123456789');
    expect(safeInlineHref('#section')).toBe('#section');
    expect(safeInlineHref('/details.html')).toBe('/details.html');
    expect(safeInlineHref('../details.html')).toBe('../details.html');
    expect(safeInlineHref('details.html?x=1#top')).toBe('details.html?x=1#top');

    expect(isSafeInlineHref('')).toBe(false);
    expect(isSafeInlineHref('javascript:alert(1)')).toBe(false);
    expect(isSafeInlineHref('data:image/png;base64,abc')).toBe(false);
    expect(isSafeInlineHref('blob:https://example.test/id')).toBe(false);
    expect(isSafeInlineHref('//example.test/details.html')).toBe(false);
  });

  it('routes URL validation through one context-aware sanitizer', () => {
    expect(safeUrlForContext('https://example.test/image.png', 'image-like')).toBe('https://example.test/image.png');
    expect(safeUrlForContext('javascript:alert(1)', 'image-like')).toBeNull();
    expect(safeUrlForContext('https://example.test/embed', 'iframe-src')).toBe('https://example.test/embed');
    expect(safeUrlForContext('mailto:hello@example.test', 'iframe-src')).toBeNull();
    expect(safeUrlForContext('details.html', 'inline-href')).toBe('details.html');
    expect(safeUrlForContext('blob:https://example.test/id', 'inline-href')).toBeNull();
  });

  it('allows only same-export-resource hrefs for generated PWA links and scripts', () => {
    expect(safeExportResourceHref('manifest.json')).toBe('manifest.json');
    expect(safeExportResourceHref('./assets/site.webmanifest')).toBe('./assets/site.webmanifest');
    expect(safeExportResourceHref('/sw.js')).toBe('/sw.js');

    expect(safeExportResourceHref('https://example.test/sw.js')).toBeNull();
    expect(safeExportResourceHref('//example.test/sw.js')).toBeNull();
    expect(safeExportResourceHref('./sw.js?cache=1')).toBeNull();
    expect(safeExportResourceHref("./sw.js');alert(1);//")).toBeNull();
    expect(safeExportResourceHref('../bad/../../sw.js')).toBeNull();
  });
});
