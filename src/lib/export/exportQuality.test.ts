import { describe, expect, it } from 'vitest';
import { analyzeExportHtml } from './exportQuality';

describe('export quality analyzer', () => {
  it('reports clean semantic export metrics without issues', () => {
    const html = `<!doctype html>
<html>
  <head><style>.hero{position:relative}</style></head>
  <body>
    <main>
      <header><h1>Frontendeasy</h1></header>
      <section><img src="hero.png" alt="Hero screenshot"></section>
      <footer><a href="about.html">About</a></footer>
    </main>
  </body>
</html>`;

    expect(analyzeExportHtml(html, { maxAbsolutePositioned: 0 })).toEqual({
      ok: true,
      metrics: {
        absolutePositionedCount: 0,
        landmarkCounts: { main: 1, header: 1, nav: 0, section: 1, footer: 1 },
        imageCount: 1,
        imagesMissingAlt: 0,
        inlineStyleAttributeCount: 0,
        unsafeUrlCount: 0,
      },
      issues: [],
    });
  });

  it('flags absolute positioning above the configured threshold', () => {
    const html = `
      <main>
        <style>
          .a{position:absolute;left:0}
          .b{position: absolute;left:10px}
        </style>
      </main>`;

    const result = analyzeExportHtml(html, { maxAbsolutePositioned: 1 });

    expect(result.ok).toBe(false);
    expect(result.metrics.absolutePositionedCount).toBe(2);
    expect(result.issues).toContainEqual({
      code: 'too-many-absolute-elements',
      message: 'Export contains 2 absolute-positioned rules, above the allowed threshold of 1.',
      count: 2,
      threshold: 1,
    });
  });

  it('flags missing required landmarks', () => {
    const result = analyzeExportHtml('<section><p>No main wrapper</p></section>', {
      requiredLandmarks: ['main', 'header'],
    });

    expect(result.ok).toBe(false);
    expect(result.metrics.landmarkCounts).toMatchObject({ main: 0, header: 0, section: 1 });
    expect(result.issues.map(issue => issue.code)).toEqual(['missing-landmark', 'missing-landmark']);
    expect(result.issues[0]).toMatchObject({ code: 'missing-landmark', tag: 'main' });
    expect(result.issues[1]).toMatchObject({ code: 'missing-landmark', tag: 'header' });
  });

  it('flags images with missing or empty alt text', () => {
    const result = analyzeExportHtml(`
      <main>
        <img src="ok.png" alt="Meaningful">
        <img src="missing.png">
        <img src="empty.png" alt="  ">
      </main>`);

    expect(result.ok).toBe(false);
    expect(result.metrics.imageCount).toBe(3);
    expect(result.metrics.imagesMissingAlt).toBe(2);
    expect(result.issues).toContainEqual({
      code: 'missing-image-alt',
      message: 'Export contains 2 image tags without meaningful alt text.',
      count: 2,
    });
  });

  it('flags inline style attributes in body markup', () => {
    const result = analyzeExportHtml(`
      <html>
        <head><style>.ok{color:red}</style></head>
        <body><main><p style="color:red">Inline</p></main></body>
      </html>`);

    expect(result.ok).toBe(false);
    expect(result.metrics.inlineStyleAttributeCount).toBe(1);
    expect(result.issues).toContainEqual({
      code: 'inline-style-attribute',
      message: 'Export body contains 1 inline style attribute.',
      count: 1,
    });
  });

  it('flags unsafe javascript URLs in href and src attributes', () => {
    const result = analyzeExportHtml(`
      <main>
        <a href=" javascript:alert(1)">Bad link</a>
        <img src='JaVaScRiPt:alert(2)' alt="Bad image">
      </main>`);

    expect(result.ok).toBe(false);
    expect(result.metrics.unsafeUrlCount).toBe(2);
    expect(result.issues).toContainEqual({
      code: 'unsafe-url',
      message: 'Export contains 2 unsafe javascript: URL attributes.',
      count: 2,
    });
  });
});
