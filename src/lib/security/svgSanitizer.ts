const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
  'pattern',
  'title',
  'desc',
]);

const TAG_NAMES: Record<string, string> = {
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  clippath: 'clipPath',
};

const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc']);
const RENDERABLE_ELEMENTS = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan']);
const NON_RENDERING_CONTAINERS = new Set(['defs', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern', 'title', 'desc']);

const ALLOWED_ATTRIBUTES = new Set([
  'id',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'viewbox',
  'preserveaspectratio',
  'd',
  'points',
  'transform',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'clip-path',
  'mask',
  'href',
  'xlink:href',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'spreadmethod',
  'patternunits',
  'patterncontentunits',
  'role',
  'aria-label',
  'aria-hidden',
  'xmlns',
]);

const ATTR_NAMES: Record<string, string> = {
  viewbox: 'viewBox',
  preserveaspectratio: 'preserveAspectRatio',
  gradientunits: 'gradientUnits',
  gradienttransform: 'gradientTransform',
  spreadmethod: 'spreadMethod',
  patternunits: 'patternUnits',
  patterncontentunits: 'patternContentUnits',
};

const ATTR_ORDER = [
  'xmlns',
  'viewBox',
  'preserveAspectRatio',
  'role',
  'aria-label',
  'aria-hidden',
  'id',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'width',
  'height',
  'd',
  'points',
  'transform',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'clip-path',
  'mask',
  'href',
  'xlink:href',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'patternUnits',
  'patternContentUnits',
];

interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: Array<SvgNode | string>;
}

export interface SanitizedSvg {
  ok: true;
  svg: string;
  viewBox: string;
  nodeCount: number;
  warnings: string[];
}

export interface RejectedSvg {
  ok: false;
  reason: string;
  warnings: string[];
}

export type SvgSanitizeResult = SanitizedSvg | RejectedSvg;

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

function canonicalTag(tag: string): string {
  const lower = tag.toLowerCase();
  return TAG_NAMES[lower] ?? lower;
}

function canonicalAttr(attr: string): string {
  const lower = attr.toLowerCase();
  return ATTR_NAMES[lower] ?? lower;
}

function sanitizeId(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'id';
}

function hasUnsafeUrl(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toLowerCase();
  return /(?:javascript:|vbscript:|data:|blob:|https?:|ftp:|file:|\/\/)/.test(compact);
}

function isSafeAttrValue(value: string): boolean {
  return !/[\u0000-\u001f<>]/.test(value);
}

function isLocalReference(value: string): boolean {
  return /^#[A-Za-z_][\w.-]*$/.test(value.trim());
}

function attrEntries(raw: string): Array<[string, string]> {
  const attrs: Array<[string, string]> = [];
  const pattern = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    attrs.push([match[1], match[2] ?? match[3] ?? match[4] ?? '']);
  }
  return attrs;
}

function sanitizeAttrs(tag: string, rawAttrs: string, warnings: string[]): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [rawName, rawValue] of attrEntries(rawAttrs)) {
    const lower = rawName.toLowerCase();
    if (lower.startsWith('on') || lower === 'style' || lower === 'class') {
      warnings.push(`stripped ${rawName}`);
      continue;
    }
    if (!ALLOWED_ATTRIBUTES.has(lower)) continue;
    if (lower === 'xmlns' && tag !== 'svg') continue;
    if (!isSafeAttrValue(rawValue)) {
      warnings.push(`stripped unsafe ${rawName}`);
      continue;
    }
    if ((lower === 'href' || lower === 'xlink:href') && !isLocalReference(rawValue)) {
      warnings.push(`stripped external ${rawName}`);
      continue;
    }
    if (hasUnsafeUrl(rawValue)) {
      warnings.push(`stripped unsafe url ${rawName}`);
      continue;
    }
    if (/url\(/i.test(rawValue) && !/url\(\s*#[A-Za-z_][\w.-]*\s*\)/.test(rawValue)) {
      warnings.push(`stripped external url ${rawName}`);
      continue;
    }
    attrs[canonicalAttr(lower)] = rawValue.trim();
  }
  return attrs;
}

function parseSvg(input: string, warnings: string[]): SvgNode | null {
  const rootMatch = input.match(/<svg\b/i);
  const endIndex = input.toLowerCase().lastIndexOf('</svg>');
  if (!rootMatch || endIndex === -1 || rootMatch.index === undefined || endIndex < rootMatch.index) return null;
  const source = input.slice(rootMatch.index, endIndex + '</svg>'.length);
  const tokenPattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![\s\S]*?>|<\/?([A-Za-z][\w:-]*)([^>]*)>/g;
  let root: SvgNode | null = null;
  const stack: SvgNode[] = [];
  let skipDepth = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(source)) !== null) {
    const text = source.slice(lastIndex, match.index);
    if (skipDepth === 0 && text && stack.length && TEXT_ELEMENTS.has(stack[stack.length - 1].tag)) {
      stack[stack.length - 1].children.push(text);
    }
    lastIndex = tokenPattern.lastIndex;

    const token = match[0];
    const rawTag = match[1];
    if (!rawTag || token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<!')) {
      if (token.startsWith('<!--')) warnings.push('stripped comment');
      continue;
    }

    const lowerTag = rawTag.toLowerCase();
    const closing = token.startsWith('</');
    const selfClosing = /\/\s*>$/.test(token);

    if (skipDepth > 0) {
      if (!closing && !selfClosing) skipDepth += 1;
      if (closing) skipDepth -= 1;
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(lowerTag)) {
      warnings.push(`stripped ${rawTag}`);
      if (!closing && !selfClosing) skipDepth = 1;
      continue;
    }

    const tag = canonicalTag(lowerTag);
    if (closing) {
      while (stack.length) {
        const popped = stack.pop();
        if (popped?.tag.toLowerCase() === lowerTag) break;
      }
      continue;
    }

    if (!root && lowerTag !== 'svg') continue;
    const node: SvgNode = {
      tag,
      attrs: sanitizeAttrs(lowerTag, match[2] ?? '', warnings),
      children: [],
    };
    if (!root) root = node;
    if (stack.length) stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return root;
}

function walk(node: SvgNode, visitor: (node: SvgNode) => void): void {
  visitor(node);
  for (const child of node.children) {
    if (typeof child !== 'string') walk(child, visitor);
  }
}

function hasRenderableContent(node: SvgNode, insideNonRenderingContainer = false): boolean {
  const lower = node.tag.toLowerCase();
  const hidden = insideNonRenderingContainer || NON_RENDERING_CONTAINERS.has(lower);
  if (!hidden && RENDERABLE_ELEMENTS.has(lower)) return true;
  return node.children.some(child => typeof child !== 'string' && hasRenderableContent(child, hidden));
}

function rewriteIds(root: SvgNode, prefix: string): void {
  const idMap = new Map<string, string>();
  const used = new Set<string>();
  walk(root, node => {
    const oldId = node.attrs.id;
    if (!oldId) return;
    const base = `${prefix}${sanitizeId(oldId)}`;
    let next = base;
    let index = 2;
    while (used.has(next)) {
      next = `${base}-${index}`;
      index += 1;
    }
    used.add(next);
    if (!idMap.has(oldId)) idMap.set(oldId, next);
    node.attrs.id = next;
  });

  walk(root, node => {
    for (const [name, value] of Object.entries(node.attrs)) {
      if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) {
        const mapped = idMap.get(value.slice(1));
        if (mapped) node.attrs[name] = `#${mapped}`;
        else delete node.attrs[name];
        continue;
      }
      node.attrs[name] = value.replace(/url\(\s*#([A-Za-z_][\w.-]*)\s*\)/g, (_match, id: string) => {
        const mapped = idMap.get(id);
        return mapped ? `url(#${mapped})` : 'none';
      });
    }
  });
}

function normalizeViewBox(root: SvgNode): string | null {
  const explicit = root.attrs.viewBox;
  if (explicit && /^-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?$/.test(explicit.trim())) {
    return explicit.trim().replace(/\s+/g, ' ');
  }
  const width = parseFloat(root.attrs.width ?? '');
  const height = parseFloat(root.attrs.height ?? '');
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return `0 0 ${width} ${height}`;
  }
  return null;
}

function serialize(node: SvgNode): string {
  const ordered = ATTR_ORDER
    .filter(name => node.attrs[name] !== undefined)
    .map(name => `${name}="${escapeAttr(node.attrs[name])}"`);
  const rest = Object.keys(node.attrs)
    .filter(name => !ATTR_ORDER.includes(name))
    .sort()
    .map(name => `${name}="${escapeAttr(node.attrs[name])}"`);
  const attrs = [...ordered, ...rest].join(' ');
  const open = attrs ? `<${node.tag} ${attrs}` : `<${node.tag}`;
  if (node.children.length === 0 && node.tag !== 'svg') return `${open} />`;
  return `${open}>${node.children.map(child => typeof child === 'string' ? escapeText(child) : serialize(child)).join('')}</${node.tag}>`;
}

export function sanitizeSvgMarkup(input: string, idPrefix: string): SvgSanitizeResult {
  const warnings: string[] = [];
  const root = parseSvg(input, warnings);
  if (!root) return { ok: false, reason: 'No valid SVG root found.', warnings };

  const viewBox = normalizeViewBox(root);
  if (!viewBox) return { ok: false, reason: 'SVG needs a valid viewBox or positive width and height.', warnings };
  root.attrs.viewBox = viewBox;
  root.attrs.xmlns = 'http://www.w3.org/2000/svg';
  root.attrs.preserveAspectRatio = root.attrs.preserveAspectRatio ?? 'xMidYMid meet';
  delete root.attrs.width;
  delete root.attrs.height;
  rewriteIds(root, idPrefix);

  let nodeCount = 0;
  walk(root, () => { nodeCount += 1; });
  if (nodeCount <= 1 || !hasRenderableContent(root)) return { ok: false, reason: 'SVG has no visible allowed content.', warnings };

  return {
    ok: true,
    svg: serialize(root),
    viewBox,
    nodeCount,
    warnings,
  };
}
