import { describe, expect, it } from 'vitest';
import { sanitizeSvgMarkup } from './svgSanitizer';

function sanitizeOk(input: string, prefix = 'svg-test-') {
  const result = sanitizeSvgMarkup(input, prefix);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('svg sanitizer', () => {
  it('keeps basic shapes and normalizes root sizing', () => {
    const result = sanitizeOk('<svg width="24" height="16"><path id="icon" d="M0 0H24V16H0Z" fill="#fff"/></svg>', 'svg-el-');
    expect(result.viewBox).toBe('0 0 24 16');
    expect(result.svg).toContain('viewBox="0 0 24 16"');
    expect(result.svg).toContain('id="svg-el-icon"');
    expect(result.svg).not.toContain('width="24"');
    expect(result.svg).not.toContain('height="16"');
  });

  it('strips scripts, events, foreignObject, comments, and unsafe urls', () => {
    const result = sanitizeOk(`
      <svg viewBox="0 0 20 20" onclick="alert(1)">
        <!-- nope -->
        <script>window.__svgExecuted = true</script>
        <foreignObject><div>html</div></foreignObject>
        <animate attributeName="x" />
        <path d="M0 0H20V20H0Z" fill="url(http://evil.test/x)" onload="alert(1)" />
        <a href="javascript:alert(1)"><path d="M1 1H2V2H1Z" /></a>
      </svg>
    `, 'svg-safe-');
    expect(result.svg).not.toMatch(/script|foreignObject|animate|onclick|onload|javascript|http:\/\/evil/i);
    expect(result.svg).toContain('<path d="M0 0H20V20H0Z"');
  });

  it('rewrites local id references deterministically', () => {
    const result = sanitizeOk(`
      <svg viewBox="0 0 10 10">
        <defs><linearGradient id="grad"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
        <path id="shape" d="M0 0H10V10H0Z" fill="url(#grad)" clip-path="url(#shape)" />
      </svg>
    `, 'svg-abc-');
    expect(result.svg).toContain('id="svg-abc-grad"');
    expect(result.svg).toContain('id="svg-abc-shape"');
    expect(result.svg).toContain('fill="url(#svg-abc-grad)"');
    expect(result.svg).toContain('clip-path="url(#svg-abc-shape)"');
  });

  it('keeps duplicate ids unique while references keep pointing at the first kept target', () => {
    const result = sanitizeOk(`
      <svg viewBox="0 0 10 10">
        <defs>
          <linearGradient id="dup"><stop offset="0" stop-color="#fff"/></linearGradient>
          <linearGradient id="dup"><stop offset="1" stop-color="#000"/></linearGradient>
        </defs>
        <path d="M0 0H10V10H0Z" fill="url(#dup)" />
      </svg>
    `, 'svg-dupe-');
    expect(result.svg).toContain('id="svg-dupe-dup"');
    expect(result.svg).toContain('id="svg-dupe-dup-2"');
    expect(result.svg).toContain('fill="url(#svg-dupe-dup)"');
    expect(result.svg).not.toContain('fill="url(#svg-dupe-dup-2)"');
  });

  it('removes missing local references without breaking kept local hrefs and paint servers', () => {
    const result = sanitizeOk(`
      <svg viewBox="0 0 12 12">
        <defs>
          <linearGradient id="grad"><stop offset="0" stop-color="#fff"/></linearGradient>
          <clipPath id="clip"><path id="clip-shape" d="M0 0H8V8H0Z" /></clipPath>
          <mask id="mask"><rect width="12" height="12" fill="#fff" /></mask>
        </defs>
        <path id="mark" d="M0 0H12V12H0Z" fill="url(#grad)" stroke="url(#missing)" clip-path="url(#clip)" mask="url(#mask)" href="#grad" xlink:href="#missing" />
      </svg>
    `, 'svg-ref-');
    expect(result.svg).toContain('fill="url(#svg-ref-grad)"');
    expect(result.svg).toContain('clip-path="url(#svg-ref-clip)"');
    expect(result.svg).toContain('mask="url(#svg-ref-mask)"');
    expect(result.svg).toContain('href="#svg-ref-grad"');
    expect(result.svg).toContain('stroke="none"');
    expect(result.svg).not.toContain('xlink:href="#missing"');
  });

  it('strips deferred elements, classes, inline styles, and their subtrees', () => {
    const result = sanitizeOk(`
      <svg viewBox="0 0 20 20">
        <style>@import url(https://evil.test/a.css); path { fill: red; }</style>
        <filter id="blur"><feImage href="https://evil.test/filter.png" /></filter>
        <image href="data:image/png;base64,aaa" width="20" height="20" />
        <use href="#safe" />
        <set attributeName="x" to="10" />
        <animateTransform attributeName="transform" />
        <path id="safe" class="remote-class" style="fill:url(https://evil.test/style.svg)" d="M0 0H20V20H0Z" fill="#123456" />
      </svg>
    `, 'svg-defer-');
    expect(result.svg).toContain('id="svg-defer-safe"');
    expect(result.svg).toContain('fill="#123456"');
    expect(result.svg).not.toMatch(/<style|@import|<filter|feImage|<image|<use|<set|animateTransform|class=|style=|https:\/\/evil|data:image/i);
  });

  it('strips unsafe URL schemes and obfuscated script protocols from attributes', () => {
    const result = sanitizeOk(`
      <svg viewBox="0 0 20 20">
        <defs><linearGradient id="ok"><stop offset="0" stop-color="#fff" /></linearGradient></defs>
        <path id="remote" d="M0 0H5V5H0Z" fill="url(https://evil.test/paint.svg)" stroke="f i l e :///tmp/paint.svg" mask="url(//evil.test/mask.svg)" />
        <path id="scripted" d="M6 0H10V5H6Z" fill="j a v a s c r i p t:alert(1)" stroke="vbscript:msgbox(1)" clip-path="url(data:image/svg+xml,evil)" />
        <path id="safe" d="M0 6H20V20H0Z" fill="url(#ok)" />
      </svg>
    `, 'svg-url-');
    expect(result.svg).toContain('fill="url(#svg-url-ok)"');
    expect(result.svg).not.toMatch(/javascript|vbscript|file:|https:\/\/evil|data:image|\/\/evil/i);
  });

  it('escapes text nodes and drops unsafe raw attribute values', () => {
    const result = sanitizeOk(`
      <svg viewBox="0 0 24 12" aria-label="Safe logo">
        <title>AT&T Logo</title>
        <text x="1" y="8">Tom & Jerry</text>
        <path d="M0 0H24V12H0Z" aria-label="bad\u0001label" />
      </svg>
    `, 'svg-text-');
    expect(result.svg).toContain('<title>AT&amp;T Logo</title>');
    expect(result.svg).toContain('<text x="1" y="8">Tom &amp; Jerry</text>');
    expect(result.svg).toContain('aria-label="Safe logo"');
    expect(result.svg).not.toContain('bad');
  });

  it('rejects empty or dimensionless svg roots', () => {
    expect(sanitizeSvgMarkup('<svg><path d="M0 0"/></svg>', 'x-').ok).toBe(false);
    expect(sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><defs><linearGradient id="g" /></defs><title>Only metadata</title></svg>', 'x-').ok).toBe(false);
    expect(sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><g /></svg>', 'x-').ok).toBe(false);
    expect(sanitizeSvgMarkup('<div>nope</div>', 'x-').ok).toBe(false);
  });
});
