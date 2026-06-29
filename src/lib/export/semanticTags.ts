import type { Frame, FrameElement } from '../../types';

export interface SemanticTagContext {
  frame?: Frame;
  /** True when this element would render inside an <a> or <button>. */
  interactiveAncestor?: boolean;
  /** Precomputed heading rank map from rankHeadings(frame). */
  headingRanks?: Map<string, 'h1' | 'h2' | 'p'>;
}

const ALLOWED_MANUAL_TAGS = new Set([
  'header', 'nav', 'main', 'section', 'article', 'aside', 'footer',
  'h1', 'h2', 'h3', 'p', 'span', 'div', 'a', 'button',
]);

function hasInteractiveIntent(el: FrameElement): boolean {
  return el.isButton === true || !!el.targetFrameId;
}

function flattenElements(elements: FrameElement[]): FrameElement[] {
  const result: FrameElement[] = [];
  for (const element of elements) {
    if (element.hidden) continue;
    result.push(element);
    if (element.children?.length) result.push(...flattenElements(element.children));
  }
  return result;
}

export function rankHeadings(frame: Frame): Map<string, 'h1' | 'h2' | 'p'> {
  const textElements = flattenElements(frame.elements)
    .filter((element): element is FrameElement => element.type === 'text')
    .sort((a, b) => (b.fontSize - a.fontSize) || (a.y - b.y) || (a.x - b.x));
  const ranks = new Map<string, 'h1' | 'h2' | 'p'>();
  const uniqueSizes = [...new Set(textElements.map(element => Math.round(Math.max(1, element.fontSize))))]
    .sort((a, b) => b - a);
  const h1Size = uniqueSizes[0];
  const h2Size = uniqueSizes[1];
  let h1Assigned = false;
  for (const element of textElements) {
    const size = Math.round(Math.max(1, element.fontSize));
    if (!h1Assigned && size === h1Size) {
      ranks.set(element.id, 'h1');
      h1Assigned = true;
    } else if (h2Size !== undefined && size === h2Size) {
      ranks.set(element.id, 'h2');
    } else {
      ranks.set(element.id, 'p');
    }
  }
  return ranks;
}

function groupHasLinks(el: FrameElement): boolean {
  return (el.children ?? []).some(child => hasInteractiveIntent(child) || groupHasLinks(child));
}

export function inferSemanticTag(el: FrameElement, ctx: SemanticTagContext = {}): string {
  const manual = el.semanticTag?.trim().toLowerCase();
  if (manual && ALLOWED_MANUAL_TAGS.has(manual)) {
    if (ctx.interactiveAncestor && (manual === 'a' || manual === 'button')) return 'span';
    return manual;
  }

  if (ctx.interactiveAncestor && hasInteractiveIntent(el)) return 'span';
  if (el.isButton && el.targetFrameId) return 'a';
  if (el.isButton) return 'button';

  if (el.type === 'text') {
    return ctx.headingRanks?.get(el.id) ?? (ctx.frame ? rankHeadings(ctx.frame).get(el.id) : undefined) ?? 'p';
  }

  if (el.type === 'group' || (el.type === 'section' && !!el.children?.length && !el.shapeKind)) {
    const frameHeight = Math.max(1, ctx.frame?.height ?? 0);
    const bottom = el.y + Math.max(0, el.height);
    if (el.y < 120 && groupHasLinks(el)) return 'header';
    if (el.y < 160 && groupHasLinks(el)) return 'nav';
    if (bottom > frameHeight * 0.85) return 'footer';
    return 'section';
  }

  if (el.type === 'section') return 'section';
  if (el.type === 'iframe') return 'iframe';
  if (el.type === 'input') return 'input';
  if (el.type === 'textarea') return 'textarea';
  if (el.type === 'list') return el.listKind === 'ol' ? 'ol' : 'ul';
  if (el.type === 'image') return 'img';
  return 'div';
}
