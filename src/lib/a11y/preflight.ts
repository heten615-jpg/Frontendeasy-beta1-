import type { Frame, FrameElement, ProjectPayload, StudioState } from '../../types';
import type { KnownAsset } from '../assets/assetInventory';
import { mediaAssetReferencesForElement } from '../editor/mediaFill';
import { isSafeIframeSrc, safeInlineHref } from '../security/urls';

export type AccessibilityPreflightCode =
  | 'image-missing-alt'
  | 'unsafe-iframe-src'
  | 'broken-link'
  | 'asset-unavailable'
  | 'text-low-contrast'
  | 'tab-order-review'
  | 'export-warning';

export type AccessibilityPreflightSeverity = 'error' | 'warning' | 'info';
export type AccessibilityPreflightScope = 'project' | 'frame' | 'element';
export type AccessibilityPreflightCategory = 'perceivable' | 'operable' | 'export' | 'security';

export interface AccessibilityPreflightIssue {
  id: string;
  code: AccessibilityPreflightCode;
  category: AccessibilityPreflightCategory;
  severity: AccessibilityPreflightSeverity;
  scope: AccessibilityPreflightScope;
  title: string;
  message: string;
  actionLabel?: string;
  wcag?: string;
  frameId?: string | null;
  elementId?: string;
  elementPath?: string[];
  metadata?: Record<string, unknown>;
}

export interface AccessibilityPreflightResult {
  issues: AccessibilityPreflightIssue[];
  counts: Record<AccessibilityPreflightSeverity, number>;
  byFrameId: Record<string, AccessibilityPreflightIssue[]>;
  byElementId: Record<string, AccessibilityPreflightIssue[]>;
}

type PreflightSource = Pick<StudioState | ProjectPayload, 'frames' | 'orphanElements'>;

interface WalkContext {
  frame: Frame | null;
  path: string[];
  background: Rgba | null;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface AccessibilityPreflightOptions {
  knownAssets?: ReadonlyArray<KnownAsset>;
  remoteAssetsAvailable?: boolean;
}

const DEFAULT_LOOSE_BACKGROUND = '#0f0f12';
const CONTRAST_THRESHOLD = 4.5;

function makeEmptyCounts(): Record<AccessibilityPreflightSeverity, number> {
  return { error: 0, warning: 0, info: 0 };
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseSolidColor(value: string | null | undefined): Rgba | null {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const body = hex[1];
    const full = body.length === 3
      ? body.split('').map(char => char + char).join('')
      : body;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgb = raw.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(',').map(part => part.trim());
    if (parts.length < 3) return null;
    const [r, g, b] = parts.slice(0, 3).map(Number);
    const a = parts[3] === undefined ? 1 : Number(parts[3]);
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return {
      r: clampChannel(r),
      g: clampChannel(g),
      b: clampChannel(b),
      a: clampAlpha(a),
    };
  }
  return null;
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const a = foreground.a + background.a * (1 - foreground.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: clampChannel((foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / a),
    g: clampChannel((foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / a),
    b: clampChannel((foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / a),
    a,
  };
}

function colorToHex(color: Rgba): string {
  return `#${[color.r, color.g, color.b].map(channel => clampChannel(channel).toString(16).padStart(2, '0')).join('')}`;
}

function relativeLuminance(color: Rgba): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseSolidColor(foreground);
  const bg = parseSolidColor(background);
  if (!fg || !bg) return null;
  const solidFg = composite(fg, bg);
  const l1 = relativeLuminance(solidFg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function mix(color: Rgba, target: Rgba, amount: number): Rgba {
  return {
    r: clampChannel(color.r + (target.r - color.r) * amount),
    g: clampChannel(color.g + (target.g - color.g) * amount),
    b: clampChannel(color.b + (target.b - color.b) * amount),
    a: 1,
  };
}

function suggestedTextColor(foreground: Rgba, background: Rgba): { color: string; kind: 'darker' | 'lighter' } {
  const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
  const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  for (let step = 0.08; step <= 1; step += 0.04) {
    const darker = mix(foreground, black, step);
    if ((contrastRatio(colorToHex(darker), colorToHex(background)) ?? 0) >= CONTRAST_THRESHOLD) {
      return { color: colorToHex(darker), kind: 'darker' };
    }
  }
  for (let step = 0.08; step <= 1; step += 0.04) {
    const lighter = mix(foreground, white, step);
    if ((contrastRatio(colorToHex(lighter), colorToHex(background)) ?? 0) >= CONTRAST_THRESHOLD) {
      return { color: colorToHex(lighter), kind: 'lighter' };
    }
  }
  const blackRatio = contrastRatio(colorToHex(black), colorToHex(background)) ?? 0;
  const whiteRatio = contrastRatio(colorToHex(white), colorToHex(background)) ?? 0;
  return blackRatio >= whiteRatio
    ? { color: '#000000', kind: 'darker' }
    : { color: '#ffffff', kind: 'lighter' };
}

function walkElements(
  elements: ReadonlyArray<FrameElement>,
  context: WalkContext,
  visit: (element: FrameElement, context: WalkContext) => void,
): void {
  for (const element of elements) {
    if (element.hidden) continue;
    const elementBackground = parseSolidColor(element.background);
    const effectiveBackground = elementBackground && context.background
      ? composite(elementBackground, context.background)
      : elementBackground ?? context.background;
    const nextContext = { frame: context.frame, path: [...context.path, element.id], background: effectiveBackground };
    visit(element, nextContext);
    if (element.children?.length) walkElements(element.children, nextContext, visit);
  }
}

function issueLocationKey(context: WalkContext): string {
  return `${context.frame?.id ?? 'loose'}:${context.path.join('/')}`;
}

function collectMissingAltIssue(element: FrameElement, context: WalkContext): AccessibilityPreflightIssue | null {
  if (element.type !== 'image') return null;
  if (element.alt?.trim()) return null;
  return {
    id: `image-missing-alt:${issueLocationKey(context)}`,
    code: 'image-missing-alt',
    category: 'perceivable',
    severity: 'warning',
    scope: 'element',
    title: 'Image is missing alt text',
    message: 'Screen reader users cannot understand this image in exported pages unless it has meaningful alt text or an explicit decorative-image policy.',
    actionLabel: 'Add alt text',
    wcag: 'WCAG 1.1.1 Non-text Content',
    frameId: context.frame?.id ?? null,
    elementId: element.id,
    elementPath: context.path,
  };
}

function collectUnsafeIframeIssue(element: FrameElement, context: WalkContext): AccessibilityPreflightIssue | null {
  if (element.type !== 'iframe') return null;
  if (isSafeIframeSrc(element.iframeSrc)) return null;
  return {
    id: `unsafe-iframe-src:${issueLocationKey(context)}`,
    code: 'unsafe-iframe-src',
    category: 'security',
    severity: 'error',
    scope: 'element',
    title: 'Iframe URL will be replaced on export',
    message: 'This iframe source is not an allowed http, https, about:blank, or relative URL, so export will replace it with about:blank.',
    actionLabel: 'Fix iframe URL',
    frameId: context.frame?.id ?? null,
    elementId: element.id,
    elementPath: context.path,
    metadata: { iframeSrc: element.iframeSrc ?? '' },
  };
}

function frameExists(frames: ReadonlyArray<Frame>, frameId: string | null | undefined): boolean {
  return !!frameId && frames.some(frame => frame.id === frameId);
}

function localHtmlHref(value: string | null | undefined): string | null {
  const safe = safeInlineHref(value);
  if (!safe) return null;
  if (/^(?:https?:|mailto:|tel:|#)/i.test(safe)) return null;
  const path = safe.replace(/^\.?\//, '').split(/[?#]/)[0];
  return /\.html?$/i.test(path) ? path : null;
}

function frameFilenameExists(frames: ReadonlyArray<Frame>, filename: string): boolean {
  return frames.some(frame => frame.filename === filename);
}

function collectBrokenLinkIssues(
  element: FrameElement,
  context: WalkContext,
  frames: ReadonlyArray<Frame>,
): AccessibilityPreflightIssue[] {
  const issues: AccessibilityPreflightIssue[] = [];
  if (element.isButton && element.targetFrameId && !frameExists(frames, element.targetFrameId)) {
    issues.push({
      id: `broken-link:${issueLocationKey(context)}:button`,
      code: 'broken-link',
      category: 'operable',
      severity: 'error',
      scope: 'element',
      title: 'Button link target is missing',
      message: 'This button points to a page that no longer exists, so export will fall back to a # link.',
      actionLabel: 'Choose target page',
      frameId: context.frame?.id ?? null,
      elementId: element.id,
      elementPath: context.path,
      metadata: { targetFrameId: element.targetFrameId },
    });
  }

  if (!element.textRuns?.length) return issues;
  element.textRuns.forEach((run, index) => {
    if (run.targetFrameId && !frameExists(frames, run.targetFrameId)) {
      issues.push({
        id: `broken-link:${issueLocationKey(context)}:run:${index}:target`,
        code: 'broken-link',
        category: 'operable',
        severity: 'error',
        scope: 'element',
        title: 'Inline link target is missing',
        message: 'This inline text link points to a page that no longer exists, so it will be dropped from exported text.',
        actionLabel: 'Relink text',
        frameId: context.frame?.id ?? null,
        elementId: element.id,
        elementPath: context.path,
        metadata: { targetFrameId: run.targetFrameId, runIndex: index },
      });
      return;
    }
    if (run.href && !safeInlineHref(run.href)) {
      issues.push({
        id: `broken-link:${issueLocationKey(context)}:run:${index}:unsafe`,
        code: 'broken-link',
        category: 'security',
        severity: 'warning',
        scope: 'element',
        title: 'Inline link URL will be dropped',
        message: 'This inline link uses an unsupported or unsafe URL, so export will omit the link.',
        actionLabel: 'Fix URL',
        frameId: context.frame?.id ?? null,
        elementId: element.id,
        elementPath: context.path,
        metadata: { href: run.href, runIndex: index },
      });
      return;
    }
    const localHref = localHtmlHref(run.href);
    if (localHref && !frameFilenameExists(frames, localHref)) {
      issues.push({
        id: `broken-link:${issueLocationKey(context)}:run:${index}:href`,
        code: 'broken-link',
        category: 'operable',
        severity: 'warning',
        scope: 'element',
        title: 'Inline link points to a missing page file',
        message: `This inline link points to ${localHref}, but no project page exports with that filename.`,
        actionLabel: 'Relink text',
        frameId: context.frame?.id ?? null,
        elementId: element.id,
        elementPath: context.path,
        metadata: { href: run.href, filename: localHref, runIndex: index },
      });
    }
  });
  return issues;
}

function knownAssetKey(assetId: string, path?: string): string {
  return assetId || path || 'unknown';
}

function knownAssetKeys(assets: ReadonlyArray<KnownAsset> | undefined): Set<string> | null {
  if (!assets) return null;
  const keys = new Set<string>();
  for (const asset of assets) {
    keys.add(knownAssetKey(asset.assetId, asset.path));
    if (asset.assetId) keys.add(asset.assetId);
    if (asset.path) keys.add(asset.path);
  }
  return keys;
}

function hasKnownAsset(keys: Set<string> | null, assetId: string, path?: string): boolean {
  if (!keys) return true;
  return keys.has(knownAssetKey(assetId, path)) || keys.has(assetId) || (!!path && keys.has(path));
}

function collectAssetIssues(
  element: FrameElement,
  context: WalkContext,
  knownKeys: Set<string> | null,
  remoteAssetsAvailable: boolean,
): AccessibilityPreflightIssue[] {
  const issues: AccessibilityPreflightIssue[] = [];
  const partialRefs: Array<{ property: 'image' | 'media-fill'; assetId?: string; path?: string }> = [];
  if ((element.imageAssetId || element.imageAssetPath) && !(element.imageAssetId && element.imageAssetPath)) {
    partialRefs.push({ property: 'image', assetId: element.imageAssetId, path: element.imageAssetPath });
  }
  if ((element.mediaFill?.assetId || element.mediaFill?.assetPath) && !(element.mediaFill?.assetId && element.mediaFill?.assetPath)) {
    partialRefs.push({ property: 'media-fill', assetId: element.mediaFill.assetId, path: element.mediaFill.assetPath });
  }

  for (const ref of partialRefs) {
    issues.push({
      id: `asset-unavailable:${issueLocationKey(context)}:${ref.property}:partial`,
      code: 'asset-unavailable',
      category: 'export',
      severity: 'error',
      scope: 'element',
      title: 'Asset reference is incomplete',
      message: 'This layer has only part of an asset reference, so preview/export cannot resolve the media reliably.',
      actionLabel: 'Replace asset',
      frameId: context.frame?.id ?? null,
      elementId: element.id,
      elementPath: context.path,
      metadata: { property: ref.property, assetId: ref.assetId ?? '', path: ref.path ?? '' },
    });
  }

  if (remoteAssetsAvailable) return issues;
  for (const ref of mediaAssetReferencesForElement(element)) {
    if (hasKnownAsset(knownKeys, ref.assetId, ref.path)) continue;
    issues.push({
      id: `asset-unavailable:${issueLocationKey(context)}:${ref.property}:${ref.assetId}`,
      code: 'asset-unavailable',
      category: 'export',
      severity: 'error',
      scope: 'element',
      title: 'Asset reference is unavailable',
      message: 'This layer points to an asset that is not available in the local cache. Export will fall back to a placeholder unless the asset can be restored or cloud access is available.',
      actionLabel: 'Replace asset',
      frameId: context.frame?.id ?? null,
      elementId: element.id,
      elementPath: context.path,
      metadata: { property: ref.property, assetId: ref.assetId, path: ref.path ?? '' },
    });
  }
  return issues;
}

function isTextContrastCandidate(element: FrameElement): boolean {
  return element.type === 'text' || element.isButton === true;
}

function collectContrastIssue(element: FrameElement, context: WalkContext): AccessibilityPreflightIssue | null {
  if (!isTextContrastCandidate(element)) return null;
  if (!context.background) return null;
  const foreground = parseSolidColor(element.color);
  if (!foreground) return null;
  const solidForeground = composite(foreground, context.background);
  const foregroundHex = colorToHex(solidForeground);
  const backgroundHex = colorToHex(context.background);
  const ratio = contrastRatio(foregroundHex, backgroundHex);
  if (ratio === null || ratio >= CONTRAST_THRESHOLD) return null;
  const suggestion = suggestedTextColor(solidForeground, context.background);
  return {
    id: `text-low-contrast:${issueLocationKey(context)}`,
    code: 'text-low-contrast',
    category: 'perceivable',
    severity: 'warning',
    scope: 'element',
    title: 'Text contrast is below WCAG AA',
    message: `Text contrast is ${ratio.toFixed(2)}:1; WCAG AA expects at least ${CONTRAST_THRESHOLD}:1 for this text.`,
    actionLabel: suggestion.kind === 'darker' ? 'Use darker shade' : 'Use lighter shade',
    wcag: 'WCAG 1.4.3 Contrast (Minimum)',
    frameId: context.frame?.id ?? null,
    elementId: element.id,
    elementPath: context.path,
    metadata: {
      ratio: Number(ratio.toFixed(2)),
      threshold: CONTRAST_THRESHOLD,
      foreground: foregroundHex,
      background: backgroundHex,
      suggestedColor: suggestion.color,
      suggestionKind: suggestion.kind,
    },
  };
}

function indexIssues(issues: AccessibilityPreflightIssue[]): AccessibilityPreflightResult {
  const counts = makeEmptyCounts();
  const byFrameId: Record<string, AccessibilityPreflightIssue[]> = {};
  const byElementId: Record<string, AccessibilityPreflightIssue[]> = {};

  for (const issue of issues) {
    counts[issue.severity] += 1;
    if (issue.frameId) {
      byFrameId[issue.frameId] ??= [];
      byFrameId[issue.frameId].push(issue);
    }
    if (issue.elementId) {
      byElementId[issue.elementId] ??= [];
      byElementId[issue.elementId].push(issue);
    }
  }

  return { issues, counts, byFrameId, byElementId };
}

export function runAccessibilityPreflight(
  source: PreflightSource,
  options: AccessibilityPreflightOptions = {},
): AccessibilityPreflightResult {
  const issues: AccessibilityPreflightIssue[] = [];
  const knownKeys = knownAssetKeys(options.knownAssets);
  const visit = (element: FrameElement, context: WalkContext) => {
    const missingAlt = collectMissingAltIssue(element, context);
    if (missingAlt) issues.push(missingAlt);
    const unsafeIframe = collectUnsafeIframeIssue(element, context);
    if (unsafeIframe) issues.push(unsafeIframe);
    issues.push(...collectBrokenLinkIssues(element, context, source.frames));
    issues.push(...collectAssetIssues(element, context, knownKeys, options.remoteAssetsAvailable === true));
    const lowContrast = collectContrastIssue(element, context);
    if (lowContrast) issues.push(lowContrast);
  };

  for (const frame of source.frames) {
    walkElements(frame.elements, { frame, path: [], background: parseSolidColor(frame.background) }, visit);
  }
  walkElements(source.orphanElements, { frame: null, path: [], background: parseSolidColor(DEFAULT_LOOSE_BACKGROUND) }, visit);

  return indexIssues(issues);
}

export function countAccessibilityIssues(
  result: AccessibilityPreflightResult,
  code: AccessibilityPreflightCode,
): number {
  return result.issues.filter(issue => issue.code === code).length;
}
