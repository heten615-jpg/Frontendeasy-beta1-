const RELATIVE_URL_RE = /^(?:\/(?!\/)|\.{1,2}\/)/;
const SIMPLE_HTML_HREF_RE = /^[a-z0-9][a-z0-9._/-]*\.html?(?:[?#].*)?$/i;
const EXPORT_RESOURCE_HREF_RE = /^(?:\/(?!\/)|\.{1,2}\/)?(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.(?:json|webmanifest|js)$/i;
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

const IMAGE_LIKE_PROTOCOLS = new Set(['http:', 'https:', 'blob:']);
const INLINE_HREF_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const IFRAME_PROTOCOLS = new Set(['http:', 'https:']);

export type UrlSanitizerContext =
  | 'image-like'
  | 'image-css-url'
  | 'inline-href'
  | 'iframe-src'
  | 'export-resource';

function normalizedUrlCandidate(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function hasUnsafeUrlCharacters(value: string): boolean {
  return CONTROL_CHAR_RE.test(value);
}

function hasAllowedProtocol(value: string, protocols: ReadonlySet<string>): boolean {
  try {
    return protocols.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isSafeRelativeUrl(value: string | null | undefined): boolean {
  const raw = normalizedUrlCandidate(value);
  return !!raw && !hasUnsafeUrlCharacters(raw) && RELATIVE_URL_RE.test(raw);
}

export function isSafeDataImageUrl(value: string | null | undefined): boolean {
  const raw = normalizedUrlCandidate(value);
  return !!raw && !hasUnsafeUrlCharacters(raw) && /^data:image\//i.test(raw);
}

export function safeUrlForContext(value: string | null | undefined, context: UrlSanitizerContext): string | null {
  const raw = normalizedUrlCandidate(value);
  if (!raw || hasUnsafeUrlCharacters(raw)) return null;

  if (context === 'image-like' || context === 'image-css-url') {
    if (raw.startsWith('#')) return raw;
    if (isSafeRelativeUrl(raw)) return raw;
    if (isSafeDataImageUrl(raw)) return raw;
    return hasAllowedProtocol(raw, IMAGE_LIKE_PROTOCOLS) ? raw : null;
  }

  if (context === 'inline-href') {
    if (raw.startsWith('#')) return raw;
    if (isSafeRelativeUrl(raw)) return raw;
    if (SIMPLE_HTML_HREF_RE.test(raw)) return raw;
    return hasAllowedProtocol(raw, INLINE_HREF_PROTOCOLS) ? raw : null;
  }

  if (context === 'iframe-src') {
    if (raw === 'about:blank') return raw;
    if (isSafeRelativeUrl(raw)) return raw;
    return hasAllowedProtocol(raw, IFRAME_PROTOCOLS) ? raw : null;
  }

  if (context === 'export-resource') {
    return EXPORT_RESOURCE_HREF_RE.test(raw) ? raw : null;
  }

  return null;
}

export function safeImageLikeUrl(value: string | null | undefined): string | null {
  return safeUrlForContext(value, 'image-like');
}

export function isSafeImageLikeUrl(value: string | null | undefined): boolean {
  return safeImageLikeUrl(value) !== null;
}

export function safeImageLikeCssUrl(value: string | null | undefined): string | null {
  const safe = safeUrlForContext(value, 'image-css-url');
  return safe ? safe.replace(/["\\\r\n<>]/g, '').replace(/[{}]/g, '') : null;
}

export function safeInlineHref(value: string | null | undefined): string | null {
  return safeUrlForContext(value, 'inline-href');
}

export function isSafeInlineHref(value: string | null | undefined): boolean {
  return safeInlineHref(value) !== null;
}

export function safeIframeSrc(value: string | null | undefined): string {
  return safeUrlForContext(value, 'iframe-src') ?? 'about:blank';
}

export function isSafeIframeSrc(value: string | null | undefined): boolean {
  const raw = normalizedUrlCandidate(value);
  return !raw || safeIframeSrc(raw) === raw || (raw === '' && safeIframeSrc(raw) === 'about:blank');
}

export function safeExportResourceHref(value: string | null | undefined): string | null {
  return safeUrlForContext(value, 'export-resource');
}
