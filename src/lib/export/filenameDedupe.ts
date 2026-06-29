import type { Frame, FrameElement } from '../../types';

const MAX_EXPORT_FILENAME_LENGTH = 128;
const RESERVED_WINDOWS_STEMS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function slugSeed(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function filenameKey(filename: string): string {
  return filename.toLocaleLowerCase();
}

function stemFromFallback(fallback: string): string {
  return slugSeed(fallback.replace(/\.html?$/i, ''), 'page');
}

export function sanitizeExportHtmlFilename(name: string | undefined, fallback = 'page.html'): string {
  const fallbackStem = stemFromFallback(fallback);
  const raw = (name?.trim() || fallback).normalize('NFKC');
  const queryless = raw.split(/[?#]/)[0] || fallback;
  const noSeparators = queryless
    .replace(/[\\/]+/g, '-')
    .replace(/[\u0000-\u001f\u007f]+/g, '-')
    .replace(/[<>:"|?*#]+/g, '-')
    .replace(/\s+/g, '-');
  const extensionMatch = noSeparators.match(/\.html?$/i);
  const extension = extensionMatch?.[0].toLowerCase() ?? '.html';
  let stem = extensionMatch ? noSeparators.slice(0, -extensionMatch[0].length) : noSeparators;
  stem = stem
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '');
  if (!stem) stem = fallbackStem;
  if (RESERVED_WINDOWS_STEMS.test(stem)) stem = `page-${stem}`;
  const maxStemLength = Math.max(1, MAX_EXPORT_FILENAME_LENGTH - extension.length);
  if (stem.length > maxStemLength) {
    stem = stem.slice(0, maxStemLength).replace(/[.-]+$/g, '') || fallbackStem;
  }
  return `${stem}${extension}`;
}

function addUsedFilename(used: Set<string>, name: string | undefined, fallback: string): void {
  used.add(filenameKey(sanitizeExportHtmlFilename(name, fallback)));
}

function uniqueFilename(base: string, used: Set<string>): { filename: string; renamed: boolean } {
  if (!used.has(filenameKey(base))) {
    used.add(filenameKey(base));
    return { filename: base, renamed: false };
  }
  const stem = base.replace(/\.html?$/i, '');
  const extension = base.match(/\.htm$/i) ? '.htm' : '.html';
  let index = 2;
  let candidate = `${stem}-${index}${extension}`;
  while (used.has(filenameKey(candidate))) {
    index += 1;
    candidate = `${stem}-${index}${extension}`;
  }
  used.add(filenameKey(candidate));
  return { filename: candidate, renamed: true };
}

function sliceFilenameCandidates(frame: Frame): FrameElement[] {
  return frame.elements.filter(element => element.type === 'slice' && !element.hidden);
}

export function defaultFrameFilename(frameCount: number): string {
  return frameCount === 1 ? 'index.html' : `page-${frameCount}.html`;
}

/**
 * Walks frames + orphans and auto-suffixes any duplicate filenames so each
 * exported HTML file lands in its own slot. Mutates the input arrays.
 */
export function dedupeFilenames(frames: Frame[], orphans: FrameElement[]): number {
  const used = new Set<string>();
  let renames = 0;
  for (const frame of frames) {
    const { filename, renamed } = uniqueFilename(
      sanitizeExportHtmlFilename(frame.filename, `page-${frame.id.slice(0, 6)}.html`),
      used,
    );
    frame.filename = filename;
    if (renamed) renames += 1;
  }
  for (const orphan of orphans) {
    if (!orphan.filename) continue;
    const { filename, renamed } = uniqueFilename(
      sanitizeExportHtmlFilename(orphan.filename, `${orphan.type}-${orphan.id.slice(0, 6)}.html`),
      used,
    );
    orphan.filename = filename;
    if (renamed) renames += 1;
  }
  return renames;
}

export function deriveOrphanFilename(el: FrameElement, frames: Frame[], orphans: FrameElement[]): string {
  const used = new Set<string>();
  frames.forEach(frame => addUsedFilename(used, frame.filename, `page-${frame.id.slice(0, 6)}.html`));
  orphans
    .filter(orphan => orphan.id !== el.id && orphan.filename)
    .forEach(orphan => addUsedFilename(used, orphan.filename, `${orphan.type}-${orphan.id.slice(0, 6)}.html`));
  if (el.filename) {
    return uniqueFilename(
      sanitizeExportHtmlFilename(el.filename, `${el.type}-${el.id.slice(0, 6)}.html`),
      used,
    ).filename;
  }
  const seed = slugSeed(el.name?.trim() || el.content?.trim().slice(0, 24), el.type);
  return uniqueFilename(sanitizeExportHtmlFilename(`${seed}.html`, `${el.type}.html`), used).filename;
}

export function deriveSliceFilename(slice: FrameElement, frame: Frame, allFrames: Frame[] = [], orphans: FrameElement[] = []): string {
  const used = new Set<string>();
  allFrames.forEach(candidate => addUsedFilename(used, candidate.filename, `page-${candidate.id.slice(0, 6)}.html`));
  allFrames.forEach(candidate => {
    sliceFilenameCandidates(candidate)
      .filter(candidateSlice => candidateSlice.id !== slice.id && candidateSlice.filename)
      .forEach(candidateSlice => addUsedFilename(used, candidateSlice.filename, `${candidate.name}-slice.html`));
  });
  orphans
    .filter(orphan => orphan.filename)
    .forEach(orphan => addUsedFilename(used, orphan.filename, `${orphan.type}-${orphan.id.slice(0, 6)}.html`));
  if (slice.filename) {
    return uniqueFilename(
      sanitizeExportHtmlFilename(slice.filename, `${frame.name}-slice.html`),
      used,
    ).filename;
  }
  const seed = slugSeed(`${frame.name}-${slice.name?.trim() || slice.content?.trim() || 'slice'}`, 'slice');
  return uniqueFilename(sanitizeExportHtmlFilename(`${seed}.html`, 'slice.html'), used).filename;
}

export function deriveFrameCopyFilename(filename: string, frames: ReadonlyArray<Frame>): string {
  const safeSource = sanitizeExportHtmlFilename(filename, 'page.html');
  const extension = safeSource.match(/\.htm$/i) ? '.htm' : '.html';
  const stem = safeSource.replace(/\.html?$/i, '') || 'page';
  const filenames = new Set<string>();
  frames.forEach(frame => addUsedFilename(filenames, frame.filename, `page-${frame.id.slice(0, 6)}.html`));
  return uniqueFilename(`${stem}-copy${extension}`, filenames).filename;
}
