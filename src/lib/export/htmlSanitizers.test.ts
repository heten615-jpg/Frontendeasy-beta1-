import { describe, expect, it } from 'vitest';
import {
  applyGenerateHTMLOptions,
  escapeHtml,
  isDarkColor,
  safeBlendMode,
  safeCssVariableName,
  safeTransformOrigin,
  sanitizeCssTokenValue,
  sanitizeCssValue,
} from './htmlSanitizers';

describe('HTML export sanitizers', () => {
  it('escapes HTML and strips unsafe CSS control characters', () => {
    expect(escapeHtml(`<a href="'">`)).toBe('&lt;a href=&quot;&#39;&quot;&gt;');
    expect(sanitizeCssValue('url("x");{}\\<script>')).toBe('script');
    expect(sanitizeCssTokenValue(' #fff;\ncolor:red ')).toBe('#fffcolor:red');
  });

  it('normalizes constrained CSS values', () => {
    expect(safeCssVariableName(' Accent Color! ')).toBe('accent-color');
    expect(safeCssVariableName('!!!')).toBe('color');
    expect(safeTransformOrigin('top left')).toBe('top left');
    expect(safeTransformOrigin('100% 0' as never)).toBe('center center');
    expect(safeBlendMode('multiply')).toBe('multiply');
    expect(safeBlendMode('normal')).toBeNull();
  });

  it('keeps minification opt-in and evaluates simple luminance', () => {
    const html = '<div> A </div>\n<style> .a { color: red; } </style>\n<section>B</section>';
    expect(applyGenerateHTMLOptions(html, {})).toBe(html);
    expect(applyGenerateHTMLOptions(html, { minify: true })).toBe('<div> A </div><style>.a{color:red}</style><section>B</section>');
    expect(isDarkColor('#000')).toBe(true);
    expect(isDarkColor('#fff')).toBe(false);
  });
});
