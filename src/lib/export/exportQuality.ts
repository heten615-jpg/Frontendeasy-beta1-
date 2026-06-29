export type ExportLandmarkTag = 'main' | 'header' | 'nav' | 'section' | 'footer';

export type ExportQualityIssue =
  | {
      code: 'too-many-absolute-elements';
      message: string;
      count: number;
      threshold: number;
    }
  | {
      code: 'missing-landmark';
      message: string;
      tag: ExportLandmarkTag;
    }
  | {
      code: 'missing-image-alt';
      message: string;
      count: number;
    }
  | {
      code: 'inline-style-attribute';
      message: string;
      count: number;
    }
  | {
      code: 'unsafe-url';
      message: string;
      count: number;
    };

export interface ExportQualityMetrics {
  absolutePositionedCount: number;
  landmarkCounts: Record<ExportLandmarkTag, number>;
  imageCount: number;
  imagesMissingAlt: number;
  inlineStyleAttributeCount: number;
  unsafeUrlCount: number;
}

export interface ExportQualityResult {
  ok: boolean;
  metrics: ExportQualityMetrics;
  issues: ExportQualityIssue[];
}

export interface ExportQualityOptions {
  maxAbsolutePositioned?: number;
  requiredLandmarks?: readonly ExportLandmarkTag[];
}

const LANDMARK_TAGS: readonly ExportLandmarkTag[] = ['main', 'header', 'nav', 'section', 'footer'];

export function analyzeExportHtml(html: string, options: ExportQualityOptions = {}): ExportQualityResult {
  const bodyMarkup = extractBodyMarkup(html);
  const metrics: ExportQualityMetrics = {
    absolutePositionedCount: countMatches(html, /position\s*:\s*absolute\b/gi),
    landmarkCounts: countLandmarks(html),
    imageCount: 0,
    imagesMissingAlt: 0,
    inlineStyleAttributeCount: countMatches(bodyMarkup, /\sstyle\s*=/gi),
    unsafeUrlCount: countUnsafeUrls(html),
  };

  const imageAltMetrics = countImageAltMetrics(html);
  metrics.imageCount = imageAltMetrics.imageCount;
  metrics.imagesMissingAlt = imageAltMetrics.imagesMissingAlt;

  const issues: ExportQualityIssue[] = [];

  if (
    options.maxAbsolutePositioned !== undefined
    && metrics.absolutePositionedCount > options.maxAbsolutePositioned
  ) {
    issues.push({
      code: 'too-many-absolute-elements',
      message: `Export contains ${metrics.absolutePositionedCount} absolute-positioned rules, above the allowed threshold of ${options.maxAbsolutePositioned}.`,
      count: metrics.absolutePositionedCount,
      threshold: options.maxAbsolutePositioned,
    });
  }

  for (const tag of options.requiredLandmarks ?? []) {
    if (metrics.landmarkCounts[tag] === 0) {
      issues.push({
        code: 'missing-landmark',
        message: `Export is missing required <${tag}> landmark.`,
        tag,
      });
    }
  }

  if (metrics.imagesMissingAlt > 0) {
    issues.push({
      code: 'missing-image-alt',
      message: `Export contains ${metrics.imagesMissingAlt} image ${metrics.imagesMissingAlt === 1 ? 'tag' : 'tags'} without meaningful alt text.`,
      count: metrics.imagesMissingAlt,
    });
  }

  if (metrics.inlineStyleAttributeCount > 0) {
    issues.push({
      code: 'inline-style-attribute',
      message: `Export body contains ${metrics.inlineStyleAttributeCount} inline style ${metrics.inlineStyleAttributeCount === 1 ? 'attribute' : 'attributes'}.`,
      count: metrics.inlineStyleAttributeCount,
    });
  }

  if (metrics.unsafeUrlCount > 0) {
    issues.push({
      code: 'unsafe-url',
      message: `Export contains ${metrics.unsafeUrlCount} unsafe javascript: URL ${metrics.unsafeUrlCount === 1 ? 'attribute' : 'attributes'}.`,
      count: metrics.unsafeUrlCount,
    });
  }

  return {
    ok: issues.length === 0,
    metrics,
    issues,
  };
}

function countLandmarks(html: string): Record<ExportLandmarkTag, number> {
  return LANDMARK_TAGS.reduce<Record<ExportLandmarkTag, number>>((counts, tag) => {
    counts[tag] = countMatches(html, new RegExp(`<\\s*${tag}(?=\\s|>|/)`, 'gi'));
    return counts;
  }, {
    main: 0,
    header: 0,
    nav: 0,
    section: 0,
    footer: 0,
  });
}

function countImageAltMetrics(html: string): Pick<ExportQualityMetrics, 'imageCount' | 'imagesMissingAlt'> {
  const imageTags = html.match(/<\s*img\b[^>]*>/gi) ?? [];
  let imagesMissingAlt = 0;

  for (const imageTag of imageTags) {
    const altMatch = imageTag.match(/\salt\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const altText = altMatch?.[2] ?? altMatch?.[3] ?? altMatch?.[4] ?? '';
    if (altText.trim().length === 0) {
      imagesMissingAlt += 1;
    }
  }

  return {
    imageCount: imageTags.length,
    imagesMissingAlt,
  };
}

function countUnsafeUrls(html: string): number {
  const urlAttributePattern = /\s(?:href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let count = 0;
  let match: RegExpExecArray | null;

  while ((match = urlAttributePattern.exec(html)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (value.trimStart().toLowerCase().startsWith('javascript:')) {
      count += 1;
    }
  }

  return count;
}

function extractBodyMarkup(html: string): string {
  return html.match(/<\s*body\b[^>]*>([\s\S]*?)<\s*\/\s*body\s*>/i)?.[1] ?? html;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}
