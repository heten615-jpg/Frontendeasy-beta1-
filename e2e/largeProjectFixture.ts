import type { Page } from '@playwright/test';
import { createLargeProject as createLargeProjectPayload } from '../scripts/largeProjectFixture.mjs';

declare global {
  interface Window {
    __canvasProfileSamples?: number[];
    __canvasProfileStop?: boolean;
  }
}

type LargeProjectOptions = {
  frameCount?: number;
  elementsPerFrame?: number;
};

export function createLargeProject(options: LargeProjectOptions = {}) {
  return createLargeProjectPayload(options);
}

export async function installLargeProject(page: Page, project: unknown): Promise<void> {
  await page.addInitScript(serialized => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('frontendeasy_onboarding_complete_v1', 'done');
    localStorage.setItem('frontendeasy_update_notes_seen_schema_v22_ui3', 'done');
    localStorage.setItem('frontendeasy_project_v1', serialized);
  }, JSON.stringify(project));
}

export async function measureCanvasDom(page: Page, label: string) {
  return page.evaluate(labelArg => {
    const start = performance.now();
    const boxes = [...document.querySelectorAll('.canvas-world .frame, .canvas-world .element, .canvas-world .orphan-element')];
    for (const node of boxes) node.getBoundingClientRect();
    const layoutReadMs = performance.now() - start;
    const canvas = document.querySelector('.canvas-world');
    return {
      label: labelArg,
      frames: document.querySelectorAll('.canvas-world .frame').length,
      elements: document.querySelectorAll('.canvas-world .frame .element').length,
      orphanElements: document.querySelectorAll('.canvas-world .orphan-element').length,
      worldNodes: canvas ? canvas.querySelectorAll('*').length : 0,
      layoutReadMs,
      zoom: document.querySelector('button.zoom-pct')?.textContent?.trim() ?? null,
    };
  }, label);
}

export async function withFrameMonitor(page: Page, label: string, action: () => Promise<void>) {
  await page.evaluate(() => {
    window.__canvasProfileSamples = [];
    window.__canvasProfileStop = false;
    let last = performance.now();
    function loop(ts: number) {
      window.__canvasProfileSamples.push(ts - last);
      last = ts;
      if (!window.__canvasProfileStop) requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
  const start = performance.now();
  await action();
  await page.waitForTimeout(250);
  const wallMs = performance.now() - start;
  const samples = await page.evaluate(() => {
    window.__canvasProfileStop = true;
    return window.__canvasProfileSamples ?? [];
  });
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  const max = sorted.length ? sorted[sorted.length - 1] : 0;
  return { label, wallMs, rafSamples: samples.length, rafP95Ms: p95, rafMaxMs: max };
}
