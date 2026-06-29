import { expect, test } from '@playwright/test';
import {
  createLargeProject,
  installLargeProject,
  measureCanvasDom,
  withFrameMonitor,
} from './largeProjectFixture';

const FRAME_COUNT = 36;
const ELEMENTS_PER_FRAME = 60;
const EXPECTED_ELEMENTS = FRAME_COUNT * (ELEMENTS_PER_FRAME + 1);

const thresholds = {
  firstFrameMs: process.env.CI ? 8_000 : 6_000,
  worldNodes: 9_000,
  layoutReadMs: process.env.CI ? 180 : 120,
  fitP95Ms: process.env.CI ? 180 : 120,
  panP95Ms: process.env.CI ? 180 : 120,
  marqueeP95Ms: process.env.CI ? 420 : 260,
  marqueeMaxMs: process.env.CI ? 560 : 340,
};

test('large Canvas fixture stays within the broad performance envelope', async ({ page }) => {
  const project = createLargeProject({ frameCount: FRAME_COUNT, elementsPerFrame: ELEMENTS_PER_FRAME });
  await installLargeProject(page, project);

  const bootStart = performance.now();
  await page.goto('/');
  await page.locator('.canvas-world .frame').first().waitFor({ state: 'visible', timeout: 20_000 });
  const firstFrameMs = performance.now() - bootStart;

  const initial = await measureCanvasDom(page, 'initial');
  expect(initial.frames).toBe(FRAME_COUNT);
  expect(initial.elements).toBe(EXPECTED_ELEMENTS);
  expect(initial.worldNodes).toBeLessThan(thresholds.worldNodes);
  expect(initial.layoutReadMs).toBeLessThan(thresholds.layoutReadMs);
  expect(firstFrameMs).toBeLessThan(thresholds.firstFrameMs);

  const fit = await withFrameMonitor(page, 'fit-to-view', async () => {
    await page.getByTitle('Fit all frames in view (⌘0)').click();
    await page.waitForTimeout(150);
  });
  expect(fit.rafP95Ms).toBeLessThan(thresholds.fitP95Ms);

  const afterFit = await measureCanvasDom(page, 'after-fit');
  expect(afterFit.layoutReadMs).toBeLessThan(thresholds.layoutReadMs);

  const canvasBox = await page.locator('.canvas').boundingBox();
  if (!canvasBox) throw new Error('Canvas did not render');

  const pan = await withFrameMonitor(page, 'hand-pan', async () => {
    await page.keyboard.press('h');
    await page.mouse.move(canvasBox.x + 760, canvasBox.y + 460);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 560, canvasBox.y + 390, { steps: 8 });
    await page.mouse.up();
  });
  expect(pan.rafP95Ms).toBeLessThan(thresholds.panP95Ms);

  const marquee = await withFrameMonitor(page, 'marquee-cross-canvas', async () => {
    await page.keyboard.press('v');
    await page.mouse.move(canvasBox.x + 220, canvasBox.y + 230);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 1100, canvasBox.y + 720, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);
  });
  expect(marquee.rafP95Ms).toBeLessThan(thresholds.marqueeP95Ms);
  expect(marquee.rafMaxMs).toBeLessThan(thresholds.marqueeMaxMs);

  console.info(JSON.stringify({ firstFrameMs, initial, afterFit, fit, pan, marquee }, null, 2));
});
