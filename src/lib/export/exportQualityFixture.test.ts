import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateFrameHTML, loadProjectFromTemplate } from '../../storage';
import { analyzeExportHtml, type ExportQualityResult } from './exportQuality';

describe('export quality fixture gate', () => {
  it('passes a representative generated showcase export artifact', () => {
    const state = loadProjectFromTemplate('showcase');
    const frame = state.frames[0];
    expect(frame).toBeDefined();

    const html = generateFrameHTML(frame, state.frames, state.fontFamily, { layoutMode: 'flow' });
    const result = analyzeExportHtml(html, {
      maxAbsolutePositioned: 0,
      requiredLandmarks: ['main'],
    });
    writeMetrics('showcase-flow-export', result);

    expect(result).toMatchObject({
      ok: true,
      metrics: {
        absolutePositionedCount: 0,
        landmarkCounts: expect.objectContaining({ main: 1 }),
        imagesMissingAlt: 0,
        inlineStyleAttributeCount: 0,
        unsafeUrlCount: 0,
      },
    });
  });

  it('keeps a deliberate bad fixture failing the analyzer contract', () => {
    const badResult = analyzeExportHtml(`
      <main style="position:absolute">
        <img src="javascript:alert(1)">
      </main>`, {
      maxAbsolutePositioned: 0,
      requiredLandmarks: ['main'],
    });

    expect(badResult.ok).toBe(false);
    expect(badResult.issues.map(issue => issue.code)).toEqual([
      'too-many-absolute-elements',
      'missing-image-alt',
      'inline-style-attribute',
      'unsafe-url',
    ]);
  });
});

function writeMetrics(label: string, result: ExportQualityResult): void {
  const metricsPath = process.env.EXPORT_QUALITY_METRICS_PATH;
  if (!metricsPath) return;

  mkdirSync(dirname(metricsPath), { recursive: true });
  writeFileSync(metricsPath, `${JSON.stringify({ label, ok: result.ok, metrics: result.metrics }, null, 2)}\n`);
}
