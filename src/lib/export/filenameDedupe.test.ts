import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement } from '../../types';
import {
  dedupeFilenames,
  defaultFrameFilename,
  deriveFrameCopyFilename,
  deriveOrphanFilename,
  deriveSliceFilename,
  sanitizeExportHtmlFilename,
} from './filenameDedupe';

function element(id: string, extra: Partial<FrameElement> = {}): FrameElement {
  return {
    id,
    type: 'section',
    targetFrameId: null,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    content: '',
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    ...extra,
  };
}

function frame(id: string, filename: string, elements: FrameElement[] = []): Frame {
  return {
    id,
    name: id,
    filename,
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    background: '#fff',
    elements,
  };
}

describe('filenameDedupe', () => {
  it('sanitizes unsafe export HTML filenames into flat filesystem-safe names', () => {
    expect(sanitizeExportHtmlFilename('../<script>.html?download=1', 'page.html')).toBe('script.html');
    expect(sanitizeExportHtmlFilename('nested/path/My Page', 'page.html')).toBe('nested-path-My-Page.html');
    expect(sanitizeExportHtmlFilename('.htaccess', 'fallback.html')).toBe('htaccess.html');
    expect(sanitizeExportHtmlFilename('CON', 'page.html')).toBe('page-CON.html');
    expect(sanitizeExportHtmlFilename('', 'fallback.html')).toBe('fallback.html');
  });

  it('dedupes frame and orphan filenames with stable html suffixes', () => {
    const frames = [frame('home-id', 'index.html'), frame('about-id', 'index.html'), frame('raw-id', 'raw')];
    const orphans = [
      element('loose-a', { filename: 'index.html' }),
      element('loose-b', { filename: 'standalone.htm' }),
      element('loose-c'),
    ];

    expect(dedupeFilenames(frames, orphans)).toBe(2);
    expect(frames.map(item => item.filename)).toEqual(['index.html', 'index-2.html', 'raw.html']);
    expect(orphans.map(item => item.filename)).toEqual(['index-3.html', 'standalone.htm', undefined]);
  });

  it('dedupes sanitized names case-insensitively to avoid filesystem collisions', () => {
    const frames = [
      frame('unsafe', '../Index.HTML?x=1'),
      frame('case', 'index.html'),
      frame('reserved', 'AUX'),
    ];
    const orphans = [element('loose-a', { filename: 'folder/index.htm' })];

    expect(dedupeFilenames(frames, orphans)).toBe(1);
    expect(frames.map(item => item.filename)).toEqual(['Index.html', 'index-2.html', 'page-AUX.html']);
    expect(orphans.map(item => item.filename)).toEqual(['folder-index.htm']);
  });

  it('derives orphan and slice filenames from content while avoiding used names', () => {
    const home = frame('home', 'index.html', [
      element('slice-a', { type: 'slice', name: 'Hero', filename: 'home-hero.html' }),
    ]);
    const about = frame('about', 'about.html');
    const orphan = element('loose', { type: 'text', content: 'Contact Us!', filename: 'contact-us.html' });
    const nextOrphan = element('loose-next', { type: 'text', content: 'Contact Us!' });
    const slice = element('slice-b', { type: 'slice', name: 'Hero' });

    expect(deriveOrphanFilename(nextOrphan, [home, about], [orphan])).toBe('contact-us-2.html');
    expect(deriveSliceFilename(slice, home, [home, about], [orphan])).toBe('home-hero-2.html');
  });

  it('sanitizes explicit orphan and slice filenames while preserving uniqueness', () => {
    const home = frame('home', 'index.html', [
      element('slice-a', { type: 'slice', filename: 'folder/index.html' }),
    ]);
    const orphan = element('loose', { type: 'text', filename: '../index.html' });
    const slice = element('slice-b', { type: 'slice', filename: '../index.html?download=1' });

    expect(deriveOrphanFilename(orphan, [home], [])).toBe('index-2.html');
    expect(deriveSliceFilename(slice, home, [home], [orphan])).toBe('index-2.html');
  });

  it('derives default and duplicate frame filenames', () => {
    const frames = [
      frame('home', 'index.html'),
      frame('copy', 'index-copy.html'),
      frame('copy-2', 'index-copy-2.html'),
    ];

    expect(defaultFrameFilename(1)).toBe('index.html');
    expect(defaultFrameFilename(3)).toBe('page-3.html');
    expect(deriveFrameCopyFilename('index.html', frames)).toBe('index-copy-3.html');
    expect(deriveFrameCopyFilename('', frames)).toBe('page-copy.html');
  });
});
