import { expect, test, type Locator, type Page } from '@playwright/test';

async function openSeededEditor(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('frontendeasy_e2e_seeded')) {
      localStorage.clear();
      sessionStorage.setItem('frontendeasy_e2e_seeded', 'true');
    }
    localStorage.setItem('frontendeasy_onboarding_complete_v1', 'done');
    localStorage.setItem('frontendeasy_update_notes_seen_schema_v22_ui3', 'done');
  });
  await page.goto('/');
  await expect(page.locator('.frame').first()).toBeVisible({ timeout: 60_000 });
}

async function clearInitialFrameSelection(page: Page): Promise<void> {
  const canvas = await page.locator('.canvas').boundingBox();
  if (!canvas) throw new Error('Canvas did not render');
  await page.mouse.click(canvas.x + canvas.width - 48, canvas.y + canvas.height - 84);
}

async function openToolbarGroup(page: Page, group: string): Promise<Locator> {
  await page.locator(`[data-toolbar-group="${group}"] .toolbar-chevron-btn`).click();
  const menu = page.locator('.toolbar-dropdown');
  await expect(menu).toBeVisible();
  return menu;
}

async function chooseToolbarItem(page: Page, group: string, name: string | RegExp): Promise<void> {
  const menu = await openToolbarGroup(page, group);
  await menu.getByRole('menuitem', { name }).click();
}

async function openWorkspaceControls(page: Page): Promise<Locator> {
  const menu = page.getByRole('dialog', { name: 'Workspace controls' });
  if (await menu.isVisible().catch(() => false)) return menu;
  await page.locator('.workspace-menu-trigger').click();
  await expect(menu).toBeVisible();
  return menu;
}

async function clickWorkspaceControl(page: Page, name: string | RegExp): Promise<void> {
  const menu = await openWorkspaceControls(page);
  await menu.getByRole('button', { name }).click();
}

async function closeWorkspaceControls(page: Page): Promise<void> {
  const menu = page.getByRole('dialog', { name: 'Workspace controls' });
  if (!(await menu.isVisible().catch(() => false))) return;
  await page.locator('.workspace-menu-trigger').click();
  await expect(menu).toHaveCount(0);
}

async function chooseWorkspaceMode(page: Page, name: string | RegExp): Promise<void> {
  const menu = await openWorkspaceControls(page);
  await menu.getByRole('group', { name: 'Editor permission mode' }).getByRole('button', { name }).click();
}

async function workspaceControl(page: Page, name: string | RegExp): Promise<Locator> {
  const menu = await openWorkspaceControls(page);
  return menu.getByRole('button', { name });
}

async function marqueeHomeElements(page: Page): Promise<void> {
  await clearInitialFrameSelection(page);
  const home = page.locator('.frame').first();
  const box = await home.boundingBox();
  if (!box) throw new Error('Home frame did not render');

  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.74, { steps: 6 });
  await expect(page.locator('.marquee-box')).toBeVisible();
  await page.mouse.up();
}

async function tabUntilFocused(page: Page, target: Locator, maxTabs = 20): Promise<void> {
  for (let i = 0; i < maxTabs; i += 1) {
    const focused = await target.evaluate(node => node === document.activeElement).catch(() => false);
    if (focused) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function collectLeftPanelLayoutMetrics(page: Page) {
  return page.locator('.left-panel').evaluate(panel => {
    const panelEl = panel as HTMLElement;
    const panelRect = panelEl.getBoundingClientRect();

    const isVisible = (node: Element) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const describe = (node: Element) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        ariaLabel: element.getAttribute('aria-label'),
        text: (element.textContent ?? '').trim().slice(0, 80),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      };
    };

    const layoutNodes = Array.from(panelEl.querySelectorAll(
      '.row, .component-row, .component-search-row, .search-row, .library-controls, .library-config',
    )).filter(isVisible);
    const controls = Array.from(panelEl.querySelectorAll('button, input, select, textarea')).filter(isVisible);
    const outsidePanel = [...layoutNodes, ...controls]
      .filter(node => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        return rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1;
      })
      .map(describe);
    const visibleOverflow = [...layoutNodes, ...controls]
      .filter(node => {
        const element = node as HTMLElement;
        const style = getComputedStyle(element);
        return element.scrollWidth > element.clientWidth + 2 && !['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX);
      })
      .map(describe);
    const nameStyles = Array.from(panelEl.querySelectorAll('.inline-name-input, .asset-name, .page-filename'))
      .filter(isVisible)
      .map(node => {
        const element = node as HTMLElement;
        const style = getComputedStyle(element);
        return {
          className: typeof element.className === 'string' ? element.className : '',
          textOverflow: style.textOverflow,
          overflowX: style.overflowX,
          whiteSpace: style.whiteSpace,
        };
      });

    return {
      panelClientWidth: panelEl.clientWidth,
      panelScrollWidth: panelEl.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      outsidePanel,
      visibleOverflow,
      nameStyles,
    };
  });
}

async function collectRightPanelLayoutMetrics(page: Page) {
  return page.locator('.right-panel').evaluate(panel => {
    const panelEl = panel as HTMLElement;
    const panelRect = panelEl.getBoundingClientRect();

    const isVisible = (node: Element) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const describe = (node: Element) => {
      const element = node as HTMLElement;
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type'),
        className: typeof element.className === 'string' ? element.className : '',
        ariaLabel: element.getAttribute('aria-label'),
        text: (element.textContent ?? '').trim().slice(0, 80),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      };
    };

    const layoutNodes = Array.from(panelEl.querySelectorAll(
      '.inspector-header, .property-search, .prop-group, .prop-field, .prop-grid-2, .prop-grid-4, .inline-link-row, .color-row, .opacity-row-controls, .filter-row-controls, .link-badge, .meta-hint, .style-action-row, .transform-action-row, .matching-grid, .preset-row',
    )).filter(isVisible);
    const controls = Array.from(panelEl.querySelectorAll('button, input, select, textarea')).filter(isVisible);
    const outsidePanel = [...layoutNodes, ...controls]
      .filter(node => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        return rect.left < panelRect.left - 1 || rect.right > panelRect.right + 1;
      })
      .map(describe);
    const visibleOverflow = [...layoutNodes, ...controls]
      .filter(node => {
        const element = node as HTMLElement;
        const style = getComputedStyle(element);
        return element.scrollWidth > element.clientWidth + 2 && !['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX);
      })
      .map(describe);
    const urlInputStyles = Array.from(panelEl.querySelectorAll('input[type="url"]'))
      .filter(isVisible)
      .map(node => {
        const element = node as HTMLInputElement;
        const style = getComputedStyle(element);
        return {
          ariaLabel: element.getAttribute('aria-label'),
          minWidth: style.minWidth,
          overflowX: style.overflowX,
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
        };
      });
    const unboundedLabels = Array.from(panelEl.querySelectorAll('.prop-field > span, .prop-label'))
      .filter(isVisible)
      .filter(node => {
        const style = getComputedStyle(node as HTMLElement);
        return style.whiteSpace !== 'nowrap' || style.overflowX === 'visible' || style.textOverflow !== 'ellipsis';
      })
      .map(describe);

    return {
      panelClientWidth: panelEl.clientWidth,
      panelScrollWidth: panelEl.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      outsidePanel,
      visibleOverflow,
      urlInputStyles,
      unboundedLabels,
    };
  });
}

async function collectBottomToolbarMetrics(page: Page) {
  return page.locator('.bottom-toolbar').evaluate(toolbar => {
    const toolbarEl = toolbar as HTMLElement;
    const rect = toolbarEl.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      toolbarClientWidth: toolbarEl.clientWidth,
      toolbarScrollWidth: toolbarEl.scrollWidth,
      toolbarLeft: Math.round(rect.left),
      toolbarRight: Math.round(rect.right),
      toolbarWithinViewport: rect.left >= 0 && rect.right <= window.innerWidth,
      overflowX: getComputedStyle(toolbarEl).overflowX,
    };
  });
}

async function collectPopoverMetrics(page: Page, selector: string) {
  return page.locator(selector).evaluate((popover, popoverSelector) => {
    const element = popover as HTMLElement;
    const rect = element.getBoundingClientRect();
    const sample = document.elementFromPoint(
      Math.min(Math.max(rect.left + Math.min(20, rect.width / 2), 1), window.innerWidth - 1),
      Math.min(Math.max(rect.top + Math.min(20, rect.height / 2), 1), window.innerHeight - 1),
    );
    const style = getComputedStyle(element);
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      position: style.position,
      minWidth: style.minWidth,
      maxWidth: style.maxWidth,
      overflowX: style.overflowX,
      zIndex: style.zIndex,
      hitTag: sample?.tagName ?? null,
      hitClass: sample instanceof HTMLElement ? sample.className : null,
      withinViewport: rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
      hitTestInside: !!sample?.closest(popoverSelector),
    };
  }, selector);
}

type UiContrastTarget = {
  name: string;
  selector: string;
  minRatio: number;
};

async function collectUiContrastSamples(page: Page, targets: UiContrastTarget[]) {
  return page.evaluate((targetDefs) => {
    type Rgba = { r: number; g: number; b: number; a: number };
    const baseBackground: Rgba = { r: 18, g: 18, b: 22, a: 1 };

    const parseColor = (value: string): Rgba | null => {
      const match = /rgba?\(([^)]+)\)/i.exec(value);
      if (!match) return null;
      const parts = match[1].split(',').map(part => part.trim());
      const [r = 0, g = 0, b = 0] = parts.slice(0, 3).map(Number);
      const a = parts[3] === undefined ? 1 : Number(parts[3]);
      return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) && Number.isFinite(a)
        ? { r, g, b, a }
        : null;
    };

    const blend = (fg: Rgba, bg: Rgba): Rgba => {
      const alpha = Math.max(0, Math.min(1, fg.a));
      return {
        r: fg.r * alpha + bg.r * (1 - alpha),
        g: fg.g * alpha + bg.g * (1 - alpha),
        b: fg.b * alpha + bg.b * (1 - alpha),
        a: 1,
      };
    };

    const channel = (value: number) => {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    const luminance = (color: Rgba) => 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    const contrastRatio = (a: Rgba, b: Rgba) => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    const isVisible = (element: Element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(element as HTMLElement);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };

    const effectiveOpacity = (element: HTMLElement) => {
      let opacity = 1;
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const value = Number(getComputedStyle(node).opacity);
        if (Number.isFinite(value)) opacity *= value;
      }
      return opacity;
    };

    const backgroundBehindText = (element: HTMLElement) => {
      const chain: HTMLElement[] = [];
      for (let node: HTMLElement | null = element; node; node = node.parentElement) chain.unshift(node);
      return chain.reduce((background, node) => {
        const parsed = parseColor(getComputedStyle(node).backgroundColor);
        return parsed && parsed.a > 0 ? blend(parsed, background) : background;
      }, baseBackground);
    };

    return targetDefs.flatMap(target => {
      return Array.from(document.querySelectorAll(target.selector))
        .filter(isVisible)
        .map(node => {
          const element = node as HTMLElement;
          const style = getComputedStyle(element);
          const color = parseColor(style.color);
          const background = backgroundBehindText(element);
          const textColor = color ? { ...color, a: color.a * effectiveOpacity(element) } : null;
          const renderedText = textColor ? blend(textColor, background) : null;
          const ratio = renderedText ? contrastRatio(renderedText, background) : null;
          const rect = element.getBoundingClientRect();
          return {
            name: target.name,
            selector: target.selector,
            minRatio: target.minRatio,
            ratio: ratio === null ? null : Number(ratio.toFixed(2)),
            text: (element.textContent ?? element.getAttribute('aria-label') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
            tag: element.tagName.toLowerCase(),
            className: typeof element.className === 'string' ? element.className : '',
            color: style.color,
            backgroundColor: style.backgroundColor,
            opacity: style.opacity,
            left: Math.round(rect.left),
            top: Math.round(rect.top),
          };
        });
    });
  }, targets);
}

async function expectVisibleFocusIndicator(page: Page, locator: Locator, name: string) {
  await page.keyboard.press('Tab');
  await locator.focus();
  const metrics = await locator.evaluate((node, label) => {
    const element = node as HTMLElement;
    const style = getComputedStyle(element);
    const outlineWidth = parseFloat(style.outlineWidth || '0');
    const hasOutline = style.outlineStyle !== 'none' && outlineWidth > 0;
    const hasShadow = style.boxShadow !== 'none';
    return {
      name: label,
      focused: document.activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      outlineOffset: style.outlineOffset,
      boxShadow: style.boxShadow,
      hasVisibleIndicator: hasOutline || hasShadow,
    };
  }, name);
  expect(metrics.focused, JSON.stringify(metrics, null, 2)).toBe(true);
  expect(metrics.hasVisibleIndicator, JSON.stringify(metrics, null, 2)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await openSeededEditor(page);
});

test('project identity clarifies local-only storage in offline editor', async ({ page }) => {
  const identity = page.getByLabel('Project storage status');
  await expect(identity).toBeVisible();
  await expect(identity.locator('.project-title-pill')).toBeVisible();
  await expect(identity.locator('.project-title-pill')).not.toBeEmpty();
  const badge = identity.locator('.project-storage-badge');
  await expect(badge).toContainText('Local only');
  await expect(badge).toHaveAttribute('title', /Cloud sync is not configured\. Saved to this browser\./);
});

test('marquee selects seeded layers and leaves group selection bounds', async ({ page }) => {
  await marqueeHomeElements(page);

  await expect(page.locator('.frame').first().locator('.element.selected')).toHaveCount(3);
  await expect(page.locator('.selection-bounds')).toBeVisible();
});

test('marquee across two pages selects both frames as a unit', async ({ page }) => {
  await clickWorkspaceControl(page, /Fit/);
  await closeWorkspaceControls(page);
  await clearInitialFrameSelection(page);
  const home = await page.locator('.frame').nth(0).boundingBox();
  const about = await page.locator('.frame').nth(1).boundingBox();
  if (!home || !about) throw new Error('Seeded frames did not render');

  await page.mouse.move(home.x + home.width - 6, home.y + home.height - 6);
  await page.mouse.down();
  await page.mouse.move(about.x + 6, about.y + about.height - 6, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('.frame.multi-selected')).toHaveCount(2);
  await expect(page.locator('.topbar-center')).toContainText('2 frames');
  await expect(page.locator('.selection-bounds')).toBeVisible();
});

test('selected frame deletion asks for confirmation before removing the frame', async ({ page }) => {
  const frames = page.locator('.frame');
  const initialFrameCount = await frames.count();
  expect(initialFrameCount).toBeGreaterThan(1);

  await expect(page.locator('.topbar-center')).toContainText('Home');
  await page.keyboard.press('Delete');

  const dialog = page.getByRole('dialog', { name: 'Delete frame?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Are you sure you want to delete frame');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(frames).toHaveCount(initialFrameCount);

  await page.keyboard.press('Delete');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(dialog).toBeHidden();
  await expect(frames).toHaveCount(initialFrameCount - 1);
});

test('selected linked button renders a connector and duplicate can be undone', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const buttons = page.locator('.frame .element.is-button');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);

  await buttons.first().click();
  await expect(page.locator('.connectors path')).toHaveCount(1);

  await page.keyboard.press('Control+d');
  await expect(buttons).toHaveCount(count + 1);
  await page.keyboard.press('Control+z');
  await expect(buttons).toHaveCount(count);
});

test('scale tool scales selected geometry and style as one undoable change', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const target = page.locator('.frame .element.is-button').first();
  await target.click();
  const beforeBox = await target.boundingBox();
  const beforeFontSize = await target.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  if (!beforeBox) throw new Error('Text element did not render');

  await page.keyboard.press('K');
  await expect(page.getByRole('button', { name: 'Scale tool (K)' })).toHaveAttribute('aria-pressed', 'true');

  await page.mouse.move(beforeBox.x + beforeBox.width - 2, beforeBox.y + beforeBox.height - 2);
  await page.mouse.down();
  await page.mouse.move(beforeBox.x + beforeBox.width + 96, beforeBox.y + beforeBox.height + 72, { steps: 5 });
  await page.mouse.up();

  const scaledBox = await target.boundingBox();
  const scaledFontSize = await target.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  if (!scaledBox) throw new Error('Scaled text element did not render');
  expect(scaledBox.width).toBeGreaterThan(beforeBox.width);
  expect(scaledBox.height).toBeGreaterThan(beforeBox.height);
  expect(scaledFontSize).toBeGreaterThan(beforeFontSize);

  await page.keyboard.press('Control+z');
  const revertedBox = await target.boundingBox();
  const revertedFontSize = await target.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  if (!revertedBox) throw new Error('Reverted text element did not render');
  expect(Math.abs(revertedBox.width - beforeBox.width)).toBeLessThan(2);
  expect(Math.abs(revertedBox.height - beforeBox.height)).toBeLessThan(2);
  expect(Math.abs(revertedFontSize - beforeFontSize)).toBeLessThan(0.5);
});

test('on-canvas transform handles rotate flip and expose text/media quick actions', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const text = frame.locator('.element.is-text').first();
  await text.click();
  await expect(text).toHaveClass(/selected/);

  await expect(page.getByRole('button', { name: 'Set text auto width on canvas' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set text auto height on canvas' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Set text hug height' }).click();
  await expect(page.locator('.right-panel')).toContainText('Text box sizing');

  const textBox = await text.boundingBox();
  const rotateHandle = page.getByRole('button', { name: 'Rotate selected element', exact: true });
  const handleBox = await rotateHandle.boundingBox();
  if (!textBox || !handleBox) throw new Error('Rotation handle did not render');
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(textBox.x + textBox.width + 80, textBox.y + textBox.height / 2, { steps: 4 });
  await page.mouse.up();

  await expect.poll(() => text.evaluate(el => getComputedStyle(el).transform)).not.toBe('none');

  const panel = page.locator('.right-panel');
  await panel.getByRole('combobox', { name: 'Rotation origin' }).selectOption('top left');
  await expect.poll(() => text.evaluate(el => getComputedStyle(el).transformOrigin)).toContain('0px 0px');
  const beforeFlip = await text.evaluate(el => getComputedStyle(el).transform);
  await panel.getByRole('button', { name: 'Flip selected element horizontally' }).click();
  await expect.poll(() => text.evaluate(el => getComputedStyle(el).transform)).not.toBe(beforeFlip);

  async function dropPngAt(clientX: number, clientY: number, name: string): Promise<void> {
    await page.evaluate(({ clientX, clientY, name }) => {
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const file = new File([bytes], name, { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const canvas = document.querySelector('.canvas');
      if (!canvas) throw new Error('Canvas did not render');
      canvas.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer }));
      canvas.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX, clientY, dataTransfer }));
    }, { clientX, clientY, name });
  }

  await clearInitialFrameSelection(page);
  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error('Home frame did not render');
  await dropPngAt(frameBox.x + 320, frameBox.y + 220, 'transform-crop.png');

  const selectedMedia = frame.locator('.element.selected').first();
  await expect(page.getByRole('button', { name: 'Crop media on canvas' })).toBeVisible();
  await page.getByRole('button', { name: 'Crop media on canvas' }).click();
  await expect(selectedMedia.locator('.crop-mode-badge')).toBeVisible();
});

test('selected frame exposes Figma-like outer rotate handles without stealing corner resize', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  await frame.click();
  await expect(frame).toHaveClass(/active/);

  const rotateHandle = page.getByRole('button', { name: 'Rotate selected frame', exact: true });
  const resizeHandle = page.getByRole('button', { name: 'Resize selected frame from ne handle', exact: true });
  const rotateBox = await rotateHandle.boundingBox();
  const resizeBox = await resizeHandle.boundingBox();
  const frameBox = await frame.boundingBox();
  if (!rotateBox || !resizeBox || !frameBox) throw new Error('Frame transform handles did not render');

  expect(rotateBox.x + rotateBox.width / 2).toBeGreaterThan(resizeBox.x + resizeBox.width / 2);
  expect(rotateBox.y + rotateBox.height / 2).toBeLessThan(resizeBox.y + resizeBox.height / 2);

  const beforeTransform = await frame.evaluate(el => getComputedStyle(el).transform);
  await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width + 80, frameBox.y + frameBox.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect.poll(() => frame.evaluate(el => getComputedStyle(el).transform)).not.toBe(beforeTransform);
});

test('region tools create slice export regions with inspector semantics', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const box = await frame.boundingBox();
  if (!box) throw new Error('Frame did not render');

  await chooseToolbarItem(page, 'frame', /Slice/);
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 260, { steps: 5 });
  await page.mouse.up();

  const slice = page.locator('.frame .element.is-slice').first();
  await expect(slice).toBeVisible();
  await expect(slice).toContainText(/\.html/);
  await expect(page.getByRole('textbox', { name: 'Slice export filename' })).toHaveValue(/\.html$/);

  await page.keyboard.press('R');
  await expect(page.getByRole('button', { name: 'Rectangle tool' })).toHaveAttribute('aria-pressed', 'true');
});

test('Image/video shape creates a media-filled shape without legacy image class', async ({ page }) => {
  await clearInitialFrameSelection(page);
  await page.getByLabel('Choose shape').click();
  await page.getByRole('menuitem', { name: /Image\/video/ }).click();

  const frame = page.locator('.frame').first();
  const box = await frame.boundingBox();
  if (!box) throw new Error('Home frame did not render');

  const chooserPromise = page.waitForEvent('filechooser');
  await page.mouse.move(box.x + 160, box.y + 160);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 320, { steps: 4 });
  await page.mouse.up();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'media-fill.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lH6U8wAAAABJRU5ErkJggg==',
      'base64',
    ),
  });

  const selected = page.locator('.frame .element.selected').first();
  await expect(selected).toBeVisible();
  await expect(selected).not.toHaveClass(/is-image/);
  await expect(selected.locator('img.media-fill-image')).toBeVisible();
  await expect(page.getByText('Media fill', { exact: true })).toBeVisible();
  await expect(page.getByText('Media fill is stored on the shape; old image elements remain compatible.')).toBeVisible();
});

test('shape manipulators adjust ellipse arcs and polygon corner radius with undo', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('frontendeasy_onboarding_complete_v1', 'done');
    localStorage.setItem('frontendeasy_update_notes_seen_schema_v22_ui3', 'done');
  });
  await page.reload();
  await expect(page.locator('.frame').first()).toBeVisible();
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const box = await frame.boundingBox();
  if (!box) throw new Error('Home frame did not render');

  await page.getByLabel('Choose shape').click();
  await page.getByRole('menuitem', { name: /Ellipse/ }).click();
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 280, { steps: 4 });
  await page.mouse.up();

  const ellipse = page.locator('.frame .element.is-shape.selected').first();
  await expect(ellipse).toBeVisible();
  const ellipsePath = ellipse.locator('svg.shape-svg path');
  const fullEllipsePath = await ellipsePath.getAttribute('d');
  const startHandle = page.getByLabel('Adjust ellipse arc start');
  const startBox = await startHandle.boundingBox();
  if (!startBox) throw new Error('Ellipse arc handle did not render');
  await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 210, box.y + 280, { steps: 5 });
  await expect(ellipsePath).toHaveAttribute('d', / L /);
  const editedEllipsePath = await ellipsePath.getAttribute('d');
  await page.mouse.up();
  await expect(ellipsePath).not.toHaveAttribute('d', fullEllipsePath ?? '');
  await expect(ellipsePath).toHaveAttribute('d', editedEllipsePath ?? '');
  await page.keyboard.press('Control+z');
  await expect(ellipsePath).toHaveAttribute('d', fullEllipsePath ?? '');

  await page.getByLabel('Choose shape').click();
  await page.getByRole('menuitem', { name: /Polygon/ }).click();
  await page.mouse.move(box.x + 360, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 540, box.y + 300, { steps: 4 });
  await page.mouse.up();

  const polygon = page.locator('.frame .element.is-shape.selected').first();
  const polygonPath = polygon.locator('svg.shape-svg path');
  const sharpPolygonPath = await polygonPath.getAttribute('d');
  const cornerHandle = page.getByLabel('Adjust shape corner radius');
  const cornerBox = await cornerHandle.boundingBox();
  if (!cornerBox) throw new Error('Shape corner handle did not render');
  await page.mouse.move(cornerBox.x + cornerBox.width / 2, cornerBox.y + cornerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cornerBox.x + 42, cornerBox.y + 42, { steps: 5 });
  await page.mouse.up();
  await expect(polygonPath).not.toHaveAttribute('d', sharpPolygonPath ?? '');
  await expect(polygonPath).toHaveAttribute('d', / Q /);
  await page.keyboard.press('Control+z');
  await expect(polygonPath).toHaveAttribute('d', sharpPolygonPath ?? '');
});

test('Pen and Pencil tools create vector objects with layer and SVG output', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const box = await frame.boundingBox();
  if (!box) throw new Error('Home frame did not render');

  await chooseToolbarItem(page, 'pen', /Pencil/);
  await page.mouse.move(box.x + 120, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 150, { steps: 3 });
  await page.mouse.move(box.x + 220, box.y + 130, { steps: 3 });
  await page.mouse.move(box.x + 280, box.y + 170, { steps: 3 });
  await page.mouse.up();

  const pencilVector = page.locator('.frame .element.is-vector.selected').first();
  await expect(pencilVector).toBeVisible();
  await expect(pencilVector.locator('svg.vector-svg path')).toHaveAttribute('d', /C/);
  await expect(page.getByRole('treeitem', { name: /Vector layer/ }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Pen tool (P)' }).click();
  await page.mouse.move(box.x + 320, box.y + 140);
  await page.mouse.down();
  await page.mouse.move(box.x + 480, box.y + 220, { steps: 2 });
  await page.mouse.up();

  const penVector = page.locator('.frame .element.is-vector.selected').first();
  await expect(penVector).toBeVisible();
  await expect(penVector.locator('svg.vector-svg path')).toHaveAttribute('d', /L/);

  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Vector edit quick actions')).toBeVisible();
  await page.getByRole('button', { name: 'Vector paint quick action' }).click();
  await expect(penVector.locator('.vector-edit-badge')).toContainText('paint');

  const inspector = page.locator('.right-panel');
  await inspector.getByText('Vector edit').scrollIntoViewIfNeeded();
  await inspector.getByRole('spinbutton', { name: 'Vector variable width' }).fill('11');
  await expect(penVector.locator('svg.vector-svg path')).toHaveAttribute('stroke-width', '11');
  await inspector.getByRole('button', { name: 'Vector Merge operation' }).click();
  await expect(penVector.locator('.vector-edit-badge')).toContainText(/1 ops/);
});

test('Text tool click creates auto-width text and drag creates fixed text with inspector switching', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const box = await frame.boundingBox();
  if (!box) throw new Error('Frame did not render');

  await page.getByRole('button', { name: 'Text tool (T)' }).click();
  await page.mouse.click(box.x + 96, box.y + 96);

  const sizing = page.getByRole('combobox', { name: 'Text box sizing' });
  await expect(sizing).toHaveValue('auto-width');
  const clickedText = frame.locator('.element.is-text.selected').first();
  await expect(clickedText).toBeVisible();
  await expect.poll(() => clickedText.evaluate(el => (el as HTMLElement).style.width)).toBe('max-content');

  await page.getByRole('button', { name: 'Text tool (T)' }).click();
  await page.mouse.move(box.x + 120, box.y + 190);
  await page.mouse.down();
  await page.mouse.move(box.x + 330, box.y + 260, { steps: 5 });
  await page.mouse.up();

  const draggedText = frame.locator('.element.is-text.selected').first();
  await expect(sizing).toHaveValue('fixed');
  await expect.poll(() => draggedText.evaluate(el => (el as HTMLElement).style.width)).not.toBe('max-content');

  await sizing.selectOption('auto-height');
  await expect(sizing).toHaveValue('auto-height');
  await expect.poll(() => draggedText.evaluate(el => (el as HTMLElement).style.height)).toBe('auto');
});

test('frame preset catalog appears only for the Frame tool and applies categories', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Frame preset catalog' })).toBeHidden();
  await page.getByRole('button', { name: 'Frame tool (F)' }).click();
  const catalog = page.getByRole('region', { name: 'Frame preset catalog' });
  await expect(catalog).toBeVisible();

  for (const category of ['Phone', 'Tablet', 'Desktop', 'Presentation', 'Watch', 'Paper', 'Social Media', 'Figma Community', 'Archive']) {
    await expect(catalog.getByRole('heading', { name: category })).toBeVisible();
  }

  await catalog.getByRole('button', { name: 'Phone iPhone 15 393 by 852' }).click();
  const widthInput = page.getByRole('spinbutton', { name: 'W' });
  const heightInput = page.getByRole('spinbutton', { name: 'H' });
  await expect(widthInput).toHaveValue('393');
  await expect(heightInput).toHaveValue('852');

  await page.getByRole('button', { name: 'Resize frame to fit content' }).click();
  await expect(widthInput).not.toHaveValue('393');
  const clip = page.getByRole('checkbox', { name: 'Clip frame content' });
  await expect(clip).toBeChecked();
  await clip.uncheck();
  await expect(page.locator('.frame').first()).toHaveClass(/clip-disabled/);

  await page.getByRole('button', { name: 'Text tool (T)' }).click();
  await expect(catalog).toBeHidden();
});

test('grouped layers permit modifier deep selection of a concrete child', async ({ page }) => {
  await marqueeHomeElements(page);
  await page.keyboard.press('Meta+g');

  const group = page.locator('.frame').first().locator('.element.is-group');
  await expect(group).toHaveCount(1);
  const child = group.locator('.element.is-text').first();
  await expect(child).toBeVisible();

  await child.click({ modifiers: ['Meta'] });

  await expect(child).toHaveClass(/selected/);
});

test('ungroup keeps lifted frame layers selected', async ({ page }) => {
  await marqueeHomeElements(page);
  await page.keyboard.press('Meta+g');

  const frame = page.locator('.frame').first();
  const group = frame.locator('.element.is-group');
  await expect(group).toHaveCount(1);
  await expect(group).toHaveClass(/selected/);

  await page.keyboard.press('Meta+Shift+g');

  await expect(frame.locator('.element.is-group')).toHaveCount(0);
  await expect(frame.locator('.element.selected')).toHaveCount(3);
  await expect(frame.locator('.element.is-group.selected')).toHaveCount(0);
});

test('nested group child multi-selection supports align nudge copy paste and delete', async ({ page }) => {
  await marqueeHomeElements(page);
  await page.keyboard.press('Meta+g');

  const frame = page.locator('.frame').first();
  const group = frame.locator('.element.is-group');
  const textChildren = group.locator('.element.is-text');
  await expect(textChildren).toHaveCount(2);

  await textChildren.first().click({ modifiers: ['Meta'] });
  await textChildren.first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Select all of same type' }).click();
  await expect(group.locator('.element.is-text.selected')).toHaveCount(2);

  await page.getByTitle('Align left').click();
  await expect.poll(async () => {
    const xs = await textChildren.evaluateAll(elements =>
      elements.map(element => Math.round((element as HTMLElement).getBoundingClientRect().x))
    );
    return new Set(xs).size;
  }).toBe(1);
  const alignedXs = await textChildren.evaluateAll(elements =>
    elements.map(element => Math.round((element as HTMLElement).getBoundingClientRect().x))
  );

  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Math.round((await textChildren.first().boundingBox())?.x ?? 0)).toBeGreaterThan(alignedXs[0]);

  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(frame.locator('.element.is-text')).toHaveCount(4);
  await expect(frame.locator('.element.is-text.selected')).toHaveCount(2);

  await page.keyboard.press('Control+z');
  await expect(group.locator('.element.is-text.selected')).toHaveCount(2);

  await page.keyboard.press('Delete');
  await expect(group.locator('.element.is-text')).toHaveCount(0);
  await expect(group.locator('.element')).toHaveCount(1);
});

test('canvas hierarchy selection descends ascends and lists layers under cursor', async ({ page }) => {
  await marqueeHomeElements(page);
  await page.keyboard.press('Meta+g');

  const frame = page.locator('.frame').first();
  const group = frame.locator('.element.is-group');
  await expect(group).toHaveCount(1);
  const child = group.locator('.element.is-text').first();
  const childLabel = await child.getAttribute('data-layer-label');
  if (!childLabel) throw new Error('Expected grouped child to expose a layer label');
  const childMenuName = new RegExp(`Select layer: ${childLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);

  await child.dblclick();
  await expect(group.locator('.element.selected')).toHaveCount(1);

  await page.keyboard.press('Shift+Enter');
  await expect(group).toHaveClass(/selected/);

  await page.keyboard.press('Shift+Enter');
  await expect(frame).toHaveClass(/active/);
  await expect(group).not.toHaveClass(/primary-selected/);

  await page.keyboard.press('Enter');
  await expect(group).toHaveClass(/primary-selected/);

  await child.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: childMenuName })).toBeVisible();
  await page.getByRole('menuitem', { name: childMenuName }).click({ force: true });
  await expect(child).toHaveClass(/selected/);
});

test('layer tree rows activate with Space for keyboard users', async ({ page }) => {
  const aboutRow = page.getByRole('treeitem', { name: /About about\.html/ }).first();

  await aboutRow.focus();
  await page.keyboard.press('Space');

  await expect(aboutRow).toHaveAttribute('aria-selected', 'true');
});

test('autosave status announces saved changes politely', async ({ page }) => {
  const saveSyncStatus = page.locator('[aria-label="Save and sync status"]');
  await expect(saveSyncStatus).toContainText('Local autosave');
  await expect(saveSyncStatus).toHaveAttribute('title', /Folder sync/);
  await expect(saveSyncStatus).toHaveAttribute('title', /Cloud sync|Sign in to enable cloud sync/);

  await page.keyboard.press('Control+d');

  const status = page.locator('.save-status:not(.cloud-pill)');
  await expect(status).toBeVisible({ timeout: 3000 });
  await expect(status).toHaveAttribute('role', 'status');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toHaveAttribute('aria-atomic', 'true');
  await expect(status).toContainText('Saved');
});

test('command palette fuzzy-search jumps to a page with the keyboard', async ({ page }) => {
  await page.keyboard.press('Control+k');

  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const search = palette.getByRole('combobox', { name: 'Search commands' });
  await expect(search).toBeFocused();
  await search.fill('about.html');
  await expect(palette.getByRole('option', { name: /About.*about\.html/ })).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(palette).toBeHidden();
  await expect(page.locator('.frame-row[aria-selected="true"]').first()).toContainText('about.html');
});

test('command palette executes a matching action', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search commands' }).fill('grid overlay');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: 'Drag from top ruler to create horizontal guide' })).toBeVisible();
  await expect(page.locator('.canvas-world')).not.toHaveClass(/has-grid/);
});

test('command palette searches inspector settings and restores the inspector', async ({ page }) => {
  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(page.locator('.right-panel')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const search = palette.getByRole('combobox', { name: 'Search commands' });
  await search.fill('inspector typography');
  await palette.getByRole('option', { name: /Search inspector: Typography/ }).click();

  await expect(palette).toBeHidden();
  await expect(page.locator('.right-panel')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
  const inspectorSearch = page.getByRole('searchbox', { name: 'Search inspector properties' });
  await expect(inspectorSearch).toHaveValue('Typography');
  await expect(inspectorSearch).toBeFocused();
  await expect(page.getByRole('button', { name: /Collapse Typography|Expand Typography/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Collapse Transform|Expand Transform/ }).first()).toBeHidden();
});

test('actions command center exposes implemented operations and hides unavailable release actions', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: 'Search commands' });
  await search.fill('align');
  await expect(page.getByRole('option', { name: /Align left/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Distribute horizontal spacing/ })).toBeVisible();

  await search.fill('rasterize');
  await expect(page.getByRole('option', { name: /Rasterize selection/ })).toHaveCount(0);

  await search.fill('paste replace');
  await expect(page.getByRole('option', { name: /Paste to replace/ })).toHaveCount(0);

  await search.fill('select all frames');
  await page.keyboard.press('Enter');
  await expect(page.locator('.topbar-center')).toContainText('3 frames');
});

test('command palette dynamic import failure shows fallback alert', async ({ page }) => {
  await page.route('**/src/lib/CommandPalette.svelte**', route => route.abort());
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('alert')).toContainText('Command palette failed to load');
});

test('actions command center renames the current frame', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search commands' }).fill('rename selection');
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Rename frame' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('Renamed Home');
  await dialog.getByRole('button', { name: 'Rename' }).click();

  await expect(page.getByRole('textbox', { name: /Rename page/ }).first()).toHaveValue('Renamed Home');
  await expect(page.locator('.topbar-center')).toContainText('Renamed Home');
});

test('keyboard shortcuts modal lazy-loads and closes', async ({ page }) => {
  await page.keyboard.press('Control+/');
  const modal = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Open command palette');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('accessibility smoke traps modal focus and supports keyboard-only inspector controls', async ({ page }) => {
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  const commandSearch = palette.getByRole('combobox', { name: 'Search commands' });
  await expect(commandSearch).toBeFocused();
  await commandSearch.fill('rename');
  const lastOption = palette.getByRole('option').last();
  await page.keyboard.press('Shift+Tab');
  await expect(lastOption).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(commandSearch).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  await page.keyboard.press('g');
  const dialog = page.getByRole('dialog', { name: 'Move selection to X,Y' });
  const positionInput = dialog.getByRole('textbox');
  const moveButton = dialog.getByRole('button', { name: 'Move' });
  await expect(positionInput).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(moveButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(positionInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  const inspectorSearch = page.getByRole('searchbox', { name: 'Search inspector properties' });
  await inspectorSearch.focus();
  await page.keyboard.type('typography');
  const typographyToggle = page.getByRole('button', { name: /Collapse Typography|Expand Typography/ }).first();
  await tabUntilFocused(page, typographyToggle, 12);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Expand Typography' })).toHaveAttribute('aria-expanded', 'false');
});

test('topbar actions remain reachable at narrow desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });

  const topbarMetrics = await page.locator('.topbar').evaluate(node => ({
    viewport: window.innerWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    topbarScrollWidth: node.scrollWidth,
    topbarClientWidth: node.clientWidth,
  }));
  expect(topbarMetrics.documentScrollWidth).toBe(topbarMetrics.viewport);
  expect(topbarMetrics.topbarScrollWidth).toBeLessThanOrEqual(topbarMetrics.topbarClientWidth + 1);

  const primaryActions = page.locator('.topbar-primary-actions');
  await expect(primaryActions.getByRole('button', { name: 'Preview', exact: true })).toBeVisible();
  await expect(primaryActions.getByRole('button', { name: 'Export current page as HTML' })).toBeVisible();
  await expect(primaryActions.getByRole('button', { name: 'New Project ▾', exact: true })).toBeVisible();
  await expect(primaryActions.getByRole('button', { name: 'Edit with AI', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Code mode' })).toHaveCount(0);
  const textMenu = await openToolbarGroup(page, 'text');
  await expect(textMenu.getByRole('menuitem', { name: /Text on path/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.workspace-menu-trigger')).toBeVisible();

  const rightMetrics = await page.locator('.topbar-right').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return {
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      containerWithinViewport: rect.left >= 0 && rect.right <= window.innerWidth,
    };
  });
  expect(rightMetrics.containerWithinViewport).toBe(true);
  expect(rightMetrics.scrollWidth).toBeLessThanOrEqual(rightMetrics.clientWidth + 1);

  const workspace = await openWorkspaceControls(page);
  await expect(workspace.getByRole('group', { name: 'Editor permission mode' })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /Outline/ })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Minify export HTML' })).toBeVisible();
  const workspaceVisible = await workspace.evaluate(menu => {
    const rect = menu.getBoundingClientRect();
    const sample = document.elementFromPoint(
      Math.min(rect.right - 12, window.innerWidth - 12),
      rect.top + 20,
    );
    return rect.left >= 0 && rect.right <= window.innerWidth && !!sample?.closest('.workspace-menu');
  });
  expect(workspaceVisible).toBe(true);
  await closeWorkspaceControls(page);

  await page.getByRole('button', { name: /New Project/ }).click();
  await expect(page.locator('.template-menu')).toBeVisible();
  const menuVisible = await page.locator('.template-menu').evaluate(menu => {
    const rect = menu.getBoundingClientRect();
    const sample = document.elementFromPoint(
      Math.min(rect.right - 12, window.innerWidth - 12),
      rect.top + 20,
    );
    return rect.left >= 0 && rect.right <= window.innerWidth && !!sample?.closest('.template-menu');
  });
  expect(menuVisible).toBe(true);
});

test('workspace menu groups secondary controls and hides release-blocked AI edit shell', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 760 });

  const workspace = await openWorkspaceControls(page);
  await expect(workspace.locator('.workspace-section-title')).toContainText([
    'Mode',
    'View',
    'Review',
    'Export',
    'Versions',
    'Storage',
  ]);
  await expect(workspace.getByRole('button', { name: 'Minify export HTML' })).toBeVisible();
  await expect(workspace.getByRole('button', { name: /Versions/ })).toBeVisible();
  await closeWorkspaceControls(page);

  await expect(page.getByRole('button', { name: 'Edit with AI', exact: true })).toHaveCount(0);
  const aiDialog = page.getByRole('dialog', { name: 'Edit with AI dry-run' });
  await expect(aiDialog).toHaveCount(0);
  await expect(page.locator('.frame').first()).toBeVisible();
});

test('left panel truncates long page layer and component names without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  const longName = [
    'Extremely long production landing page layer component name',
    'with-unbroken-token-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'and nested section label for visual overflow audit',
  ].join(' / ');
  const panel = page.locator('.left-panel');
  await expect(panel).toBeVisible();

  const pageName = panel.getByRole('textbox', { name: /Rename page/ }).first();
  await pageName.fill(longName);
  await pageName.press('Enter');
  await expect(pageName).toHaveValue(longName);

  const layerName = panel.getByRole('textbox', { name: /Rename layer/ }).first();
  await layerName.fill(`${longName} / layer`);
  await layerName.press('Enter');
  await expect(layerName).toHaveValue(`${longName} / layer`);

  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  await page.keyboard.press('Control+Alt+K');

  const componentName = `${longName} / reusable component`;
  const components = page.getByRole('region', { name: 'Components' });
  const componentRename = components.getByRole('textbox', { name: /Rename component/ }).first();
  await componentRename.fill(componentName);
  await componentRename.press('Enter');
  await expect(componentRename).toHaveValue(componentName);
  await components.getByRole('listitem', { name: `Component ${componentName}` }).hover();

  const fileMetrics = await collectLeftPanelLayoutMetrics(page);
  expect(fileMetrics.documentScrollWidth).toBe(fileMetrics.documentClientWidth);
  expect(fileMetrics.panelScrollWidth).toBeLessThanOrEqual(fileMetrics.panelClientWidth + 1);
  expect(fileMetrics.outsidePanel).toEqual([]);
  expect(fileMetrics.nameStyles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ className: expect.stringContaining('inline-name-input'), textOverflow: 'ellipsis', overflowX: expect.stringMatching(/^(hidden|clip)$/), whiteSpace: 'nowrap' }),
      expect.objectContaining({ className: expect.stringContaining('page-filename'), textOverflow: 'ellipsis', overflowX: expect.stringMatching(/^(hidden|clip)$/), whiteSpace: 'nowrap' }),
    ]),
  );

  await page.getByRole('button', { name: 'Assets tab' }).click();
  const libraries = page.getByRole('region', { name: 'Assets and libraries' });
  await libraries.getByLabel('Library filter').selectOption('components');
  await expect(libraries.getByRole('listitem', { name: `component ${componentName}` })).toBeVisible();
  await libraries.getByRole('listitem', { name: `component ${componentName}` }).hover();

  const libraryMetrics = await collectLeftPanelLayoutMetrics(page);
  expect(libraryMetrics.documentScrollWidth).toBe(libraryMetrics.documentClientWidth);
  expect(libraryMetrics.panelScrollWidth).toBeLessThanOrEqual(libraryMetrics.panelClientWidth + 1);
  expect(libraryMetrics.outsidePanel).toEqual([]);
  expect(libraryMetrics.nameStyles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ className: expect.stringContaining('asset-name'), textOverflow: 'ellipsis', overflowX: expect.stringMatching(/^(hidden|clip)$/), whiteSpace: 'nowrap' }),
      expect.objectContaining({ className: expect.stringContaining('page-filename'), textOverflow: 'ellipsis', overflowX: expect.stringMatching(/^(hidden|clip)$/), whiteSpace: 'nowrap' }),
    ]),
  );
});

test('bottom toolbar actions remain reachable at phone widths', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 720 });
    const toolbar = page.locator('.bottom-toolbar');
    await expect(toolbar).toBeVisible();

    const metrics = await collectBottomToolbarMetrics(page);
    expect(metrics.documentScrollWidth).toBe(metrics.documentClientWidth);
    expect(metrics.toolbarWithinViewport, JSON.stringify(metrics, null, 2)).toBe(true);
    expect(metrics.toolbarClientWidth).toBeLessThanOrEqual(metrics.viewport);

    const reachability = await toolbar.evaluate(node => {
      const toolbarEl = node as HTMLElement;
      const buttons = Array.from(toolbarEl.querySelectorAll('button')) as HTMLElement[];
      toolbarEl.scrollLeft = toolbarEl.scrollWidth;
      const rect = toolbarEl.getBoundingClientRect();
      const last = buttons.at(-1)?.getBoundingClientRect();
      return {
        scrollLeft: toolbarEl.scrollLeft,
        hasOverflow: toolbarEl.scrollWidth > toolbarEl.clientWidth + 1,
        lastVisibleAfterScroll: !!last && last.left >= rect.left - 1 && last.right <= rect.right + 1,
      };
    });
    expect(reachability.lastVisibleAfterScroll, JSON.stringify({ width, reachability, metrics }, null, 2)).toBe(true);
    if (reachability.hasOverflow) expect(reachability.scrollLeft).toBeGreaterThan(0);

    await toolbar.evaluate(node => {
      const picker = node.querySelector('.shape-picker');
      picker?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    await page.getByRole('button', { name: 'Choose shape' }).click();
    await expect(page.locator('.shape-dropdown')).toBeVisible();
    const dropdownMetrics = await page.locator('.shape-dropdown').evaluate(menu => {
      const rect = menu.getBoundingClientRect();
      const style = getComputedStyle(menu as HTMLElement);
      const toolbar = document.querySelector('.bottom-toolbar') as HTMLElement | null;
      const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null;
      const sample = document.elementFromPoint(
        Math.min(rect.right - 10, window.innerWidth - 10),
        Math.max(rect.top + 10, 10),
      );
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        position: style.position,
        cssLeft: style.left,
        zIndex: style.zIndex,
        transform: style.transform,
        toolbarLeft: toolbarStyle?.left,
        toolbarRight: toolbarStyle?.right,
        toolbarTransform: toolbarStyle?.transform,
        sampleTag: sample?.tagName,
        sampleClass: sample instanceof HTMLElement ? sample.className : null,
        withinViewport: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight,
        hitTestInside: !!sample?.closest('.shape-dropdown'),
      };
    });
    expect(dropdownMetrics.withinViewport, JSON.stringify({ width, dropdownMetrics }, null, 2)).toBe(true);
    expect(dropdownMetrics.hitTestInside, JSON.stringify({ width, dropdownMetrics }, null, 2)).toBe(true);
    await page.mouse.click(8, 8);
    await expect(page.locator('.shape-dropdown')).toHaveCount(0);
  }
});

test('primary popovers stay within viewport near screen edges', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 720 });

    await page.locator('.file-menu-trigger').click();
    await expect(page.locator('.file-menu')).toBeVisible();
    const fileMetrics = await collectPopoverMetrics(page, '.file-menu');
    expect(fileMetrics.withinViewport, JSON.stringify({ width, fileMetrics }, null, 2)).toBe(true);
    expect(fileMetrics.hitTestInside, JSON.stringify({ width, fileMetrics }, null, 2)).toBe(true);

    await page.locator('.view-menu-trigger').click();
    await expect(page.locator('.preferences-menu')).toBeVisible();
    const viewMetrics = await collectPopoverMetrics(page, '.preferences-menu');
    expect(viewMetrics.withinViewport, JSON.stringify({ width, viewMetrics }, null, 2)).toBe(true);
    expect(viewMetrics.hitTestInside, JSON.stringify({ width, viewMetrics }, null, 2)).toBe(true);
    await page.mouse.click(width - 4, 716);
    await expect(page.locator('.preferences-menu')).toHaveCount(0);

    const toolbar = page.locator('.bottom-toolbar');
    await toolbar.evaluate(node => {
      node.querySelector('.shape-picker')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
    await page.getByRole('button', { name: 'Choose shape' }).click();
    await expect(page.locator('.shape-dropdown')).toBeVisible();
    const shapeMetrics = await collectPopoverMetrics(page, '.shape-dropdown');
    expect(shapeMetrics.withinViewport, JSON.stringify({ width, shapeMetrics }, null, 2)).toBe(true);
    expect(shapeMetrics.hitTestInside, JSON.stringify({ width, shapeMetrics }, null, 2)).toBe(true);
    await page.mouse.click(width - 4, 716);
    await expect(page.locator('.shape-dropdown')).toHaveCount(0);
  }

  await page.setViewportSize({ width: 900, height: 720 });
  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  const inspector = page.locator('.right-panel');
  await expect(inspector).toBeVisible();
  await expect.poll(() => inspector.locator('.cp-swatch').count()).toBeGreaterThan(0);
  await inspector.locator('.cp-swatch').first().click();
  await expect(page.getByRole('dialog', { name: 'Color picker' })).toBeVisible();
  const colorMetrics = await collectPopoverMetrics(page, '.cp-popover');
  expect(colorMetrics.withinViewport, JSON.stringify({ colorMetrics }, null, 2)).toBe(true);
  expect(colorMetrics.hitTestInside, JSON.stringify({ colorMetrics }, null, 2)).toBe(true);
});

test('muted labels and disabled controls keep readable contrast', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();

  const samples: Awaited<ReturnType<typeof collectUiContrastSamples>> = [];
  const collect = async (targets: UiContrastTarget[]) => {
    samples.push(...await collectUiContrastSamples(page, targets));
  };

  await collect([
    { name: 'left muted badges', selector: '.left-panel .count-badge.muted', minRatio: 3 },
    { name: 'right muted hints', selector: '.right-panel .meta-hint, .right-panel .img-empty', minRatio: 3 },
    { name: 'right disabled quick actions', selector: '.right-panel .inspector-quick-actions button:disabled', minRatio: 3 },
    { name: 'right disabled action buttons', selector: '.right-panel .action-btn:disabled, .right-panel .inline-link-row button:disabled', minRatio: 3 },
  ]);

  await page.getByRole('button', { name: 'Assets tab' }).click();
  await collect([
    { name: 'left empty hints', selector: '.left-panel .empty-hint', minRatio: 3 },
  ]);
  await page.getByRole('button', { name: 'File tab' }).click();

  await page.locator('.file-menu-trigger').click();
  await expect(page.locator('.file-menu')).toBeVisible();
  await collect([
    { name: 'menu section headers', selector: '.file-menu .template-menu-head', minRatio: 3 },
    { name: 'file menu descriptions', selector: '.file-menu .template-desc', minRatio: 3 },
    { name: 'file menu disabled actions', selector: '.file-menu .template-option:disabled', minRatio: 3 },
  ]);
  await page.mouse.click(12, 716);
  await expect(page.locator('.file-menu')).toHaveCount(0);

  const toolbar = page.locator('.bottom-toolbar');
  await toolbar.evaluate(node => {
    node.querySelector('.shape-picker')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  await page.getByRole('button', { name: 'Choose shape' }).click();
  await expect(page.locator('.shape-dropdown')).toBeVisible();
  await collect([
    { name: 'toolbar disabled menu options', selector: '.toolbar-dropdown .shape-option.disabled', minRatio: 3 },
    { name: 'shape hotkeys', selector: '.shape-hotkey', minRatio: 3 },
  ]);
  await page.mouse.click(12, 716);
  await expect(page.locator('.shape-dropdown')).toHaveCount(0);

  await chooseWorkspaceMode(page, 'View');
  await collect([
    { name: 'topbar disabled buttons', selector: '.topbar .tb-btn:disabled', minRatio: 3 },
    { name: 'bottom toolbar disabled tools', selector: '.bottom-toolbar .tool-btn:disabled, .bottom-toolbar .shape-chevron-btn:disabled', minRatio: 3 },
  ]);

  const failures = samples.filter(sample => sample.ratio !== null && sample.ratio < sample.minRatio);
  expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
});

test('keyboard focus indicators stay visible on new editor controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });

  await expectVisibleFocusIndicator(page, page.locator('.file-menu-trigger'), 'File menu trigger');
  await page.locator('.file-menu-trigger').click();
  await expect(page.locator('.file-menu')).toBeVisible();
  await expectVisibleFocusIndicator(page, page.getByRole('menuitem', { name: /Rename project/ }), 'File menu item');
  await page.mouse.click(12, 716);
  await expect(page.locator('.file-menu')).toHaveCount(0);

  await expectVisibleFocusIndicator(page, page.locator('.view-menu-trigger'), 'View menu trigger');
  await page.locator('.view-menu-trigger').click();
  await expect(page.locator('.preferences-menu')).toBeVisible();
  await expectVisibleFocusIndicator(page, page.getByRole('spinbutton', { name: 'Zoom percentage' }), 'View menu zoom input');
  await expectVisibleFocusIndicator(page, page.getByRole('combobox', { name: 'Pixel preview' }), 'View menu select');
  await page.mouse.click(12, 716);
  await expect(page.locator('.preferences-menu')).toHaveCount(0);

  const toolbar = page.locator('.bottom-toolbar');
  await expectVisibleFocusIndicator(page, page.getByRole('button', { name: 'Move tool (V)' }), 'Bottom toolbar tool');
  await toolbar.evaluate(node => {
    node.querySelector('.shape-picker')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  await expectVisibleFocusIndicator(page, page.getByRole('button', { name: 'Choose shape' }), 'Shape menu trigger');
  await page.getByRole('button', { name: 'Choose shape' }).click();
  await expect(page.locator('.shape-dropdown')).toBeVisible();
  await expectVisibleFocusIndicator(page, page.getByRole('menuitem', { name: /Rectangle/ }), 'Shape menu item');
  await page.mouse.click(12, 716);
  await expect(page.locator('.shape-dropdown')).toHaveCount(0);

  await expectVisibleFocusIndicator(page, page.getByLabel('Search layers'), 'Left panel search');
  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  await expectVisibleFocusIndicator(page, page.getByLabel('Search inspector properties'), 'Inspector search');
  await expectVisibleFocusIndicator(page, page.locator('.inspector-quick-actions button:not(:disabled)').first(), 'Inspector quick action');

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await expectVisibleFocusIndicator(page, page.getByRole('combobox', { name: 'Search commands' }), 'Command palette search');
  await expectVisibleFocusIndicator(page, palette.getByRole('option').first(), 'Command palette option');
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);

  await page.keyboard.press('g');
  const gotoDialog = page.getByRole('dialog', { name: 'Move selection to X,Y' });
  await expect(gotoDialog).toBeVisible();
  await expectVisibleFocusIndicator(page, gotoDialog.getByRole('textbox'), 'Dialog text input');
  await expectVisibleFocusIndicator(page, gotoDialog.getByRole('button', { name: 'Move' }), 'Dialog primary button');
  await page.keyboard.press('Escape');
  await expect(gotoDialog).toHaveCount(0);

  const inspector = page.locator('.right-panel');
  await expect.poll(() => inspector.locator('.cp-swatch').count()).toBeGreaterThan(0);
  await expectVisibleFocusIndicator(page, inspector.locator('.cp-swatch').first(), 'Color picker swatch');
  await inspector.locator('.cp-swatch').first().click();
  const colorDialog = page.getByRole('dialog', { name: 'Color picker' });
  await expect(colorDialog).toBeVisible();
  await expectVisibleFocusIndicator(page, colorDialog.getByRole('textbox', { name: 'Color value' }), 'Color picker text input');
});

test('navigation chrome can resize, hide, and temporarily reveal properties', async ({ page }) => {
  const leftPanel = page.locator('.left-panel');
  const before = await leftPanel.boundingBox();
  if (!before) throw new Error('Left panel did not render');

  const resizer = page.getByRole('button', { name: 'Resize left panel' });
  const grip = await resizer.boundingBox();
  if (!grip) throw new Error('Left panel resize grip did not render');
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 40);
  await page.mouse.down();
  await page.mouse.move(grip.x + 64, grip.y + 40, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => (await leftPanel.boundingBox())?.width ?? 0).toBeGreaterThan(before.width + 30);
  await clearInitialFrameSelection(page);

  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(page.locator('.left-panel')).toHaveCount(0);
  await expect(page.locator('.right-panel')).toHaveCount(0);
  await expect(page.locator('.bottom-toolbar')).toBeHidden();

  await page.locator('.frame').first().locator('.element.is-text').first().click();
  await expect(page.getByText('Properties shown temporarily for this selection')).toBeVisible();
  await expect(page.locator('.right-panel')).toBeVisible();

  await page.getByRole('button', { name: 'Show', exact: true }).click();
  await expect(page.locator('.left-panel')).toBeVisible();
  await expect(page.locator('.right-panel')).toBeVisible();
  await expect(page.locator('.bottom-toolbar')).toBeVisible();
});

test('lazy inspector reloads and reveals from minimized or hidden chrome', async ({ page }) => {
  const rightPanel = page.locator('.right-panel');
  await expect(rightPanel).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');

  await page.reload();
  await expect(page.locator('.frame').first()).toBeVisible();
  await expect(rightPanel).toBeVisible();
  await expect(page.locator('.right-panel-loader')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');

  await clearInitialFrameSelection(page);
  await page.getByRole('button', { name: 'Minimize' }).click();
  await expect(rightPanel).toHaveCount(0);

  await page.locator('.frame').first().locator('.element.is-text').first().click();
  await expect(page.getByText('Properties shown temporarily for this selection')).toBeVisible();
  await expect(rightPanel).toBeVisible();
  await expect(rightPanel.getByLabel('Element X')).toBeVisible();

  await page.getByRole('button', { name: 'Show UI' }).click();
  await expect(rightPanel).toBeVisible();
  await page.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(rightPanel).toHaveCount(0);

  await page.locator('.frame').first().locator('.element.is-button').first().click();
  await expect(page.getByText('Properties shown temporarily for this selection')).toBeVisible();
  await expect(rightPanel).toBeVisible();
  await expect(rightPanel.getByLabel('Element X')).toBeVisible();
});

test('file menu exposes rename and version-history project actions', async ({ page }) => {
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: /Rename project/ }).click();

  const rename = page.getByRole('dialog', { name: 'Rename project' });
  await expect(rename).toBeVisible();
  await rename.getByRole('textbox').fill('Chrome QA Project');
  await rename.getByRole('button', { name: 'Rename' }).click();

  await page.getByRole('button', { name: 'File ▾' }).click();
  await expect(page.getByRole('menuitem', { name: /Rename project/ })).toContainText('Chrome QA Project');
  await page.getByRole('menuitem', { name: /Version history/ }).click();
  await expect(page.getByRole('dialog', { name: 'Saved snapshots' })).toBeVisible();
});

test('snapshot actions expose status messages while versions panel is open', async ({ page }) => {
  await clickWorkspaceControl(page, /Snapshot/);
  const create = page.getByRole('dialog', { name: 'Create snapshot' });
  await expect(create).toBeVisible();
  await create.getByRole('textbox').fill('Loading audit snapshot');
  await create.getByRole('button', { name: 'Save snapshot' }).click();
  await expect(page.locator('.save-status:not(.cloud-pill)')).toContainText('Snapshot saved');

  await clickWorkspaceControl(page, /Versions/);
  const panel = page.getByRole('dialog', { name: 'Saved snapshots' });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.snapshot-status')).toHaveAttribute('role', 'status');
  await expect(panel.locator('.snapshot-status')).toContainText('Snapshot saved');
  await expect(panel.getByRole('button', { name: 'Loading audit snapshot' })).toBeVisible();
});

test('view preferences menu persists view and accessibility settings', async ({ page }) => {
  await page.getByRole('button', { name: 'View ▾' }).click();
  await page.getByLabel('Rulers and grid').check();
  await expect(page.getByRole('button', { name: 'Drag from top ruler to create horizontal guide' })).toBeVisible();
  await expect(page.locator('.canvas-world')).not.toHaveClass(/has-grid/);

  const initialZoom = await page.getByLabel('Zoom percentage').inputValue();
  await page.getByRole('menuitem', { name: /Zoom to selection/ }).click();
  await expect.poll(() => page.getByLabel('Zoom percentage').inputValue()).not.toBe(initialZoom);

  await page.getByLabel('Zoom percentage').fill('400');
  await page.getByLabel('Zoom percentage').press('Enter');
  await expect(page.locator('.canvas-world')).toHaveClass(/has-grid/);

  await page.getByLabel('Pixel preview').selectOption('2x');
  await expect(page.locator('.canvas-world')).toHaveClass(/pixel-preview-2x/);
  await page.getByLabel('Layout guides').uncheck();
  await expect(page.getByLabel('Multiplayer cursors')).toHaveCount(0);

  await page.getByLabel('Theme preference').selectOption('warm');
  await expect(page.locator('.app-shell')).toHaveClass(/theme-warm/);

  await page.getByLabel('Accessibility color vision preference').selectOption('protanopia');
  await page.getByLabel('Reduce motion').check();
  await page.getByLabel('Layer hover highlights').uncheck();
  await expect(page.locator('.app-shell')).toHaveClass(/reduced-motion/);
  await expect(page.locator('.app-shell')).toHaveClass(/layer-hover-disabled/);

  await page.reload();
  await expect(page.locator('.frame').first()).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveClass(/theme-warm/);
  await expect(page.locator('.app-shell')).toHaveClass(/reduced-motion/);
  await expect(page.locator('.app-shell')).toHaveClass(/layer-hover-disabled/);
  await page.getByRole('button', { name: 'View ▾' }).click();
  await expect(page.getByLabel('Rulers and grid')).toBeChecked();
  await expect(page.getByLabel('Pixel preview')).toHaveValue('2x');
  await expect(page.getByLabel('Layout guides')).not.toBeChecked();
  await expect(page.getByLabel('Multiplayer cursors')).toHaveCount(0);
  await expect(page.getByLabel('Theme preference')).toHaveValue('warm');
  await expect(page.getByLabel('Accessibility color vision preference')).toHaveValue('protanopia');
});

test('left panel File and Assets tabs switch with shortcuts and preserve context', async ({ page }) => {
  const layerSearch = page.getByLabel('Search layers');
  await layerSearch.fill('contact');
  await expect(layerSearch).toHaveValue('contact');

  await page.getByRole('button', { name: 'Assets tab' }).click();
  await expect(page.getByLabel('Search layers')).toBeHidden();
  await expect(page.getByText(/No uploaded assets yet|Project assets/)).toBeVisible();

  await page.keyboard.press('Alt+1');
  await expect(page.getByLabel('Search layers')).toHaveValue('contact');
  await expect(page.getByRole('tree')).toBeVisible();

  await page.keyboard.press('Alt+2');
  await expect(page.getByLabel('Search layers')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Assets tab' })).toHaveAttribute('aria-pressed', 'true');
});

test('empty project states explain no frames and no local library items', async ({ page }) => {
  const now = Date.now();
  const projectSeed = {
    id: 'empty-state-project',
    title: 'Empty State Project',
    lastClientRev: 0,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ownerUserId: null,
    thumbnailAssetId: null,
    payload: {
      schemaVersion: 22,
      frames: [],
      orphanElements: [],
      componentMasters: [],
      snippets: [],
      projectStyles: [],
      variableCollections: [],
    },
  };
  await page.addInitScript((seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
  }, projectSeed);
  await page.evaluate(async (seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
    const storage = await (Function('return import("/src/storage.ts")')() as Promise<{
      loadProjectAsync(): Promise<{ project: typeof seed }>;
      saveProjectAsync(project: typeof seed): Promise<boolean>;
    }>);
    const ok = await storage.saveProjectAsync(seed);
    const loaded = await storage.loadProjectAsync();
    return { ok, loadedProjectId: loaded.project.id };
  }, projectSeed).then(result => {
    expect(result).toEqual({ ok: true, loadedProjectId: 'empty-state-project' });
  });

  await page.reload();
  await expect(page.locator('.canvas')).toBeVisible();
  await expect(page.locator('.canvas-empty-state')).toContainText('No pages yet');
  await expect(page.getByRole('treeitem', { name: /No pages yet/ })).toContainText('Create a page to start designing');
  await expect(page.getByRole('button', { name: 'Create first page' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Components' })).toContainText('No components yet');
  await expect(page.getByRole('region', { name: 'Snippets' })).toContainText('No snippets yet');

  await page.getByRole('button', { name: 'Assets tab' }).click();
  await expect(page.getByRole('region', { name: 'Assets', exact: true })).toContainText('No uploaded assets yet');

  const libraries = page.getByRole('region', { name: 'Assets and libraries' });
  await libraries.getByLabel('Library filter').selectOption('components');
  await expect(libraries.getByRole('status')).toContainText('No components yet');
  await libraries.getByLabel('Library filter').selectOption('snippets');
  await expect(libraries.getByRole('status')).toContainText('No snippets yet');
  await libraries.getByLabel('Library filter').selectOption('assets');
  await expect(libraries.getByRole('status')).toContainText('No uploaded assets yet');
  await libraries.getByLabel('Library filter').selectOption('styles');
  await expect(libraries).toContainText('Display text');
  await libraries.getByLabel('Library filter').selectOption('variables');
  await expect(libraries).toContainText('Brand orange');
});

test('File Assets Libraries and Inspector docks keep bounded visual rhythm', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });

  const fileMetrics = await collectLeftPanelLayoutMetrics(page);
  expect(fileMetrics.documentScrollWidth).toBe(fileMetrics.documentClientWidth);
  expect(fileMetrics.panelScrollWidth).toBeLessThanOrEqual(fileMetrics.panelClientWidth + 1);
  expect(fileMetrics.outsidePanel).toEqual([]);
  expect(fileMetrics.visibleOverflow).toEqual([]);

  const inspectorMetrics = await collectRightPanelLayoutMetrics(page);
  expect(inspectorMetrics.documentScrollWidth).toBe(inspectorMetrics.documentClientWidth);
  expect(inspectorMetrics.panelScrollWidth).toBeLessThanOrEqual(inspectorMetrics.panelClientWidth + 1);
  expect(inspectorMetrics.outsidePanel).toEqual([]);
  expect(inspectorMetrics.visibleOverflow).toEqual([]);

  await page.getByRole('button', { name: 'Assets tab' }).click();
  const libraries = page.getByRole('region', { name: 'Assets and libraries' });
  await libraries.getByLabel('Library filter').selectOption('variables');
  await expect(libraries).toContainText('Brand orange');

  const assetsMetrics = await collectLeftPanelLayoutMetrics(page);
  expect(assetsMetrics.documentScrollWidth).toBe(assetsMetrics.documentClientWidth);
  expect(assetsMetrics.panelScrollWidth).toBeLessThanOrEqual(assetsMetrics.panelClientWidth + 1);
  expect(assetsMetrics.outsidePanel).toEqual([]);
  expect(assetsMetrics.visibleOverflow).toEqual([]);

  const exportDock = await page.locator('.right-panel .inspector-export-dock').evaluate(node => {
    const dock = node as HTMLElement;
    const panel = dock.closest('.right-panel') as HTMLElement;
    const scroller = dock.closest('.inspector-body, .empty-inspector') as HTMLElement | null;
    const dockRect = dock.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      leftAligned: dockRect.left >= panelRect.left - 1 && dockRect.right <= panelRect.right + 1,
      position: getComputedStyle(dock).position,
      startsBelowViewport: dockRect.top > panelRect.bottom,
      scrollable: scroller ? scroller.scrollHeight > scroller.clientHeight : false,
      width: Math.round(dockRect.width),
      panelWidth: Math.round(panelRect.width),
    };
  });
  expect(exportDock.leftAligned).toBe(true);
  expect(Math.abs(exportDock.panelWidth - exportDock.width)).toBeLessThanOrEqual(1);
  expect(exportDock.position).toBe('static');
  expect(exportDock.scrollable).toBe(true);
  expect(exportDock.startsBelowViewport).toBe(true);
});

test('file tree hover collapse insertion and auto-layout order contracts', async ({ page }) => {
  await page.getByRole('button', { name: 'Frame auto layout horizontal' }).click();
  await page.getByRole('combobox', { name: 'Frame auto layout direction' }).selectOption('column');
  const treeValues = async () => page.locator('.left-panel .tree .layer-row:not(.child-layer-row) .inline-name-input').evaluateAll(inputs =>
    inputs.map(input => (input as HTMLInputElement).value)
  );
  await expect.poll(async () => (await treeValues()).slice(0, 4)).toEqual([
    'Frame background layer',
    'Launch something strange and beautiful.',
    'Built and exported locally from Frontendeasy.',
    'Learn More →',
  ]);
  await expect(page.getByRole('treeitem', { name: /Launch something strange/ }).locator('.type-icon')).toHaveAttribute('title', 'Text');

  await page.getByRole('treeitem', { name: /Built and exported/ }).hover();
  await expect(page.locator('.canvas-world .element.layer-tree-hover').filter({ hasText: 'Built and exported' })).toHaveCount(1);

  await page.getByRole('treeitem', { name: /Built and exported/ }).click();
  await page.getByRole('button', { name: 'Collapse layers except selected ancestry' }).click();
  await expect(page.getByRole('treeitem', { name: /Home index\.html/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('treeitem', { name: /About about\.html/ })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('treeitem', { name: /Learn More/ }).click();
  await page.getByTitle('Text (T)').click();
  const frameBox = await page.locator('.canvas-world .frame').first().boundingBox();
  if (!frameBox) throw new Error('Home frame did not render');
  await page.mouse.click(frameBox.x + 80, frameBox.y + 120);
  await expect.poll(async () => (await treeValues()).slice(0, 5)).toEqual([
    'Frame background layer',
    'Launch something strange and beautiful.',
    'Built and exported locally from Frontendeasy.',
    'Learn More →',
    'Text block',
  ]);

  const subtitle = page.getByRole('treeitem', { name: /Built and exported/ });
  const button = page.getByRole('treeitem', { name: /Learn More/ });
  const subtitleBox = await subtitle.boundingBox();
  const buttonBox = await button.boundingBox();
  if (!subtitleBox || !buttonBox) throw new Error('Expected subtitle and button rows to be visible');
  await page.mouse.move(subtitleBox.x + 20, subtitleBox.y + subtitleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(buttonBox.x + 20, buttonBox.y + buttonBox.height - 3, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await treeValues()).slice(0, 5)).toEqual([
    'Frame background layer',
    'Launch something strange and beautiful.',
    'Learn More →',
    'Built and exported locally from Frontendeasy.',
    'Text block',
  ]);
});

test('quick-open limits results to pages and navigates with Cmd+P', async ({ page }) => {
  await page.keyboard.press('Control+p');

  const quickOpen = page.getByRole('dialog', { name: 'Quick open pages' });
  const search = quickOpen.getByRole('combobox', { name: 'Search pages' });
  await expect(quickOpen).toBeVisible();
  await expect(quickOpen.getByRole('option')).toHaveCount(3);
  await expect(quickOpen.getByRole('option', { name: /Action/ })).toHaveCount(0);

  await search.fill('contact');
  await page.keyboard.press('Enter');

  await expect(page.locator('.frame-row[aria-selected="true"]').first()).toContainText('contact.html');
});

test('mini-map shows pages and drag navigation pans the canvas', async ({ page }) => {
  const minimap = page.getByRole('button', { name: /Canvas overview/ });
  await expect(minimap).toBeVisible();
  await expect(minimap.locator('.minimap-frame:not(.loose)')).toHaveCount(3);

  const mapBox = await minimap.boundingBox();
  if (!mapBox) throw new Error('Mini-map did not render');
  const world = page.locator('.canvas-world');
  const before = await world.getAttribute('style');
  await page.mouse.move(mapBox.x + mapBox.width * 0.25, mapBox.y + mapBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + mapBox.width * 0.78, mapBox.y + mapBox.height * 0.5);
  await page.mouse.up();

  await expect.poll(() => world.getAttribute('style')).not.toBe(before);
});

test('profile menu switches language while page shortcuts keep navigation available', async ({ page }) => {
  await expect(page.getByRole('tablist', { name: 'Open pages' })).toHaveCount(0);
  await expect(page.locator('.topbar-center')).toContainText('Home');

  await page.keyboard.press('Control+2');
  await expect(page.locator('.topbar-center')).toContainText('About');
  await page.keyboard.press('Control+1');
  await expect(page.locator('.topbar-center')).toContainText('Home');
  await page.keyboard.press('Control+3');
  await expect(page.locator('.topbar-center')).toContainText('Contact');

  await page.getByRole('button', { name: /Profile menu/ }).click();
  const profileMenu = page.locator('.profile-menu');
  await expect(profileMenu).toBeVisible();
  await expect(profileMenu.getByRole('menuitem', { name: /Profile/ })).toBeVisible();
  await expect(profileMenu.getByRole('menuitem', { name: /Settings/ })).toBeVisible();

  const languageSelect = profileMenu.locator('.profile-language-field select');
  await languageSelect.selectOption('ru');
  await expect(languageSelect).toHaveValue('ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(profileMenu).toContainText('\u041f\u0440\u043e\u0444\u0438\u043b\u044c \u0440\u0430\u0431\u043e\u0447\u0435\u0439 \u043e\u0431\u043b\u0430\u0441\u0442\u0438');
  await expect(profileMenu).toContainText('\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438');
  await expect(profileMenu).toContainText('\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u044f\u0437\u044b\u043a: \u0420\u0443\u0441\u0441\u043a\u0438\u0439');
  await expect(page.locator('.topbar')).toContainText('\u0424\u0430\u0439\u043b');
  await expect(page.locator('.left-panel')).toContainText('\u0420\u0435\u0441\u0443\u0440\u0441\u044b');
  await expect(page.locator('.right-panel')).toContainText('\u0422\u0438\u043f\u043e\u0433\u0440\u0430\u0444\u0438\u043a\u0430');

  await page.keyboard.press('Escape');
  await clearInitialFrameSelection(page);
  const rightPanel = page.locator('.right-panel');
  await expect(rightPanel).toContainText('\u0421\u0432\u043e\u0431\u043e\u0434\u043d\u044b\u0435 \u0441\u043b\u043e\u0438');
  await expect(rightPanel).toContainText('\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0435 \u0440\u0435\u0441\u0443\u0440\u0441\u044b');
  await expect(rightPanel).toContainText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438');
  await expect(rightPanel).toContainText('\u041a\u043e\u043b\u043b\u0435\u043a\u0446\u0438\u0438 \u043f\u0435\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0445 \u0432\u043a\u043b\u044e\u0447\u0430\u044e\u0442 \u0440\u0435\u0436\u0438\u043c\u044b');
  await expect(rightPanel.getByPlaceholder('\u041f\u043e\u0438\u0441\u043a \u0441\u0432\u043e\u0439\u0441\u0442\u0432...')).toBeVisible();
  await expect(page.locator('.inspector-export-dock')).toContainText('\u043f\u0440\u043e\u0435\u043a\u0442 · \u044d\u043a\u0441\u043f\u043e\u0440\u0442 \u043f\u0440\u043e\u0435\u043a\u0442\u0430');
  await expect(rightPanel).not.toContainText('Loose layers');
  await expect(rightPanel).not.toContainText('Select a page for page export settings');

  await rightPanel.getByRole('button', { name: '\u0423\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c' }).click();
  const tokensPanel = page.locator('.tokens-panel');
  await expect(tokensPanel).toContainText('\u041f\u0435\u0440\u0435\u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u043c\u0430\u044f \u0441\u0438\u0441\u0442\u0435\u043c\u0430');
  await expect(tokensPanel).toContainText('\u0421\u0442\u0438\u043b\u0438 \u0438 \u043f\u0435\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u0430');
  await expect(tokensPanel).toContainText('\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c \u043a \u0432\u044b\u0434\u0435\u043b\u0435\u043d\u0438\u044e');
  await expect(tokensPanel).not.toContainText('Project styles and variables');
  await expect(tokensPanel).not.toContainText('Apply to selection');
  await page.keyboard.press('Escape');

  await page.getByTitle('\u0422\u0435\u043a\u0441\u0442 (T)').hover();
  await expect(page.locator('.quick-ui-tooltip')).toContainText('\u0422\u0435\u043a\u0441\u0442 (T)', { timeout: 500 });

  const textLayer = page.locator('.element.is-text').filter({ hasText: 'A personal local-first HTML studio.' }).first();
  await textLayer.click();
  await expect(rightPanel).toContainText('\u0442\u0435\u043a\u0441\u0442');
  await expect(rightPanel).toContainText('\u0410\u043b\u044c\u0444\u0430');
  await expect(rightPanel).toContainText('\u0421\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u043c\u0430\u0441\u043a\u0443 \u0438\u0437 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0433\u043e \u0441\u043b\u043e\u044f');
  await expect(rightPanel).toContainText('\u0422\u043e\u0447\u043a\u0430 \u043f\u043e\u0432\u043e\u0440\u043e\u0442\u0430');
  await expect(rightPanel).toContainText('\u041e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u044f');
  await expect(rightPanel).toContainText('\u0422\u0435\u043a\u0441\u0442');
  await expect(rightPanel).toContainText('\u0412\u044b\u0434\u0435\u043b\u0438\u0442\u0435 \u0442\u0435\u043a\u0441\u0442 \u0432 \u043f\u043e\u043b\u0435 \u043a\u043e\u043d\u0442\u0435\u043d\u0442\u0430');
  await expect(rightPanel).toContainText('\u041f\u0440\u0435\u0441\u0435\u0442 \u0441\u0442\u0438\u043b\u044f \u0442\u0435\u043a\u0441\u0442\u0430');
  await expect(rightPanel).toContainText('\u041f\u0440\u0435\u0441\u0435\u0442 \u0432\u043d\u0435\u0448\u043d\u0435\u0433\u043e \u0432\u0438\u0434\u0430');
  await expect(rightPanel).toContainText('\u0421\u0442\u0438\u043b\u0438 \u0438 \u043f\u0440\u0435\u0441\u0435\u0442\u044b');
  await expect(rightPanel).toContainText('\u042d\u0444\u0444\u0435\u043a\u0442\u044b');
  await expect(rightPanel).toContainText('\u0421\u0442\u0435\u043a \u044d\u0444\u0444\u0435\u043a\u0442\u043e\u0432 \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0438\u0440\u0443\u0435\u0442');
  await expect(rightPanel).toContainText('\u041e\u0431\u0432\u043e\u0434\u043a\u0430');
  await expect(rightPanel).toContainText('\u042d\u043b\u0435\u043c\u0435\u043d\u0442 \u043c\u0430\u043a\u0435\u0442\u0430');
  await expect(rightPanel).toContainText('\u0412\u0437\u0430\u0438\u043c\u043e\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435');
  await expect(rightPanel).toContainText('\u0423\u0442\u0438\u043b\u0438\u0442\u044b \u0432\u044b\u0434\u0435\u043b\u0435\u043d\u0438\u044f');
  await expect(rightPanel).not.toContainText('Create a mask');
  await expect(rightPanel).not.toContainText('Select text in Content');
  await expect(rightPanel).not.toContainText('Effect stack exports');
  await expect(rightPanel).not.toContainText('URL \u0432\u0441\u0442\u0440\u043e\u0435\u043d\u043d\u043e\u0439 \u0441\u0441\u044b\u043b\u043a\u0438');
  await expect(rightPanel).not.toContainText('Flip H');
  await expect(rightPanel).not.toContainText('Identity & Content');
  await expect(rightPanel).not.toContainText('Text style preset');
  await expect(rightPanel).not.toContainText('Styles & presets');
  await expect(rightPanel).not.toContainText('Layout item');
});

test('context menu selects matching elements within the active page', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const homeText = page.locator('.frame').first().locator('.element.is-text');
  await homeText.first().click();
  await page.keyboard.press('Control+d');
  const matchingCount = await homeText.count();

  const selectedText = page.locator('.frame').first().locator('.element.is-text.selected');
  await expect(selectedText).toHaveCount(1);
  await selectedText.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Select all of same type' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Select all of same fill' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Select all of same stroke' })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'Select all of same effect' })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: 'Select all of same font' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Select all of same instance' })).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'Select all of same type' }).click();

  await expect(page.locator('.frame').first().locator('.element.is-text.selected')).toHaveCount(matchingCount);
});

test('context menu delete targets an unselected layer under the cursor', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const text = frame.locator('.element.is-text');
  const buttons = frame.locator('.element.is-button');
  const textCount = await text.count();
  const buttonCount = await buttons.count();
  expect(textCount).toBeGreaterThan(0);
  expect(buttonCount).toBeGreaterThan(0);

  await text.first().click();
  await expect(text.first()).toHaveClass(/selected/);

  await buttons.first().click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Delete' }).click();

  await expect(text).toHaveCount(textCount);
  await expect(buttons).toHaveCount(buttonCount - 1);
});

test('mixed selection colors bulk update styles and select matching attributes', async ({ page }) => {
  await marqueeHomeElements(page);
  const selected = page.locator('.frame').first().locator('.element.selected');
  await expect(selected).toHaveCount(3);

  const panel = page.locator('.right-panel');
  await expect(panel.getByText('Selection colors')).toBeVisible();

  await panel.getByLabel('Bulk fill color').fill('#123456');
  await expect.poll(async () => selected.evaluateAll(elements =>
    elements.map(element => getComputedStyle(element as HTMLElement).backgroundColor)
  )).toEqual(['rgb(18, 52, 86)', 'rgb(18, 52, 86)', 'rgb(18, 52, 86)']);

  await panel.getByRole('button', { name: 'Enable bulk stroke' }).click();
  await panel.getByLabel('Bulk stroke color').fill('#abcdef');
  await expect.poll(async () => selected.evaluateAll(elements =>
    elements.map(element => getComputedStyle(element as HTMLElement).borderTopColor)
  )).toEqual(['rgb(171, 205, 239)', 'rgb(171, 205, 239)', 'rgb(171, 205, 239)']);

  await panel.getByRole('button', { name: 'Same fill' }).click();
  await expect(page.locator('.frame').first().locator('.element.selected')).toHaveCount(3);
  await panel.getByRole('button', { name: 'Same stroke' }).click();
  await expect(page.locator('.frame').first().locator('.element.selected')).toHaveCount(3);

  await panel.getByRole('button', { name: 'Enable bulk shadow' }).click();
  await panel.getByLabel('Bulk shadow color').fill('rgba(1, 2, 3, 0.5)');
  await expect.poll(async () => selected.evaluateAll(elements =>
    elements.map(element => getComputedStyle(element as HTMLElement).boxShadow)
  )).toEqual([
    'rgba(1, 2, 3, 0.5) 0px 4px 12px 0px',
    'rgba(1, 2, 3, 0.5) 0px 4px 12px 0px',
    'rgba(1, 2, 3, 0.5) 0px 4px 12px 0px',
  ]);
  await panel.getByRole('button', { name: 'Same effect' }).click();
  await expect(page.locator('.frame').first().locator('.element.selected')).toHaveCount(3);
});

test('deleting one layer from a multi-selection prunes stale selected ids', async ({ page }) => {
  await marqueeHomeElements(page);
  const frame = page.locator('.frame').first();
  await expect(frame.locator('.element.selected')).toHaveCount(3);
  await expect(page.locator('.layer-row.active')).toHaveCount(3);

  await page.locator('.layer-row.active').first().locator('.del-btn').click();
  await expect(frame.locator('.element.selected')).toHaveCount(2);
  await expect(page.locator('.right-panel')).toContainText('2 selected');
  await expect(page.locator('.right-panel')).not.toContainText('3 selected');

  await frame.locator('.element.selected').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(frame.locator('.element')).toHaveCount(1);
  await expect(frame.locator('.element.selected')).toHaveCount(0);
  await expect(page.locator('.right-panel')).not.toContainText('2 selected');
  await expect(page.locator('.right-panel')).not.toContainText('3 selected');
});

test('effects stack controls render blur glass shadow noise and texture', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const target = page.locator('.frame').first().locator('.element.is-button').first();
  await target.click();

  const panel = page.locator('.right-panel');
  await panel.getByRole('checkbox', { name: 'Enable Inner shadow' }).check();
  await panel.getByLabel('Inner shadow blur').fill('10');
  await panel.getByLabel('Inner shadow color').fill('rgba(255, 255, 255, 0.25)');
  await expect.poll(() => target.evaluate(element => getComputedStyle(element as HTMLElement).boxShadow)).toContain('inset');

  await panel.getByRole('checkbox', { name: 'Enable Layer blur' }).check();
  await panel.getByLabel('Layer blur radius').fill('2');
  await expect.poll(() => target.evaluate(element => getComputedStyle(element as HTMLElement).filter)).toContain('blur(2px)');

  await panel.getByRole('checkbox', { name: 'Enable Background blur' }).check();
  await panel.getByLabel('Background blur radius').fill('12');
  await panel.getByRole('checkbox', { name: 'Enable Glass' }).check();
  await panel.getByLabel('Glass blur').fill('18');
  await panel.getByLabel('Glass saturation').fill('150');
  await expect.poll(() => target.evaluate(element => getComputedStyle(element as HTMLElement).backdropFilter)).toContain('blur(12px)');

  await panel.getByRole('checkbox', { name: 'Enable Noise' }).check();
  await panel.getByLabel('Noise opacity').fill('0.25');
  await panel.getByLabel('Noise size').fill('4');
  await panel.getByRole('checkbox', { name: 'Enable Texture' }).check();
  await panel.getByLabel('Texture style').selectOption('fabric');
  await panel.getByLabel('Texture scale').fill('8');
  await expect.poll(() => target.evaluate(element => getComputedStyle(element as HTMLElement).backgroundImage)).toContain('repeating-radial-gradient');
  await expect.poll(() => target.evaluate(element => getComputedStyle(element as HTMLElement).backgroundImage)).toContain('repeating-linear-gradient');
});

test('position panel exposes constraints tidy-up and multi transform controls', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const title = frame.locator('.element.is-text').first();
  await title.click();

  const panel = page.locator('.right-panel');
  await expect(panel.getByLabel('Constraints diagram')).toBeVisible();
  const horizontal = panel.getByRole('combobox', { name: 'Horizontal constraint' });
  const vertical = panel.getByRole('combobox', { name: 'Vertical constraint' });
  await expect(horizontal).toHaveValue('left');
  await expect(vertical).toHaveValue('top');
  await horizontal.selectOption('right');
  await vertical.selectOption('bottom');
  await expect(horizontal).toHaveValue('right');
  await expect(vertical).toHaveValue('bottom');

  await marqueeHomeElements(page);
  const selected = frame.locator('.element.selected');
  await expect(selected).toHaveCount(3);
  await expect(panel.getByRole('button', { name: 'Tidy up' })).toBeVisible();
  await panel.getByRole('button', { name: 'Tidy up' }).click();
  const tops = await selected.evaluateAll(elements =>
    elements.map(element => Math.round((element as HTMLElement).getBoundingClientRect().top))
  );
  expect(new Set(tops).size).toBe(1);

  await panel.getByRole('button', { name: 'Rotate selection 90 degrees' }).click();
  await expect.poll(async () => selected.evaluateAll(elements =>
    elements.every(element => getComputedStyle(element as HTMLElement).transform !== 'none')
  )).toBe(true);
});

test('move toolbar dropdown matches Figma ordering without legacy lasso clutter', async ({ page }) => {
  const menu = await openToolbarGroup(page, 'move');
  await expect(menu.getByRole('menuitem')).toHaveText([
    /Move\s+V/,
    /Hand tool\s+H/,
    /Scale\s+K/,
  ]);
  await expect(menu).not.toContainText('Lasso');
});

test('presentation mode hides editor chrome and walks through pages', async ({ page }) => {
  await page.keyboard.press('Control+Period');
  const presentation = page.getByRole('dialog', { name: /Presentation mode/ });
  await expect(presentation).toBeVisible();
  await expect(page.locator('.topbar')).not.toBeVisible();
  await expect(presentation.locator('iframe')).toHaveAttribute('title', 'Presentation: Home');
  await expect(page.frameLocator('.presentation-iframe').getByText('Launch something strange and beautiful.')).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(presentation.locator('iframe')).toHaveAttribute('title', 'Presentation: About');
  await expect(page.frameLocator('.presentation-iframe').getByText('A personal local-first HTML studio.')).toBeVisible();

  await page.keyboard.press('Control+Period');
  await expect(presentation).not.toBeVisible();
  await expect(page.locator('.topbar')).toBeVisible();
});

test('outline view removes fills and labels layers without changing tools', async ({ page }) => {
  const target = page.locator('.frame').first().locator('.element.is-button').first();
  await expect(target).toBeVisible();

  await clickWorkspaceControl(page, /Outline/);
  await expect(page.locator('.canvas-world')).toHaveClass(/wireframe/);
  await expect.poll(() => target.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect.poll(() => target.evaluate(element => getComputedStyle(element, '::before').content)).not.toBe('none');

  await clickWorkspaceControl(page, /Outline/);
  await expect(page.locator('.canvas-world')).not.toHaveClass(/wireframe/);
});

test('color vision simulation filters the canvas without changing document state', async ({ page }) => {
  const selector = (await openWorkspaceControls(page)).getByRole('combobox', { name: 'Color vision simulation' });
  const world = page.locator('.canvas-world');

  await selector.selectOption('protanopia');
  await expect.poll(() => world.evaluate(element => getComputedStyle(element).filter)).toContain('frontendeasy-protanopia');

  await selector.selectOption('achromatopsia');
  await expect.poll(() => world.evaluate(element => getComputedStyle(element).filter)).toContain('frontendeasy-achromatopsia');

  await selector.selectOption('none');
  await expect.poll(() => world.evaluate(element => getComputedStyle(element).filter)).toBe('none');
});

test('pinned colours persist per project and can be removed without alt-click', async ({ page }) => {
  const inspector = page.locator('.right-panel');
  const openInspectorColour = async (index: number) => {
    await expect.poll(() => inspector.locator('.cp-swatch').count()).toBeGreaterThan(index);
    await inspector.locator('.cp-swatch').nth(index).click();
    const dialog = page.getByRole('dialog', { name: 'Color picker' });
    await expect(dialog).toBeVisible();
    return dialog;
  };

  let dialog = await openInspectorColour(0);
  await dialog.getByRole('textbox', { name: 'Color value' }).fill('#123457');
  await dialog.getByRole('button', { name: 'Pin current colour to pinned project colours' }).click();
  await expect(dialog.getByRole('button', { name: 'Use pinned colour #123457' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.locator('.frame').first()).toBeVisible();
  dialog = await openInspectorColour(0);
  await expect(dialog.getByRole('button', { name: 'Use pinned colour #123457' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Unpin #123457' }).click();
  await expect(dialog.getByRole('button', { name: 'Use pinned colour #123457' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  await page.reload();
  await expect(page.locator('.frame').first()).toBeVisible();
  dialog = await openInspectorColour(0);
  await expect(dialog.getByRole('button', { name: 'Use pinned colour #123457' })).toHaveCount(0);
});

test('goto position dialog moves the selected frame to exact X,Y coordinates', async ({ page }) => {
  await page.keyboard.press('g');
  const dialog = page.getByRole('dialog', { name: 'Move selection to X,Y' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('textbox');
  await expect(input).toHaveValue(/^\d+, \d+$/);

  await input.fill('120, 180');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();

  const firstFrame = page.locator('.frame-container').first();
  await expect(firstFrame).toHaveAttribute('style', /left:\s*120px/);
  await expect(firstFrame).toHaveAttribute('style', /top:\s*180px/);

  await page.keyboard.press('Control+z');
  await expect(firstFrame).not.toHaveAttribute('style', /left:\s*120px/);
});

test('no-op z-order command does not consume the next undo', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const button = page.locator('.frame').first().locator('.element.is-button').first();
  await button.click();

  const before = await button.boundingBox();
  if (!before) throw new Error('Button did not render');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await button.boundingBox())?.x ?? before.x).toBeGreaterThan(before.x);

  await page.keyboard.press('Control+Shift+]');
  await page.keyboard.press('Control+z');

  await expect.poll(async () => Math.round((await button.boundingBox())?.x ?? 0)).toBe(Math.round(before.x));
});

test('Tab cycles the primary item inside a multi-selection', async ({ page }) => {
  await marqueeHomeElements(page);
  await expect(page.locator('.frame').first().locator('.element.selected')).toHaveCount(3);

  await page.keyboard.press('Tab');
  const primary = page.locator('.frame').first().locator('.element.primary-selected');
  await expect(primary).toHaveCount(1);
  await expect(page.locator('.right-panel')).toContainText(/Primary:/);
  const firstBox = await primary.boundingBox();
  if (!firstBox) throw new Error('Primary selection did not render');
  const firstPosition = `${Math.round(firstBox.x)},${Math.round(firstBox.y)}`;

  await page.keyboard.press('Tab');
  await expect.poll(async () => {
    const box = await primary.boundingBox();
    return box ? `${Math.round(box.x)},${Math.round(box.y)}` : '';
  }).not.toBe(firstPosition);

  await page.keyboard.press('Shift+Tab');
  await expect.poll(async () => {
    const box = await primary.boundingBox();
    return box ? `${Math.round(box.x)},${Math.round(box.y)}` : '';
  }).toBe(firstPosition);
});

test('rich text toolbar formats a selected text range on the canvas', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const text = page.locator('.frame').first().locator('.element.is-text').first();
  await text.click();
  const content = page.locator('.right-panel .content-input');
  await expect(content).toBeVisible();
  await content.evaluate((textarea: HTMLTextAreaElement) => {
    textarea.focus();
    textarea.setSelectionRange(0, 6);
  });
  await page.getByRole('button', { name: 'Bold selected text' }).click();

  const firstRun = text.locator('.el-content span').first();
  await expect(firstRun).toContainText('Launch');
  await expect(firstRun).toHaveCSS('font-weight', '700');
});

test('pasting a URL onto selected text makes it an inline link', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const text = page.locator('.frame').first().locator('.element.is-text').first();
  await text.click();
  const content = page.locator('.right-panel .content-input');
  await content.evaluate((textarea: HTMLTextAreaElement) => {
    textarea.focus();
    textarea.setSelectionRange(0, 6);
  });
  await content.evaluate((textarea: HTMLTextAreaElement) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'https://example.test/read');
    textarea.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }));
  });

  const linkedRun = text.locator('.inline-link').first();
  await expect(linkedRun).toContainText('Launch');
  await expect(linkedRun).toHaveCSS('text-decoration-line', 'underline');
  await expect(page.getByRole('textbox', { name: 'Inline link URL' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Link selected text to page' })).toHaveCount(0);
  await expect(content).toHaveValue(/Launch something strange and beautiful\./);
});

test('auto-resize text shrinks a headline to its narrowed box', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const text = page.locator('.frame').first().locator('.element.is-text').first();
  await text.click();

  const transformInputs = page.locator('.right-panel .prop-grid-4').first().locator('input');
  await transformInputs.nth(2).fill('180');
  await transformInputs.nth(2).press('Tab');
  await expect(text).toHaveCSS('font-size', '64px');

  await page.getByRole('checkbox', { name: 'Auto-resize to fit width' }).check();
  await expect.poll(async () => parseFloat(await text.evaluate(element => getComputedStyle(element).fontSize))).toBeLessThan(64);
});

test('text overflow picker applies ellipsis to canvas text', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const text = page.locator('.frame').first().locator('.element.is-text').first();
  await text.click();
  await page.getByRole('combobox', { name: 'Text overflow behavior' }).selectOption('ellipsis');

  await expect(text).toHaveCSS('overflow', 'hidden');
  await expect(text.locator('.el-content')).toHaveCSS('text-overflow', 'ellipsis');
  await expect(text.locator('.el-content')).toHaveCSS('white-space', 'nowrap');
});

test('wrapped text stays visible and exposes Figma-like hug resizing controls', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const text = page.locator('.frame').first().locator('.element.is-text').first();
  await text.click();

  await page.getByRole('textbox', { name: 'Element width' }).fill('260');
  await page.getByRole('textbox', { name: 'Element width' }).press('Tab');
  await page.getByRole('textbox', { name: 'Element height' }).fill('42');
  await page.getByRole('textbox', { name: 'Element height' }).press('Tab');

  await expect(text).toHaveCSS('overflow', 'visible');
  await expect(text.locator('.el-content')).toHaveCSS('overflow', 'visible');
  await expect(page.getByRole('button', { name: 'Set text hug height' })).toBeVisible();

  await page.getByRole('button', { name: 'Set text hug height' }).click();
  await expect(page.getByRole('button', { name: 'Set text hug height' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Text box sizing' })).toHaveValue('auto-height');
  await expect.poll(async () => parseFloat(await text.evaluate(element => getComputedStyle(element).height))).toBeGreaterThan(42);
});

test('inline editing wrapped text keeps the editor overlay unscrolled and unclipped', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const text = page.locator('.frame').first().locator('.element.is-text').first();
  await text.click();

  await page.getByRole('textbox', { name: 'Element width' }).fill('260');
  await page.getByRole('textbox', { name: 'Element width' }).press('Tab');
  await page.getByRole('textbox', { name: 'Element height' }).fill('42');
  await page.getByRole('textbox', { name: 'Element height' }).press('Tab');

  const box = await text.boundingBox();
  if (!box) throw new Error('Text layer did not render');
  await page.mouse.dblclick(box.x + 5, box.y + 5);
  const editor = page.locator('.inline-edit-textarea');
  await expect(editor).toBeVisible();

  const metrics = await editor.evaluate((textarea: HTMLTextAreaElement) => ({
    scrollTop: textarea.scrollTop,
    clientHeight: textarea.clientHeight,
    scrollHeight: textarea.scrollHeight,
    height: parseFloat(getComputedStyle(textarea).height),
  }));
  expect(metrics.scrollTop).toBe(0);
  expect(metrics.clientHeight).toBeGreaterThanOrEqual(metrics.scrollHeight - 1);
  expect(metrics.height).toBeGreaterThan(42);

  await editor.fill('Edited headline');
  await editor.press('Control+Enter');
  await expect(editor).toHaveCount(0);
  await expect(text).toContainText('Edited headline');
});

test('tablet breakpoint variant starts linked and keeps text content synced', async ({ page }) => {
  await page.getByRole('button', { name: /\+ Tablet/ }).click();
  const frames = page.locator('.frame');
  await expect(frames).toHaveCount(4);
  const tablet = frames.last();
  await expect(tablet.locator('.element.is-text').first()).toContainText('Launch something strange');
  await expect(page.locator('.right-panel')).toContainText('tablet layout for:');

  await clearInitialFrameSelection(page);
  await frames.first().locator('.element.is-text').first().click();
  await page.locator('.right-panel .content-input').fill('Responsive shared headline');
  await expect(frames.first().locator('.element.is-text').first()).toContainText('Responsive shared headline');
  await expect(tablet.locator('.element.is-text').first()).toContainText('Responsive shared headline');
});

test('breakpoint mask edits respect variant overrides', async ({ page }) => {
  await page.getByRole('button', { name: /\+ Tablet/ }).click();
  const frames = page.locator('.frame');
  await expect(frames).toHaveCount(4);
  const baseText = frames.first().locator('.element.is-text').first();
  const tabletText = frames.last().locator('.element.is-text').first();

  await baseText.click();
  const baseBox = await baseText.boundingBox();
  if (!baseBox) throw new Error('Base text did not render');
  await page.mouse.click(baseBox.x + baseBox.width / 2, baseBox.y + baseBox.height / 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Create alpha mask' }).click();

  await expect(baseText).toHaveClass(/masked/);
  await expect(tabletText).toHaveClass(/masked/);

  await tabletText.click();
  const tabletBox = await tabletText.boundingBox();
  if (!tabletBox) throw new Error('Tablet text did not render');
  await page.mouse.click(tabletBox.x + tabletBox.width / 2, tabletBox.y + tabletBox.height / 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove mask' }).click();

  await expect(tabletText).not.toHaveClass(/masked/);
  await expect(baseText).toHaveClass(/masked/);
});

test('breakpoint base edits propagate typography effects and bulk styles', async ({ page }) => {
  await page.getByRole('button', { name: /\+ Tablet/ }).click();
  const frames = page.locator('.frame');
  await expect(frames).toHaveCount(4);
  const baseFrame = frames.first();
  const tabletFrame = frames.last();
  const baseText = baseFrame.locator('.element.is-text').first();
  const tabletText = tabletFrame.locator('.element.is-text').first();

  await baseText.click();
  await page.getByRole('combobox', { name: 'Text case' }).selectOption('uppercase');
  await page.getByRole('combobox', { name: 'Text overflow behavior' }).selectOption('ellipsis');
  await page.getByLabel('Enable Drop shadow').check();

  await expect(tabletText).toHaveCSS('text-transform', 'uppercase');
  await expect(tabletText).toHaveCSS('overflow', 'hidden');
  await expect(tabletText.locator('.el-content')).toHaveCSS('text-overflow', 'ellipsis');
  await expect.poll(() => tabletText.evaluate(element => getComputedStyle(element as HTMLElement).boxShadow)).not.toBe('none');

  await marqueeHomeElements(page);
  const selected = baseFrame.locator('.element.selected');
  await expect(selected).toHaveCount(3);
  await page.locator('.right-panel').getByLabel('Bulk fill color').fill('#123456');

  await expect.poll(async () => selected.evaluateAll(elements =>
    elements.map(element => getComputedStyle(element as HTMLElement).backgroundColor)
  )).toEqual(['rgb(18, 52, 86)', 'rgb(18, 52, 86)', 'rgb(18, 52, 86)']);
  await expect.poll(async () => tabletFrame.locator('.element').evaluateAll(elements =>
    elements.filter(element => getComputedStyle(element as HTMLElement).backgroundColor === 'rgb(18, 52, 86)').length
  )).toBeGreaterThanOrEqual(3);
});

test('frame background image controls update the canvas page preview', async ({ page }) => {
  const frame = page.locator('.canvas-world .frame').first();
  await page.getByRole('textbox', { name: 'Frame background image URL' }).fill('https://example.test/hero.jpg');
  await page.getByRole('combobox', { name: 'Frame background image fit' }).selectOption('contain');
  await page.getByRole('combobox', { name: 'Frame background image repeat' }).selectOption('repeat-x');
  await page.getByRole('combobox', { name: 'Frame background image position' }).selectOption('top');

  await expect.poll(() => frame.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('hero.jpg');
  await expect.poll(() => frame.locator('.element').evaluateAll(elements =>
    elements.some(element => getComputedStyle(element).backgroundImage.includes('hero.jpg'))
  )).toBe(true);
  await expect(frame).toHaveCSS('background-size', 'contain');
  await expect(frame).toHaveCSS('background-repeat', 'repeat-x');
  await expect(frame).toHaveCSS('background-position', '50% 0%');
});

test('Alt-hover shows four parent spacing measurements without changing selection', async ({ page }) => {
  const text = page.locator('.frame').first().locator('.element.is-text').first();
  const selectionBefore = await page.locator('.element.selected').count();
  await page.keyboard.down('Alt');
  await text.hover();

  const overlay = page.locator('.spacing-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.spacing-line')).toHaveCount(4);
  for (const side of ['left', 'right', 'top', 'bottom']) {
    await expect(overlay.locator(`[data-side="${side}"] .spacing-value`)).not.toHaveText('');
  }
  await expect(page.locator('.element.selected')).toHaveCount(selectionBefore);

  await page.keyboard.up('Alt');
  await expect(overlay).toBeHidden();
});

test('Alt-drag draws a temporary pixel ruler without editing document layers', async ({ page }) => {
  const title = page.locator('.frame').first().locator('.element.is-text').first();
  const initialPosition = await title.evaluate(element => {
    const style = getComputedStyle(element);
    return { left: style.left, top: style.top };
  });
  const frame = await page.locator('.frame').first().boundingBox();
  if (!frame) throw new Error('Home frame did not render');

  await page.keyboard.down('Alt');
  await page.mouse.move(frame.x + 80, frame.y + 80);
  await page.mouse.down();
  await page.mouse.move(frame.x + 200, frame.y + 140, { steps: 4 });

  await expect(page.locator('.measure-ruler')).toBeVisible();
  const metrics = await page.locator('.measure-ruler line').evaluate(line => {
    const x1 = Number(line.getAttribute('x1'));
    const y1 = Number(line.getAttribute('y1'));
    const x2 = Number(line.getAttribute('x2'));
    const y2 = Number(line.getAttribute('y2'));
    const dx = Math.round(x2 - x1);
    const dy = Math.round(y2 - y1);
    return { dx, dy, distance: Math.round(Math.hypot(x2 - x1, y2 - y1)) };
  });
  await expect(page.locator('.measure-readout')).toContainText(`${metrics.distance}px`);
  await expect(page.locator('.measure-readout')).toContainText(`ΔX ${metrics.dx}`);
  await expect(page.locator('.measure-readout')).toContainText(`ΔY ${metrics.dy}`);

  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect(page.locator('.measure-ruler')).toBeHidden();
  const finalPosition = await title.evaluate(element => {
    const style = getComputedStyle(element);
    return { left: style.left, top: style.top };
  });
  expect(finalPosition).toEqual(initialPosition);
});

test('rulers create removable frame guides with Alt distance labels', async ({ page }) => {
  await page.getByTitle('Show rulers + grid overlay').click();
  const frame = page.locator('.frame').first();
  const frameBox = await frame.boundingBox();
  const leftRuler = await page.getByRole('button', { name: 'Drag from left ruler to create vertical guide' }).boundingBox();
  const topRuler = await page.getByRole('button', { name: 'Drag from top ruler to create horizontal guide' }).boundingBox();
  if (!frameBox || !leftRuler || !topRuler) throw new Error('Rulers or frame did not render');

  await page.mouse.move(leftRuler.x + leftRuler.width / 2, frameBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + 24, frameBox.y + 120, { steps: 4 });
  await page.mouse.up();

  await page.mouse.move(frameBox.x + 160, topRuler.y + topRuler.height / 2);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + 160, frameBox.y + 42, { steps: 4 });
  await page.mouse.up();

  await page.mouse.move(leftRuler.x + leftRuler.width / 2, frameBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(frameBox.x - 28, frameBox.y + 120, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByRole('button', { name: /Remove Frame vertical guide/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove Frame horizontal guide/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Remove Canvas vertical guide/ })).toBeVisible();
  await expect(page.locator('.project-guide-layer .project-guide')).toHaveCount(3);

  await page.keyboard.down('Alt');
  await expect(page.locator('.guide-distance')).not.toHaveCount(0);
  await expect(page.locator('.guide-distance').first()).toContainText(/px/);
  await page.keyboard.up('Alt');

  await page.getByRole('button', { name: /Remove Frame vertical guide/ }).click();
  await expect(page.locator('.project-guide-layer .project-guide')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove all guides' }).click();
  await expect(page.locator('.project-guide-layer .project-guide')).toHaveCount(0);
});

test('layout guides inspector renders uniform columns and rows on canvas', async ({ page }) => {
  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().click();
  const panel = page.locator('.right-panel');

  await panel.getByRole('button', { name: 'Add frame layout guide' }).click();
  await expect(panel.getByLabel('Enable uniform layout grid')).toBeChecked();
  await panel.getByLabel('Enable uniform layout grid').check();
  await panel.getByLabel('Uniform grid size').fill('40');
  await panel.getByLabel('Uniform grid variable').fill('spacing/40');
  await panel.getByLabel('Enable column guides').check();
  await panel.getByLabel('Column guide count').fill('4');
  await panel.getByLabel('Column guide margin').fill('32');
  await panel.getByLabel('Column guide gutter').fill('12');
  await panel.getByLabel('Column guide variable').fill('grid/desktop');
  await panel.getByLabel('Enable row guides').check();
  await panel.getByLabel('Row guide count').fill('3');
  await panel.getByLabel('Row guide margin').fill('24');
  await panel.getByLabel('Row guide gutter').fill('10');

  await expect(page.locator('.frame-layout-guide-layer .frame-layout-guide')).not.toHaveCount(0);
  await expect(panel.getByLabel('Uniform grid variable')).toHaveValue('spacing/40');
  await expect(panel.getByLabel('Column guide variable')).toHaveValue('grid/desktop');
});

test('frame auto layout flows content but keeps the page background absolute', async ({ page }) => {
  const frame = page.locator('.canvas-world .frame').first();
  const background = frame.locator('.element').first();
  const title = frame.locator('.element.is-text').first();

  await page.getByRole('button', { name: 'Frame auto layout horizontal' }).click();
  await page.getByRole('combobox', { name: 'Frame auto layout direction' }).selectOption('column');
  await page.getByRole('spinbutton', { name: 'Frame auto layout gap' }).fill('18');

  await expect(frame).toHaveCSS('display', 'flex');
  await expect(frame).toHaveCSS('flex-direction', 'column');
  await expect(frame).toHaveCSS('gap', '18px');
  await expect(background).toHaveCSS('position', 'absolute');
  await expect(title).toHaveCSS('position', 'relative');
});

test('linked frame auto layout padding edits all four sides', async ({ page }) => {
  const frame = page.locator('.frame').first();
  await page.getByRole('button', { name: 'Frame auto layout horizontal' }).click();

  await page.getByRole('button', { name: 'Link frame auto layout padding values' }).click();
  await expect(page.getByRole('button', { name: 'Unlink frame auto layout padding values' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('spinbutton', { name: 'Frame auto layout padding top' }).fill('24');
  await expect(page.getByRole('spinbutton', { name: 'Frame auto layout padding top' })).toHaveValue('24');
  await expect(page.getByRole('spinbutton', { name: 'Frame auto layout padding right' })).toHaveValue('24');
  await expect(page.getByRole('spinbutton', { name: 'Frame auto layout padding bottom' })).toHaveValue('24');
  await expect(page.getByRole('spinbutton', { name: 'Frame auto layout padding left' })).toHaveValue('24');
  await expect(frame).toHaveCSS('padding-top', '24px');
  await expect(frame).toHaveCSS('padding-right', '24px');
  await expect(frame).toHaveCSS('padding-bottom', '24px');
  await expect(frame).toHaveCSS('padding-left', '24px');

  await page.getByRole('button', { name: 'Unlink frame auto layout padding values' }).click();
  await page.getByRole('spinbutton', { name: 'Frame auto layout padding left' }).fill('12');
  await expect(page.getByRole('spinbutton', { name: 'Frame auto layout padding top' })).toHaveValue('24');
  await expect(page.getByRole('spinbutton', { name: 'Frame auto layout padding left' })).toHaveValue('12');
});

test('on-canvas auto layout spacing handles update frame containers', async ({ page }) => {
  async function dragHandle(name: string, dx: number, dy: number): Promise<void> {
    const handle = page.getByRole('button', { name, exact: true }).first();
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    if (!box) throw new Error(`Handle "${name}" did not render`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 });
    await page.mouse.up();
  }

  const frame = page.locator('.frame').first();
  await page.getByRole('button', { name: 'Frame auto layout horizontal' }).click();
  await dragHandle('Drag frame auto layout gap', 40, 0);
  await expect.poll(() => page.getByRole('spinbutton', { name: 'Frame auto layout gap' }).inputValue()).not.toBe('8');
  await expect.poll(() => frame.evaluate(el => parseFloat(getComputedStyle(el).gap))).toBeGreaterThan(8);

  await dragHandle('Drag frame auto layout padding l', 32, 0);
  await expect.poll(() => page.getByRole('spinbutton', { name: 'Frame auto layout padding left' }).inputValue()).not.toBe('8');
  await expect.poll(() => frame.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThan(8);
});

test('on-canvas auto layout spacing handles update rectangle containers', async ({ page }) => {
  async function dragHandle(name: string, dx: number, dy: number): Promise<void> {
    const handle = page.getByRole('button', { name, exact: true }).first();
    await expect(handle).toBeVisible();
    const box = await handle.boundingBox();
    if (!box) throw new Error(`Handle "${name}" did not render`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 4 });
    await page.mouse.up();
  }

  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error('Home frame did not render');
  await page.getByRole('button', { name: 'Rectangle tool' }).click();
  await page.mouse.move(frameBox.x + 120, frameBox.y + 110);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + 340, frameBox.y + 200, { steps: 4 });
  await page.mouse.up();

  const section = frame.locator('.element.selected').first();
  await expect(section).toBeVisible();
  await page.getByRole('checkbox', { name: 'Enable element flex layout' }).check();
  await expect(section).toHaveCSS('display', 'flex');

  await dragHandle('Drag element auto layout gap', 36, 0);
  await expect.poll(() => section.evaluate(el => parseFloat(getComputedStyle(el).gap))).toBeGreaterThan(8);

  await dragHandle('Drag element auto layout padding l', 28, 0);
  await expect.poll(() => section.evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThan(8);
});

test('shift-a creates auto layout and inspector exposes grid plus sizing controls', async ({ page }) => {
  await marqueeHomeElements(page);
  await page.keyboard.press('Shift+A');

  const group = page.locator('.frame').first().locator('.element.is-group.selected');
  await expect(group).toBeVisible();
  await expect.poll(() => group.evaluate(element => getComputedStyle(element as HTMLElement).display)).toBe('flex');

  const panel = page.locator('.right-panel');
  await expect(panel.getByRole('combobox', { name: 'Element auto layout mode' })).toBeVisible();
  await panel.getByRole('combobox', { name: 'Element auto layout mode' }).selectOption('grid');
  await panel.getByLabel('Element auto layout grid columns').fill('3');
  await panel.getByLabel('Element auto layout grid rows').fill('2');
  await panel.getByLabel('Element auto layout column gap').fill('14');
  await panel.getByLabel('Element auto layout row gap').fill('9');
  await expect.poll(() => group.evaluate(element => getComputedStyle(element as HTMLElement).display)).toBe('grid');
  await expect.poll(() => group.evaluate(element => getComputedStyle(element as HTMLElement).columnGap)).toBe('14px');
  await expect.poll(() => group.evaluate(element => getComputedStyle(element as HTMLElement).rowGap)).toBe('9px');

  await panel.getByRole('combobox', { name: 'Horizontal layout sizing' }).selectOption('fill');
  await panel.getByRole('combobox', { name: 'Vertical layout sizing' }).selectOption('hug');
  await panel.getByLabel('Layout min width').fill('120');
  await panel.getByLabel('Ignore auto layout').check();
  await expect(panel.getByRole('combobox', { name: 'Horizontal layout sizing' })).toHaveValue('fill');
  await expect(panel.getByRole('combobox', { name: 'Vertical layout sizing' })).toHaveValue('hug');
  await expect(panel.getByLabel('Ignore auto layout')).toBeChecked();
});

test('inspector sections collapse accessibly and persist after reload', async ({ page }) => {
  const collapse = page.getByRole('button', { name: 'Collapse Background', exact: true });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await collapse.click();

  await expect(page.getByRole('button', { name: 'Expand Background', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('textbox', { name: 'Frame fill opacity' })).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand Background', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('textbox', { name: 'Frame fill opacity' })).toBeHidden();
});

test('design inspector shell hides release-blocked placeholder chrome and prototype states', async ({ page }) => {
  await clearInitialFrameSelection(page);
  await expect(page.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Prototype' })).toHaveCount(0);
  await expect(page.locator('.right-panel')).toContainText('No selection');
  await expect(page.locator('.right-panel')).toContainText('Local resources');
  await expect(page.locator('.right-panel')).toContainText('Export');
  await expect(page.locator('.right-panel .inspector-figma-topbar')).toHaveCount(0);
  await expect(page.getByLabel('Profile placeholder')).toHaveCount(0);
  await expect(page.getByLabel('Share placeholder')).toHaveCount(0);
  await expect(page.getByLabel('Zoom placeholder')).toHaveCount(0);

  const noSelectionShellOrder = await page.locator('.right-panel').evaluate(panel => {
    const tabs = panel.querySelector('.inspector-tabs-line') as HTMLElement | null;
    const empty = panel.querySelector('.empty-inspector') as HTMLElement | null;
    if (!tabs || !empty) throw new Error('Inspector no-selection shell did not render');
    return {
      tabsTop: tabs.getBoundingClientRect().top,
      emptyTop: empty.getBoundingClientRect().top,
    };
  });
  expect(noSelectionShellOrder.tabsTop).toBeLessThan(noSelectionShellOrder.emptyTop);

  const frame = page.locator('.frame').first();
  await frame.click();
  const inspector = page.locator('.right-panel');
  await expect(inspector).toContainText('frame');
  await expect(inspector.getByRole('button', { name: 'Use luminance mask' })).toHaveCount(0);

  await frame.locator('.element.is-button').first().click();
  await expect(inspector).toContainText('Selection utilities');
  await expect(inspector.getByRole('button', { name: 'Use luminance mask' })).toBeVisible();
});

test('prototype inspector chunk is not reachable in the release UI', async ({ page }) => {
  await page.route('**/src/lib/inspector/PrototypeInspector.svelte**', route => route.abort());
  await expect(page.getByRole('tab', { name: 'Prototype' })).toHaveCount(0);
  await expect(page.locator('.right-panel').getByRole('alert')).toHaveCount(0);
});

test('inspector export dock stays at the scroll end and exposes local file copy info', async ({ page }) => {
  const dock = page.getByRole('region', { name: 'Inspector export' });
  const exportLayout = await dock.evaluate(node => {
    const element = node as HTMLElement;
    const panel = element.closest('.right-panel') as HTMLElement;
    const scroller = element.closest('.inspector-body, .empty-inspector') as HTMLElement | null;
    const dockRect = element.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      startsBelowViewport: dockRect.top > panelRect.bottom,
      scrollable: scroller ? scroller.scrollHeight > scroller.clientHeight : false,
    };
  });
  expect(exportLayout.position).toBe('static');
  expect(exportLayout.scrollable).toBe(true);
  expect(exportLayout.startsBelowViewport).toBe(true);

  await page.locator('.right-panel .inspector-body').evaluate(node => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(dock).toBeVisible();
  await expect(dock).toContainText('Home');
  await expect(dock).toContainText('index.html');

  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  await page.locator('.right-panel .inspector-body').evaluate(node => {
    node.scrollTop = node.scrollHeight;
  });
  await expect(dock).toContainText('layer');
  await dock.getByRole('button', { name: 'Copy inspector export local file info' }).click();
  await expect(page.locator('.save-status:not(.cloud-pill)')).toContainText('Export info copied');
});

test('inspector property search fuzzy-filters matching control groups', async ({ page }) => {
  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  const search = page.locator('.right-panel .property-search input');
  await search.evaluate((node: HTMLInputElement) => {
    node.value = 'shadow';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await expect(page.getByRole('button', { name: /Collapse Effects|Expand Effects/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Collapse Transform|Expand Transform/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /Collapse Border|Expand Border/ })).toBeHidden();

  await search.evaluate((node: HTMLInputElement) => {
    node.value = '';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.getByRole('button', { name: /Collapse Transform|Expand Transform/ })).toBeVisible();
});

test('inspector property labels show delayed docs tooltip with spec link', async ({ page }) => {
  await page.getByRole('button', { name: 'Frame auto layout horizontal' }).click();
  await page.locator('.right-panel .prop-field > span').filter({ hasText: /^Gap$/ }).first().hover();

  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toContainText('Controls spacing between Auto Layout children.');
  await expect(tooltip.getByRole('link', { name: 'CSS gap reference' })).toHaveAttribute('href', 'https://developer.mozilla.org/docs/Web/CSS/gap');
});

test('right panel keeps long labels values and urls contained', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  const rightPanel = page.locator('.right-panel');
  await expect(rightPanel).toBeVisible();
  const longName = [
    'Extremely long inspector value',
    'with-unbroken-token-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'and nested handoff variable style path',
  ].join(' / ');
  const longUrl = `https://assets.example.test/${'deeply-nested-segment/'.repeat(8)}${'asset'.repeat(12)}.png?cache=${'abcdef0123456789'.repeat(8)}`;
  const longTracks = `repeat(24,minmax(0,${'super-long-token'.repeat(10)}fr))`;

  await rightPanel.getByRole('textbox', { name: 'OG title (social previews)', exact: true }).fill(longName);
  await rightPanel.getByRole('textbox', { name: 'OG image URL', exact: true }).fill(longUrl);
  await rightPanel.getByRole('textbox', { name: 'Keywords (comma-separated)', exact: true }).fill(`${longName},${longName}`);
  await rightPanel.getByRole('button', { name: 'Frame auto layout horizontal' }).click();
  await rightPanel.getByRole('combobox', { name: 'Frame auto layout mode' }).selectOption('grid');
  await rightPanel.getByRole('textbox', { name: 'Frame auto layout column tracks' }).fill(longTracks);
  await rightPanel.getByRole('textbox', { name: 'Frame auto layout row tracks' }).fill(longTracks);
  await rightPanel.getByRole('textbox', { name: 'Frame background image URL' }).fill(longUrl);

  const frameMetrics = await collectRightPanelLayoutMetrics(page);
  expect(frameMetrics.documentScrollWidth).toBe(frameMetrics.documentClientWidth);
  expect(frameMetrics.panelScrollWidth, JSON.stringify(frameMetrics, null, 2)).toBeLessThanOrEqual(frameMetrics.panelClientWidth + 1);
  expect(frameMetrics.outsidePanel).toEqual([]);
  expect(frameMetrics.urlInputStyles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ariaLabel: 'Frame background image URL', minWidth: '0px', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
    ]),
  );
  expect(frameMetrics.unboundedLabels).toEqual([]);

  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  await rightPanel.getByRole('textbox', { name: 'Layer name', exact: true }).fill(longName);
  await rightPanel.locator('.content-input').fill(`${longName}\n${longName}`);

  const elementMetrics = await collectRightPanelLayoutMetrics(page);
  expect(elementMetrics.documentScrollWidth).toBe(elementMetrics.documentClientWidth);
  expect(elementMetrics.panelScrollWidth, JSON.stringify(elementMetrics, null, 2)).toBeLessThanOrEqual(elementMetrics.panelClientWidth + 1);
  expect(elementMetrics.outsidePanel).toEqual([]);
  expect(elementMetrics.urlInputStyles).toEqual([]);
  expect(elementMetrics.unboundedLabels).toEqual([]);
});

test('text style presets apply and save typography settings', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const title = page.locator('.frame').first().locator('.element.is-text').first();
  await title.click();

  const presetSelect = page.getByRole('combobox', { name: 'Text style preset' });
  await presetSelect.selectOption('heading2');
  await expect(title).toHaveCSS('font-size', '36px');
  await expect(page.getByRole('spinbutton', { name: 'Size' })).toHaveValue('36');

  await page.getByRole('spinbutton', { name: 'Size' }).fill('28');
  await page.getByRole('combobox', { name: 'Typography mode' }).selectOption('details');
  await page.getByRole('combobox', { name: 'Font source' }).selectOption('variable');
  await page.getByRole('combobox', { name: 'Text alignment' }).selectOption('right');
  await page.getByRole('combobox', { name: 'Text vertical alignment' }).selectOption('bottom');
  await page.getByRole('combobox', { name: 'Text case' }).selectOption('small-caps');
  await page.getByRole('combobox', { name: 'Text trim' }).selectOption('cap-height');
  await page.getByLabel('Max text lines').fill('2');
  await page.getByLabel('Paragraph indent').fill('18');
  await page.getByLabel('Paragraph spacing').fill('12');
  await page.getByLabel('Hanging punctuation').check();
  await page.getByLabel('OpenType settings').fill("'liga' 1, 'ss01' 1");
  await expect.poll(() => title.evaluate(el => getComputedStyle(el).textAlign)).toBe('right');
  await expect.poll(() => title.evaluate(el => getComputedStyle(el).fontVariantCaps)).toBe('small-caps');
  await expect(page.getByRole('combobox', { name: 'Typography mode' })).toHaveValue('details');
  await expect(page.getByLabel('Max text lines')).toHaveValue('2');
  await page.getByRole('button', { name: 'Save current text style preset' }).click();

  await presetSelect.selectOption('body');
  await expect(title).toHaveCSS('font-size', '16px');

  await presetSelect.selectOption('heading2');
  await expect(title).toHaveCSS('font-size', '28px');
});

test('Cmd+Alt+K saves the selection as a local component master', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const title = page.locator('.frame').first().locator('.element.is-text').first();
  await title.click();

  await page.keyboard.press('Control+Alt+K');
  await expect(page.locator('.save-status:not(.cloud-pill)')).toContainText(/Component saved:/);

  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('frontendeasy_v1');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const projects = await new Promise<Array<{ payload?: { componentMasters?: Array<{ name: string; root: { x: number; y: number; type: string } }> } }>>((resolve, reject) => {
        const tx = db.transaction('projects', 'readonly');
        const request = tx.objectStore('projects').getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const masters = projects[0]?.payload?.componentMasters ?? [];
      return { count: masters.length, root: masters[0]?.root ?? null };
    } finally {
      db.close();
    }
  })).toMatchObject({
    count: 1,
    root: { x: 0, y: 0, type: 'text' },
  });
});

test('components panel supports search rename duplicate and delete states', async ({ page }) => {
  const components = page.getByRole('region', { name: 'Components' });
  await expect(components).toContainText('No components yet');
  await expect(components).toContainText('Variants live on component rows');
  await expect(components).toContainText('drag a component to canvas to create instance properties');

  await clearInitialFrameSelection(page);
  await page.locator('.frame').first().locator('.element.is-text').first().click();
  await page.keyboard.press('Control+Alt+K');
  await expect(components.getByRole('textbox', { name: /Rename component/ })).toHaveCount(1);
  await expect(components).toContainText('No variants');
  await expect(components).toContainText('0 props');

  const rename = components.getByRole('textbox', { name: /Rename component/ }).first();
  await rename.fill('Hero component');
  await rename.press('Enter');
  await expect(rename).toHaveValue('Hero component');

  await components.getByRole('button', { name: 'Duplicate component Hero component' }).click();
  await expect(components.getByRole('textbox', { name: /Rename component/ })).toHaveCount(2);

  await components.getByRole('searchbox', { name: 'Search components' }).fill('hero component 2');
  await expect(components.getByRole('textbox', { name: 'Rename component Hero component 2', exact: true })).toBeVisible();
  await expect(components.getByRole('textbox', { name: 'Rename component Hero component', exact: true })).toBeHidden();

  await components.getByRole('searchbox', { name: 'Search components' }).fill('');
  await components.getByRole('button', { name: 'Delete component Hero component 2' }).click();
  await components.getByRole('button', { name: 'Delete component Hero component' }).click();
  await expect(components).toContainText('No components yet');
});

test('component masters drag onto a frame as component instances', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const textLayers = frame.locator('.element.is-text');
  const initialTextCount = await textLayers.count();

  await textLayers.first().click();
  await page.keyboard.press('Control+Alt+K');

  const components = page.getByRole('region', { name: 'Components' });
  const rename = components.getByRole('textbox', { name: /Rename component/ }).first();
  await rename.fill('Hero component');
  await rename.press('Enter');

  const row = components.getByRole('listitem', { name: 'Component Hero component' });
  await row.dragTo(frame, { targetPosition: { x: 320, y: 240 } });

  await expect(frame.locator('.element.is-text')).toHaveCount(initialTextCount + 1);
  await expect(frame.locator('.element.is-text.selected')).toHaveCount(1);
  await expect(page.locator('.save-status:not(.cloud-pill)')).toContainText(/Instance created: Hero component/);
});

test('assets and libraries browser filters views and quick-inserts local components', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const textLayers = frame.locator('.element.is-text');
  const initialTextCount = await textLayers.count();

  await textLayers.first().click();
  await page.keyboard.press('Control+Alt+K');

  const components = page.getByRole('region', { name: 'Components' });
  const rename = components.getByRole('textbox', { name: /Rename component/ }).first();
  await rename.fill('Library Hero');
  await rename.press('Enter');

  await page.getByRole('button', { name: 'Assets tab' }).click();
  const libraries = page.getByRole('region', { name: 'Assets and libraries' });
  await expect(libraries.getByRole('searchbox', { name: 'Search libraries and assets' })).toBeVisible();
  await libraries.getByRole('searchbox', { name: 'Search libraries and assets' }).fill('library');
  await libraries.getByLabel('Library filter').selectOption('components');
  await libraries.getByRole('button', { name: 'Grid' }).click();
  await libraries.getByLabel('Group by path').check();
  await expect(libraries.getByRole('region', { name: 'Library group Local components' })).toBeVisible();

  await libraries.getByRole('button', { name: 'Insert component Library Hero' }).click();
  await expect(frame.locator('.element.is-text')).toHaveCount(initialTextCount + 1);
  await expect(page.locator('.save-status:not(.cloud-pill)')).toContainText(/Instance created: Library Hero/);

  await page.keyboard.press('Shift+I');
  await expect(frame.locator('.element.is-text')).toHaveCount(initialTextCount + 2);
  await expect(page.locator('.save-status:not(.cloud-pill)')).toContainText(/Instance created: Library Hero/);

  await expect(libraries.getByRole('listitem', { name: 'component Library Hero' })).toHaveAttribute('title', /replace selected instance/);
});

test('project styles and variables appear in libraries and apply to selection', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const title = frame.locator('.element.is-text').first();
  await title.click();

  await page.getByRole('button', { name: 'Create variable from selection' }).click();
  await page.getByRole('button', { name: 'Assets tab' }).click();

  const libraries = page.getByRole('region', { name: 'Assets and libraries' });
  await libraries.getByLabel('Library filter').selectOption('styles');
  await expect(libraries.getByRole('listitem', { name: 'style Brand orange' })).toBeVisible();
  await libraries.getByRole('button', { name: 'Apply style Brand orange' }).click();
  await expect(title).toHaveCSS('background-color', 'rgb(255, 107, 57)');

  await libraries.getByLabel('Library filter').selectOption('variables');
  await expect(libraries.getByRole('listitem', { name: /variable Selection colour/ })).toBeVisible();
  await expect(libraries).toContainText('color.selection');

  await libraries.getByRole('button', { name: 'Manage project styles and variables' }).click();
  const manager = page.getByRole('dialog', { name: 'Project styles and variables' });
  await expect(manager).toBeVisible();
  await expect(manager.getByLabel('Collection name Local variables')).toHaveValue('Local variables');

  const customVariable = manager.getByRole('listitem', { name: 'Variable Selection colour' });
  await customVariable.getByLabel('Variable path Selection colour').fill('color.selection.managed');
  await customVariable.getByLabel('Variable fallback Selection colour').fill('#112233');

  const brandStyle = manager.getByRole('listitem', { name: 'Project style Brand orange' });
  await brandStyle.getByLabel('Style name Brand orange').fill('Managed brand orange');
  await page.keyboard.press('Escape');
  await expect(manager).toBeHidden();

  await libraries.getByLabel('Library filter').selectOption('styles');
  await expect(libraries.getByRole('listitem', { name: 'style Managed brand orange' })).toBeVisible();
  await libraries.getByLabel('Library filter').selectOption('variables');
  await expect(libraries).toContainText('color.selection.managed');
});

test('component instances can switch between declared variants', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const textLayers = frame.locator('.element.is-text');

  await textLayers.first().click();
  await page.keyboard.press('Control+Alt+K');

  const components = page.getByRole('region', { name: 'Components' });
  const rename = components.getByRole('textbox', { name: /Rename component/ }).first();
  await rename.fill('Hero component');
  await rename.press('Enter');
  await components.getByRole('listitem', { name: 'Component Hero component' }).dragTo(frame, {
    targetPosition: { x: 320, y: 240 },
  });

  const selectedInstance = frame.locator('.element.is-text.selected');
  await expect(selectedInstance).toHaveCount(1);

  await components.getByRole('button', { name: 'Add hover variant to Hero component' }).click();
  await components.getByRole('button', { name: 'Add active variant to Hero component' }).click();
  await expect(components).toContainText('Hover');
  await expect(components).toContainText('Active');

  await page.getByRole('combobox', { name: 'Component variant' }).selectOption('active');
  await expect(selectedInstance).toHaveCSS('opacity', '0.82');
  await page.getByRole('combobox', { name: 'Component variant' }).selectOption('');
  await expect(selectedInstance).toHaveCSS('opacity', '1');
});

test('component instances expose text boolean swap and variant properties', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const textLayers = frame.locator('.element.is-text');

  await textLayers.first().click();
  await page.keyboard.press('Control+Alt+K');

  const components = page.getByRole('region', { name: 'Components' });
  const rename = components.getByRole('textbox', { name: /Rename component/ }).first();
  await rename.fill('Property component');
  await rename.press('Enter');
  await page.keyboard.press('Shift+I');

  const selectedInstance = frame.locator('.element.is-text.selected');
  await expect(selectedInstance).toHaveCount(1);
  const componentSummary = page.getByLabel('Component variant and property summary');
  await expect(componentSummary).toContainText('0 variants');
  await expect(componentSummary).toContainText('0 properties');
  await expect(page.getByText('Create properties here on an instance')).toBeVisible();

  await page.getByRole('button', { name: 'Create text component property' }).click();
  await page.getByRole('dialog', { name: 'Create component property' }).getByLabel('Property name').fill('Label');
  await page.getByRole('dialog', { name: 'Create component property' }).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(componentSummary).toContainText('1 properties');

  await page.getByRole('textbox', { name: 'Label text property' }).fill('Instance headline');
  await expect(selectedInstance).toContainText('Instance headline');

  await page.getByRole('button', { name: 'Create boolean component property' }).click();
  await page.getByRole('dialog', { name: 'Create component property' }).getByLabel('Property name').fill('Visible');
  await page.getByRole('dialog', { name: 'Create component property' }).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Visible boolean property' })).toBeChecked();

  await page.getByRole('button', { name: 'Create instance swap component property' }).click();
  await page.getByRole('dialog', { name: 'Create component property' }).getByLabel('Property name').fill('Swap');
  await page.getByRole('dialog', { name: 'Create component property' }).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Swap instance swap property' })).toBeVisible();

  await components.getByRole('button', { name: 'Add active variant to Property component' }).click();
  await expect(componentSummary).toContainText('1 variants');
  await page.getByRole('button', { name: 'Create variant component property' }).click();
  await page.getByRole('dialog', { name: 'Create component property' }).getByLabel('Property name').fill('State');
  await page.getByRole('dialog', { name: 'Create component property' }).getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('combobox', { name: 'State variant property' }).selectOption('active');
  await expect(selectedInstance).toHaveCSS('opacity', '0.82');
});

test('context menu saves a selection as a snippet and inserts a static copy', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const textLayers = frame.locator('.element.is-text');
  const initialTextCount = await textLayers.count();

  await textLayers.first().click();
  await expect(frame.locator('.element.is-text.selected')).toHaveCount(1);
  await frame.locator('.element.is-text.selected').click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Save as snippet' })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Save as snippet' }).click();

  const snippets = page.getByRole('region', { name: 'Snippets' });
  await expect(snippets.getByRole('textbox', { name: /Rename snippet/ })).toHaveCount(1);
  await expect(page.locator('.save-status:not(.cloud-pill)')).toContainText(/Snippet saved:/);

  const rename = snippets.getByRole('textbox', { name: /Rename snippet/ }).first();
  await rename.fill('Hero snippet');
  await rename.press('Enter');
  await snippets.getByRole('button', { name: 'Insert snippet Hero snippet' }).click();

  await expect(frame.locator('.element.is-text')).toHaveCount(initialTextCount + 1);
  await expect(frame.locator('.element.is-text.selected')).toHaveCount(1);
  await expect(page.locator('.save-status:not(.cloud-pill)')).toContainText(/Snippet inserted: Hero snippet/);
});

test('desktop image files drop onto frames and loose canvas through the media pipeline', async ({ page }) => {
  const frame = page.locator('.frame').first();
  const initialFrameImages = await frame.locator('.element.is-image').count();
  const initialOrphanImages = await page.locator('.orphan-element.is-image').count();

  async function dropPngAt(clientX: number, clientY: number, name: string): Promise<void> {
    await page.evaluate(({ clientX, clientY, name }) => {
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const file = new File([bytes], name, { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const canvas = document.querySelector('.canvas');
      if (!canvas) throw new Error('Canvas did not render');
      canvas.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        dataTransfer,
      }));
      canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        dataTransfer,
      }));
    }, { clientX, clientY, name });
  }

  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error('Home frame did not render');
  await dropPngAt(frameBox.x + 320, frameBox.y + 220, 'frame-drop.png');

  await expect(frame.locator('.element.is-image')).toHaveCount(initialFrameImages + 1);
  await expect(frame.locator('.element.is-image.selected')).toHaveCount(1);
  await expect.poll(() => frame.locator('.element.is-image.selected img').getAttribute('src')).toContain('data:image/png');

  const canvas = await page.locator('.canvas').boundingBox();
  if (!canvas) throw new Error('Canvas did not render');
  await dropPngAt(canvas.x + canvas.width - 72, canvas.y + canvas.height - 72, 'loose-drop.png');

  await expect(page.locator('.orphan-element.is-image')).toHaveCount(initialOrphanImages + 1);
  const looseImage = page.locator('.orphan-element.is-image.selected');
  await expect(looseImage).toHaveCount(1);
  const beforeNudge = await looseImage.boundingBox();
  if (!beforeNudge) throw new Error('Loose image did not render');

  await page.keyboard.press('ArrowRight');

  const afterNudge = await looseImage.boundingBox();
  if (!afterNudge) throw new Error('Loose image disappeared after keyboard nudge');
  expect(afterNudge.x).toBeGreaterThan(beforeNudge.x);
});

test('late image blob completion does not patch a deleted and undone placeholder', async ({ page }) => {
  await page.evaluate(() => {
    const NativeFileReader = window.FileReader;
    const pendingReads: Array<() => void> = [];
    class DelayedFileReader extends NativeFileReader {
      readAsDataURL(blob: Blob) {
        pendingReads.push(() => super.readAsDataURL(blob));
      }
    }
    Object.defineProperty(window, 'FileReader', { value: DelayedFileReader, configurable: true });
    Object.defineProperty(window, '__frontendeasyReleaseDelayedFileReads', {
      value: () => {
        pendingReads.splice(0).forEach(read => read());
      },
      configurable: true,
    });
  });

  const frame = page.locator('.frame').first();
  const initialFrameImages = await frame.locator('.element.is-image').count();
  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error('Home frame did not render');

  await page.evaluate(({ clientX, clientY }) => {
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const file = new File([bytes], 'late-frame-drop.png', { type: 'image/png' });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const canvas = document.querySelector('.canvas');
    if (!canvas) throw new Error('Canvas did not render');
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      dataTransfer,
    }));
  }, { clientX: frameBox.x + 340, clientY: frameBox.y + 240 });

  await expect(frame.locator('.element.is-image')).toHaveCount(initialFrameImages + 1);
  await page.keyboard.press('Delete');
  await expect(frame.locator('.element.is-image')).toHaveCount(initialFrameImages);
  await page.keyboard.press('Control+z');
  await expect(frame.locator('.element.is-image')).toHaveCount(initialFrameImages + 1);

  const restored = frame.locator('.element.is-image').last();
  await page.evaluate(() => {
    (window as typeof window & { __frontendeasyReleaseDelayedFileReads?: () => void }).__frontendeasyReleaseDelayedFileReads?.();
  });
  await expect(restored.locator('img')).toHaveCount(0);
  await expect(restored.locator('.image-placeholder')).toBeVisible();
});

test('image crop mode drags object position without destroying the source', async ({ page }) => {
  async function dropPngAt(clientX: number, clientY: number, name: string): Promise<void> {
    await page.evaluate(({ clientX, clientY, name }) => {
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const file = new File([bytes], name, { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const canvas = document.querySelector('.canvas');
      if (!canvas) throw new Error('Canvas did not render');
      canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        dataTransfer,
      }));
    }, { clientX, clientY, name });
  }

  const frame = page.locator('.canvas-world .frame').first();
  await expect(frame).toBeVisible();
  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error('Home frame did not render');
  await dropPngAt(frameBox.x + 320, frameBox.y + 220, 'crop-source.png');

  const selectedImage = frame.locator('.element.is-image.selected');
  await expect(selectedImage).toHaveCount(1);
  await expect(selectedImage.locator('img')).toHaveAttribute('src', /data:image\/png/);
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).objectPosition)).toBe('50% 50%');

  await page.getByRole('button', { name: 'Crop image' }).click();
  await expect(selectedImage).toHaveClass(/cropping/);
  await expect(selectedImage.locator('.crop-handle')).toHaveCount(4);
  await page.getByRole('button', { name: 'Image crop aspect 16:9' }).click();
  await page.getByRole('spinbutton', { name: 'Image internal scale' }).fill('1.4');
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).transform)).not.toBe('none');

  const box = await selectedImage.boundingBox();
  if (!box) throw new Error('Dropped image did not render');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 - 40, { steps: 4 });
  await page.mouse.up();

  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).objectPosition)).not.toBe('50% 50%');
  await page.getByRole('button', { name: 'Resize image media to fit' }).click();
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).objectFit)).toBe('contain');
  await page.getByRole('button', { name: 'Reset image crop' }).click();
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).objectPosition)).toBe('50% 50%');
  await expect(selectedImage.locator('img')).toHaveAttribute('src', /data:image\/png/);
});

test('media fill crop mode works from inspector and canvas controls', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error('Home frame did not render');

  await page.getByRole('button', { name: 'Choose shape' }).click();
  await page.getByRole('menuitem', { name: /Image\/video/ }).click();
  await page.mouse.move(frameBox.x + 240, frameBox.y + 190);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + 520, frameBox.y + 390, { steps: 4 });
  await page.mouse.up();

  const mediaShape = frame.locator('.element.selected').first();
  await expect(mediaShape).toBeVisible();
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  await page.getByPlaceholder('https://example.com/image.jpg').fill(dataUrl);
  await expect(mediaShape.locator('.media-fill-image')).toHaveAttribute('src', /data:image\/png/);

  await page.locator('.right-panel').getByRole('button', { name: 'Crop media fill', exact: true }).click();
  await expect(mediaShape).toHaveClass(/cropping/);
  await expect(mediaShape.locator('.crop-handle')).toHaveCount(4);
  await page.getByRole('button', { name: 'Media fill crop aspect 1:1' }).click();
  await page.getByRole('spinbutton', { name: 'Media fill internal x offset' }).fill('-10');
  await expect.poll(() => mediaShape.locator('.media-fill-image').evaluate(img => getComputedStyle(img).transform)).not.toBe('none');

  const box = await mediaShape.boundingBox();
  if (!box) throw new Error('Media fill shape did not render');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => mediaShape.locator('.media-fill-image').evaluate(img => getComputedStyle(img).objectPosition)).not.toBe('50% 50%');

  await page.getByRole('button', { name: 'Resize media fill to fit' }).click();
  await expect.poll(() => mediaShape.locator('.media-fill-image').evaluate(img => getComputedStyle(img).objectFit)).toBe('contain');
});

test('mask controls create layer indicators and context menu removal', async ({ page }) => {
  const frame = page.locator('.frame').first();
  await page.getByRole('treeitem', { name: /Launch something strange and beautiful/ }).click();
  const target = frame.locator('.element.is-text.selected').first();
  await expect(target).toHaveClass(/selected/);

  const initialBox = await target.boundingBox();
  if (!initialBox) throw new Error('Selected layer did not render');
  await page.mouse.click(initialBox.x + initialBox.width / 2, initialBox.y + initialBox.height / 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Create alpha mask' }).click();
  await expect(target).toHaveClass(/masked/);
  await expect(page.getByLabel('Alpha mask').first()).toBeVisible();

  const box = await target.boundingBox();
  if (!box) throw new Error('Masked layer did not render');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Create vector mask' }).click();
  await expect(page.getByLabel('Vector mask').first()).toBeVisible();

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove mask' }).click();
  await expect(target).not.toHaveClass(/masked/);
});

test('image filter controls update canvas CSS without destroying the source', async ({ page }) => {
  async function dropPngAt(clientX: number, clientY: number, name: string): Promise<void> {
    await page.evaluate(({ clientX, clientY, name }) => {
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
      const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
      const file = new File([bytes], name, { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const canvas = document.querySelector('.canvas');
      if (!canvas) throw new Error('Canvas did not render');
      canvas.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        dataTransfer,
      }));
    }, { clientX, clientY, name });
  }

  const frame = page.locator('.canvas-world .frame').first();
  await expect(frame).toBeVisible();
  const frameBox = await frame.boundingBox();
  if (!frameBox) throw new Error('Home frame did not render');
  await dropPngAt(frameBox.x + 360, frameBox.y + 240, 'filter-source.png');

  const selectedImage = frame.locator('.element.is-image.selected');
  await expect(selectedImage).toHaveCount(1);
  await expect(selectedImage.locator('img')).toHaveAttribute('src', /data:image\/png/);
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).filter)).toBe('none');

  await page.getByRole('spinbutton', { name: 'Image brightness value' }).fill('125');
  await page.getByRole('spinbutton', { name: 'Image contrast value' }).fill('90');
  await page.getByRole('spinbutton', { name: 'Image saturation value' }).fill('140');
  await page.getByRole('spinbutton', { name: 'Image blur value' }).fill('2.5');
  await page.getByRole('spinbutton', { name: 'Image hue value' }).fill('-30');

  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).filter)).toContain('brightness(1.25)');
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).filter)).toContain('contrast(0.9)');
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).filter)).toContain('saturate(1.4)');
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).filter)).toContain('blur(2.5px)');
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).filter)).toContain('hue-rotate(-30deg)');

  await page.getByRole('button', { name: 'Reset image filters' }).click();
  await expect.poll(() => selectedImage.locator('img').evaluate(img => getComputedStyle(img).filter)).toBe('none');
  await expect(selectedImage.locator('img')).toHaveAttribute('src', /data:image\/png/);
});

test('pasting SVG creates a sanitized inline SVG element', async ({ page }) => {
  await page.evaluate(() => {
    (window as typeof window & { __svgExecuted?: boolean }).__svgExecuted = false;
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', `
      <svg viewBox="0 0 32 32" onclick="window.__svgExecuted = true">
        <defs><linearGradient id="grad"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
        <style>@import url(https://evil.test/svg.css); path { fill: red; }</style>
        <filter id="f"><feImage href="https://evil.test/filter.png"/></filter>
        <image href="data:image/png;base64,aaa" width="32" height="32"/>
        <use href="#mark"/>
        <set attributeName="x" to="10"/>
        <script>window.__svgExecuted = true</script>
        <foreignObject><div>unsafe</div></foreignObject>
        <path id="mark" class="bad-class" style="fill:url(https://evil.test/style.svg)" d="M0 0H32V32H0Z" fill="url(#grad)" stroke="v b s c r i p t:msgbox(1)" onload="window.__svgExecuted = true"/>
      </svg>
    `);
    window.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer,
    }));
  });

  const selectedSvg = page.locator('.canvas-world .frame').first().locator('.element.is-svg.selected');
  await expect(selectedSvg).toHaveCount(1);
  await expect(selectedSvg.locator('svg')).toBeVisible();
  await expect(selectedSvg.locator('path')).toHaveAttribute('fill', /url\(#svg-.+-grad\)/);
  const renderedMarkup = await selectedSvg.locator('.svg-content').innerHTML();
  expect(renderedMarkup).not.toMatch(/script|foreignObject|onclick|onload|__svgExecuted|<style|@import|<filter|feImage|<image|<use|<set|class=|style=|evil\.test|vbscript/i);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __svgExecuted?: boolean }).__svgExecuted)).toBe(false);
});

test('asset usage panel lists uploaded asset references and highlights consumers', async ({ page }) => {
  const projectSeed = {
    id: 'asset-panel-project',
    title: 'Asset Panel Project',
    lastClientRev: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: Date.now(),
    ownerUserId: null,
    thumbnailAssetId: null,
    payload: {
      schemaVersion: 15,
      frames: [{
        id: 'home',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        background: '#fff',
        elements: [{
          id: 'hero-image',
          type: 'image',
          x: 40,
          y: 40,
          width: 160,
          height: 120,
          content: '',
          color: '#fff',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          imageAssetId: 'asset-hero',
          imageAssetPath: 'user/project/asset-hero.png',
          imageMime: 'image/png',
          imageSrc: '',
          objectFit: 'cover',
        }],
      }],
      orphanElements: [],
      componentMasters: [],
      snippets: [],
    },
  };
  await page.addInitScript((seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
  }, projectSeed);
  await page.evaluate(async (seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
    const storage = await (Function('return import("/src/storage.ts")')() as Promise<{ saveProjectAsync(project: typeof seed): Promise<boolean> }>);
    await storage.saveProjectAsync(seed);
  }, projectSeed);
  await page.reload();
  await expect(page.locator('.canvas-world .frame').first()).toBeVisible();
  await page.getByRole('button', { name: 'Assets tab' }).click();

  const assetRow = page.getByRole('listitem', { name: /Asset asset-hero\.png/ });
  await expect(assetRow).toBeVisible();
  await expect(assetRow).toContainText('1 ref');
  await assetRow.locator('.asset-main').click();

  await expect(page.locator('.canvas-world .frame .element.is-image.selected')).toHaveCount(1);
});

test('asset-backed previews leave loading state when asset URL is unavailable', async ({ page }) => {
  const projectSeed = {
    id: 'asset-loading-project',
    title: 'Asset Loading Project',
    lastClientRev: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: Date.now(),
    ownerUserId: null,
    thumbnailAssetId: null,
    payload: {
      schemaVersion: 15,
      frames: [{
        id: 'home',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        background: '#fff',
        elements: [{
          id: 'offline-image',
          type: 'image',
          x: 40,
          y: 40,
          width: 180,
          height: 126,
          content: '',
          color: '#fff',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          imageAssetId: 'missing-asset',
          imageAssetPath: 'user/project/missing-asset.png',
          imageMime: 'image/png',
          imageSrc: '',
          objectFit: 'cover',
        }],
      }],
      orphanElements: [],
      componentMasters: [],
      snippets: [],
    },
  };

  await page.addInitScript((seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
  }, projectSeed);
  await page.evaluate(async (seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
    const storage = await (Function('return import("/src/storage.ts")')() as Promise<{
      loadProjectAsync(): Promise<{ project: typeof seed }>;
      saveProjectAsync(project: typeof seed): Promise<boolean>;
    }>);
    const ok = await storage.saveProjectAsync(seed);
    const loaded = await storage.loadProjectAsync();
    return { ok, loadedProjectId: loaded.project.id };
  }, projectSeed).then(result => {
    expect(result).toEqual({ ok: true, loadedProjectId: 'asset-loading-project' });
  });
  await page.reload();
  await expect(page.locator('.canvas-world .frame').first()).toBeVisible();

  const image = page.locator('.frame .element.is-image').first();
  await expect(image.locator('.image-placeholder-label')).toContainText(/Asset unavailable|Asset failed/, { timeout: 5000 });
  await page.getByRole('treeitem', { name: /Image layer/ }).locator('.type-icon').click();
  await expect(image).toHaveClass(/selected/);

  const inspectorMessage = page.locator('.right-panel .img-empty').first();
  await expect(inspectorMessage).toContainText(/Asset unavailable offline|Could not load asset/);
  await expect(inspectorMessage).toHaveAttribute('role', 'alert');
});

test('appearance presets apply and persist saved element appearance', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const button = frame.locator('.element.is-button').first();
  await button.click();
  await expect(button).toHaveClass(/selected/);

  const panel = page.locator('.right-panel');
  const presetSelect = panel.getByRole('combobox', { name: 'Appearance preset' });
  const applyButton = panel.getByRole('button', { name: 'Apply appearance preset' });
  const saveButton = panel.getByRole('button', { name: 'Save current appearance preset' });

  await presetSelect.selectOption('cta');
  await applyButton.click();
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).borderRadius)).toBe('999px');
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).color)).toBe('rgb(20, 11, 8)');

  await panel.getByRole('combobox', { name: 'Opacity mode' }).selectOption('variable');
  await panel.getByRole('combobox', { name: 'Visibility mode' }).selectOption('variable');
  await panel.getByRole('combobox', { name: 'Blend mode' }).selectOption('multiply');
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).mixBlendMode)).toBe('multiply');
  await panel.getByRole('button', { name: 'Preview blend mode Screen' }).hover();
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).mixBlendMode)).toBe('screen');
  await panel.getByRole('button', { name: 'Preview blend mode Screen' }).click();
  await expect(panel.getByRole('combobox', { name: 'Blend mode' })).toHaveValue('screen');

  await panel.getByRole('combobox', { name: 'Fill type' }).selectOption('gradient');
  await panel.getByRole('combobox', { name: 'Gradient type' }).selectOption('angular');
  await panel.getByLabel('Gradient rotation').fill('45');
  await panel.getByRole('button', { name: 'Flip gradient horizontally' }).click();
  await panel.getByLabel('Gradient stop 1 variable').fill('colors/start');
  await panel.getByLabel('Gradient stop 2 variable').fill('colors/end');
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('conic-gradient');
  await expect(panel.getByRole('combobox', { name: 'Gradient type' })).toHaveValue('angular');
  await expect(panel.getByLabel('Gradient stop 1 variable')).toHaveValue('colors/start');

  await panel.getByRole('combobox', { name: 'Fill type' }).selectOption('pattern');
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('repeating-linear-gradient');
  await panel.getByRole('combobox', { name: 'Pattern style' }).selectOption('grid');
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  await panel.getByLabel('Pattern size').fill('18');
  await panel.getByRole('combobox', { name: 'Pattern source' }).selectOption('library');
  await panel.getByRole('combobox', { name: 'Pattern tiling' }).selectOption('repeat-x');
  await panel.getByLabel('Pattern scale').fill('125');
  await panel.getByLabel('Pattern spacing').fill('8');
  await panel.getByRole('combobox', { name: 'Pattern alignment' }).selectOption('bottom-right');
  await panel.getByLabel('Pattern opacity').fill('60');
  await panel.getByRole('combobox', { name: 'Fill color model' }).selectOption('variable');
  await panel.getByLabel('Fill variable reference').fill('colors/accent');
  await panel.getByRole('combobox', { name: 'Fill source' }).selectOption('library');
  await expect(panel.getByRole('combobox', { name: 'Fill type' })).toHaveValue('pattern');
  await expect(panel.getByRole('combobox', { name: 'Fill color model' })).toHaveValue('variable');
  await expect(panel.getByRole('combobox', { name: 'Fill source' })).toHaveValue('library');

  const radiusInput = panel.getByLabel('Radius').first();
  await radiusInput.fill('33');
  await presetSelect.selectOption('card');
  await saveButton.click();
  await page.waitForTimeout(900);

  await page.reload();
  await expect(page.locator('.frame').first()).toBeVisible();
  await clearInitialFrameSelection(page);
  const reloadedButton = page.locator('.frame').first().locator('.element.is-button').first();
  await reloadedButton.click();
  await expect(reloadedButton).toHaveClass(/selected/);

  const reloadedPanel = page.locator('.right-panel');
  await expect(reloadedPanel.getByRole('combobox', { name: 'Fill type' })).toHaveValue('pattern');
  await expect(reloadedPanel.getByRole('combobox', { name: 'Fill color model' })).toHaveValue('variable');
  await expect(reloadedPanel.getByRole('combobox', { name: 'Fill source' })).toHaveValue('library');
  await expect(reloadedPanel.getByLabel('Fill variable reference')).toHaveValue('colors/accent');
  await expect(reloadedPanel.getByRole('combobox', { name: 'Pattern style' })).toHaveValue('grid');
  await expect(reloadedPanel.getByLabel('Pattern size')).toHaveValue('18');
  await expect(reloadedPanel.getByRole('combobox', { name: 'Pattern source' })).toHaveValue('library');
  await expect(reloadedPanel.getByRole('combobox', { name: 'Pattern tiling' })).toHaveValue('repeat-x');
  await expect(reloadedPanel.getByLabel('Pattern scale')).toHaveValue('125');
  await expect(reloadedPanel.getByLabel('Pattern spacing')).toHaveValue('8');
  await expect(reloadedPanel.getByRole('combobox', { name: 'Pattern alignment' })).toHaveValue('bottom-right');
  await expect(reloadedPanel.getByLabel('Pattern opacity')).toHaveValue('60');
  const reloadedPresetSelect = reloadedPanel.getByRole('combobox', { name: 'Appearance preset' });
  const reloadedApplyButton = reloadedPanel.getByRole('button', { name: 'Apply appearance preset' });
  await reloadedPresetSelect.selectOption('cta');
  await reloadedApplyButton.click();
  await expect.poll(() => reloadedButton.evaluate(el => getComputedStyle(el).borderRadius)).toBe('999px');

  await reloadedPresetSelect.selectOption('card');
  await reloadedApplyButton.click();
  await expect.poll(() => reloadedButton.evaluate(el => getComputedStyle(el).borderRadius)).toBe('33px');
});

test('advanced stroke inspector controls side widths and stroke metadata', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const button = frame.locator('.element.is-button').first();
  await button.click();
  await expect(button).toHaveClass(/selected/);

  const panel = page.locator('.right-panel');
  await panel.getByLabel('Top left radius').fill('4');
  await panel.getByLabel('Top right radius').fill('12');
  await panel.getByLabel('Bottom right radius').fill('24');
  await panel.getByLabel('Bottom left radius').fill('8');
  await panel.getByRole('button', { name: 'Use iOS corner smoothing preset' }).click();
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).borderRadius)).toBe('4px 12px 24px 8px');
  await expect(panel.getByLabel('Corner smoothing value')).toHaveValue('60');

  await panel.getByLabel('Enable border').check();
  await panel.getByRole('combobox', { name: 'Stroke placement' }).selectOption('outside');
  await panel.getByRole('combobox', { name: 'Stroke width profile' }).selectOption('taper-end');
  await panel.getByLabel('Stroke dash length').fill('10');
  await panel.getByLabel('Stroke gap length').fill('4');
  await panel.getByRole('combobox', { name: 'Stroke cap' }).selectOption('square');
  await panel.getByRole('combobox', { name: 'Stroke brush direction' }).selectOption('reverse');
  await panel.getByRole('combobox', { name: 'Open path start cap' }).selectOption('butt');
  await panel.getByRole('combobox', { name: 'Open path end cap' }).selectOption('round');
  await panel.getByLabel('Stroke top width').fill('8');

  await expect.poll(() => button.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('8px');
  await expect(panel.getByRole('combobox', { name: 'Stroke placement' })).toHaveValue('outside');
  await expect(panel.getByRole('combobox', { name: 'Stroke width profile' })).toHaveValue('taper-end');
  await expect(panel.getByLabel('Stroke dash length')).toHaveValue('10');
  await expect(panel.getByLabel('Stroke gap length')).toHaveValue('4');
  await expect(panel.getByRole('combobox', { name: 'Stroke cap' })).toHaveValue('square');
  await expect(panel.getByRole('combobox', { name: 'Stroke brush direction' })).toHaveValue('reverse');
});

test('contrast preflight flags low-contrast text and applies suggested colour', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const text = frame.locator('.element.is-text').first();
  await text.click();
  await expect(text).toHaveClass(/selected/);

  const panel = page.locator('.right-panel');
  const colorInputs = panel.locator('.color-text');
  await colorInputs.nth(0).fill('#bbbbbb');
  await colorInputs.nth(1).fill('#ffffff');

  await expect(panel.getByText('Text contrast is below WCAG AA')).toBeVisible();
  await expect(page.locator('.a11y-badge')).toHaveCount(1);
  await expect.poll(() => text.evaluate(el => getComputedStyle(el).color)).toBe('rgb(187, 187, 187)');

  await panel.getByRole('button', { name: 'Use darker shade' }).click();

  await expect(panel.getByText('Text contrast is below WCAG AA')).toBeHidden();
  await expect(page.locator('.a11y-badge')).toHaveCount(0);
  await expect.poll(() => text.evaluate(el => getComputedStyle(el).color)).not.toBe('rgb(187, 187, 187)');
});

test('project health panel summarizes contrast alt iframe and broken-link issues', async ({ page }) => {
  const now = Date.now();
  const projectSeed = {
    id: 'project-health-panel-project',
    title: 'Project Health Panel Project',
    lastClientRev: 0,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ownerUserId: null,
    thumbnailAssetId: null,
    payload: {
      schemaVersion: 22,
      frames: [{
        id: 'home',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        background: '#ffffff',
        elements: [
          {
            id: 'bad-text',
            type: 'text',
            x: 40,
            y: 40,
            width: 220,
            height: 60,
            content: 'Low contrast',
            color: '#bbbbbb',
            background: '#ffffff',
            borderRadius: 0,
            fontSize: 24,
            fontWeight: '400',
            targetFrameId: null,
          },
          {
            id: 'missing-alt',
            type: 'image',
            x: 40,
            y: 130,
            width: 180,
            height: 120,
            content: '',
            color: '#111111',
            background: 'transparent',
            borderRadius: 0,
            fontSize: 16,
            fontWeight: '400',
            targetFrameId: null,
            imageSrc: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
          },
          {
            id: 'unsafe-iframe',
            type: 'iframe',
            x: 260,
            y: 130,
            width: 220,
            height: 140,
            content: '',
            color: '#111111',
            background: '#f8fafc',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: '400',
            targetFrameId: null,
            iframeSrc: 'javascript:alert(1)',
          },
          {
            id: 'dead-button',
            type: 'section',
            x: 40,
            y: 290,
            width: 180,
            height: 60,
            content: 'Dead link',
            color: '#111111',
            background: '#f8fafc',
            borderRadius: 12,
            fontSize: 16,
            fontWeight: '700',
            targetFrameId: 'missing-frame',
            isButton: true,
          },
        ],
      }],
      orphanElements: [],
      componentMasters: [],
      snippets: [],
      projectStyles: [],
      variableCollections: [],
    },
  };
  await page.addInitScript((seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
  }, projectSeed);
  await page.evaluate(async (seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
    const storage = await (Function('return import("/src/storage.ts")')() as Promise<{ saveProjectAsync(project: typeof seed): Promise<boolean> }>);
    await storage.saveProjectAsync(seed);
  }, projectSeed);
  await page.reload();
  await expect(page.locator('.frame').first()).toBeVisible();

  await clickWorkspaceControl(page, /Health \(4\)/);
  await closeWorkspaceControls(page);
  const panel = page.getByRole('dialog', { name: 'Project health preflight' });
  await expect(panel).toContainText('2 errors, 2 warnings');
  await expect(panel).toContainText('Contrast');
  await expect(panel).toContainText('Alt text');
  await expect(panel).toContainText('Iframes');
  await expect(panel).toContainText('Broken links');
  await expect(panel.getByRole('button', { name: /Text contrast is below WCAG AA/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Image is missing alt text/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Iframe URL will be replaced on export/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Button link target is missing/ })).toBeVisible();

  await panel.getByRole('button', { name: /Image is missing alt text/ }).click();
  await expect(page.locator('.frame .element.is-image.selected')).toHaveCount(1);

  await panel.getByRole('button', { name: 'Close project health' }).click();
  await clickWorkspaceControl(page, '↓ All');
  const exportWarning = page.getByRole('dialog', { name: 'Export warnings before download' });
  await expect(exportWarning).toContainText('Preflight found 2 errors, 2 warnings');
  await expect(exportWarning).toContainText('Button link target is missing');
  await exportWarning.getByRole('button', { name: 'Review Health' }).click();
  await expect(page.getByRole('dialog', { name: 'Project health preflight' })).toBeVisible();

  await page.getByRole('button', { name: 'Close project health' }).click();
  await clickWorkspaceControl(page, '↓ All');
  await page.getByRole('dialog', { name: 'Export warnings before download' }).getByRole('button', { name: 'Export anyway' }).click();
  await expect(page.getByRole('dialog', { name: 'Export warnings before download' })).toBeHidden();
});

test('project health panel reports unavailable asset references', async ({ page }) => {
  const now = Date.now();
  const projectSeed = {
    id: 'project-health-asset-project',
    title: 'Project Health Asset Project',
    lastClientRev: 0,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ownerUserId: null,
    thumbnailAssetId: null,
    payload: {
      schemaVersion: 22,
      frames: [{
        id: 'home',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        background: '#ffffff',
        elements: [{
          id: 'missing-asset-image',
          type: 'image',
          name: 'Missing asset hero',
          x: 40,
          y: 40,
          width: 220,
          height: 140,
          content: '',
          color: '#111111',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          alt: 'Hero image',
          imageAssetId: 'asset-not-in-cache',
          imageAssetPath: 'user/project/asset-not-in-cache.png',
          imageMime: 'image/png',
        }],
      }],
      orphanElements: [],
      componentMasters: [],
      snippets: [],
      projectStyles: [],
      variableCollections: [],
    },
  };
  await page.addInitScript((seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
  }, projectSeed);
  await page.evaluate(async (seed) => {
    localStorage.removeItem('frontendeasy_idb_migration_v1');
    localStorage.setItem('frontendeasy_project_v1', JSON.stringify(seed));
    const storage = await (Function('return import("/src/storage.ts")')() as Promise<{ saveProjectAsync(project: typeof seed): Promise<boolean> }>);
    await storage.saveProjectAsync(seed);
  }, projectSeed);
  await page.reload();
  await expect(page.locator('.frame').first()).toBeVisible();

  await expect(await workspaceControl(page, /Health \(1\)/)).toBeVisible({ timeout: 5000 });
  await clickWorkspaceControl(page, /Health \(1\)/);
  await closeWorkspaceControls(page);
  const panel = page.getByRole('dialog', { name: 'Project health preflight' });
  await expect(panel).toContainText('Assets');
  await expect(panel.getByRole('button', { name: /Asset reference is unavailable/ })).toBeVisible();
  await expect(panel.getByRole('button', { name: /Missing asset hero/ })).toBeVisible();

  await panel.getByRole('button', { name: /Asset reference is unavailable/ }).click();
  await expect(page.locator('.frame .element.is-image.selected')).toHaveCount(1);
});

test('tab-order overlay numbers focusable exported elements', async ({ page }) => {
  const toggle = await workspaceControl(page, /Tab order/);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  const badges = page.locator('.tab-order-badge');
  await expect.poll(() => badges.count()).toBeGreaterThan(0);
  await expect(badges.first()).toContainText('1');
  await expect(badges.first()).toHaveAttribute('title', /1\./);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(badges).toHaveCount(0);
});

test('sticky comments can be created, opened, and resolved on the canvas', async ({ page }) => {
  await clickWorkspaceControl(page, 'Add sticky comment');

  const dialog = page.getByRole('dialog', { name: 'Add sticky comment' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Comment').fill('Check the hero spacing');
  await dialog.getByRole('button', { name: 'Add comment' }).click();

  await expect(page.locator('.comment-pin')).toHaveCount(1);
  await expect(page.getByTestId('comment-thread-panel')).toContainText('Check the hero spacing');

  await page.getByRole('button', { name: 'Close comment' }).click();
  await expect(page.getByTestId('comment-thread-panel')).toBeHidden();
  await page.locator('.comment-pin').click();
  await expect(page.getByTestId('comment-thread-panel')).toContainText('Local only');

  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.locator('.comment-pin')).toHaveCount(0);
  await expect(page.getByTestId('comment-thread-panel')).toBeHidden();
});

test('communication tools add comments, annotations, and measurements with mode gating', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const box = await frame.boundingBox();
  if (!box) throw new Error('Home frame did not render');

  await page.getByRole('button', { name: 'Comment tool (C)' }).click();
  await page.mouse.click(box.x + 180, box.y + 120);
  const dialog = page.getByRole('dialog', { name: 'Add sticky comment' });
  await dialog.getByLabel('Comment').fill('Pinned from comment tool');
  await dialog.getByRole('button', { name: 'Add comment' }).click();
  await expect(page.locator('.comment-pin')).toHaveCount(1);
  await expect(page.getByTestId('comment-thread-panel')).toContainText('Pinned from comment tool');

  await chooseToolbarItem(page, 'comment', /Measurement/);
  await page.mouse.move(box.x + 220, box.y + 190);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 250, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.review-overlay-layer .review-measurement line')).toHaveCount(1);
  await expect(page.locator('.review-measure-label')).toContainText(/px · ΔX/);

  await chooseToolbarItem(page, 'comment', /Annotation/);
  await page.mouse.move(box.x + 260, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 420, box.y + 340, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.review-overlay-layer .review-annotation line')).toHaveCount(1);
  await expect(page.locator('.review-label')).toContainText('Annotation');

  await chooseWorkspaceMode(page, 'Comment');
  await expect(page.getByRole('button', { name: 'Comment tool (C)' })).toBeEnabled();
  let commentMenu = await openToolbarGroup(page, 'comment');
  await expect(commentMenu.getByRole('menuitem', { name: /Annotation/ })).toBeEnabled();
  await expect(commentMenu.getByRole('menuitem', { name: /Measurement/ })).toBeEnabled();
  await page.keyboard.press('Escape');

  await chooseWorkspaceMode(page, 'View');
  await expect(page.getByRole('button', { name: 'Comment tool (C)' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Comment tools' })).toBeDisabled();
});

test('comment mode blocks edits while allowing comments and properties', async ({ page }) => {
  await chooseWorkspaceMode(page, 'Comment');

  await expect(page.getByText('Comment mode')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text tool (T)' })).toBeDisabled();
  await page.keyboard.press('C');
  await expect(page.getByRole('button', { name: 'Comment tool (C)' })).toHaveAttribute('aria-pressed', 'true');

  const buttons = page.locator('.frame .element.is-button');
  const count = await buttons.count();
  await page.keyboard.press('Control+d');
  await expect(buttons).toHaveCount(count);
  const frames = page.locator('.frame');
  const frameCount = await frames.count();
  await page.getByTitle('Add page').click();
  await expect(frames).toHaveCount(frameCount);

  await clickWorkspaceControl(page, 'Add sticky comment');
  const dialog = page.getByRole('dialog', { name: 'Add sticky comment' });
  await dialog.getByLabel('Comment').fill('Read-only review note');
  await dialog.getByRole('button', { name: 'Add comment' }).click();

  await expect(page.locator('.comment-pin')).toHaveCount(1);
  await expect(page.getByTestId('comment-thread-panel')).toContainText('Read-only review note');

  await chooseWorkspaceMode(page, 'View');
  await expect(await workspaceControl(page, 'Add sticky comment')).toBeDisabled();
  await page.keyboard.press('C');
  await expect(page.getByRole('button', { name: 'Comment tool (C)' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Comment tool (C)' })).toHaveAttribute('aria-pressed', 'false');
});

test('minify export toggle updates project export settings', async ({ page }) => {
  const toggle = await workspaceControl(page, 'Minify export HTML');

  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveClass(/active/);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

test('strict CSP export toggle updates project export settings', async ({ page }) => {
  const toggle = await workspaceControl(page, 'Strict CSP export');
  const inspectorToggle = page.getByRole('checkbox', { name: 'Strict CSP export setting' });

  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(inspectorToggle).not.toBeChecked();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveClass(/active/);
  await expect(inspectorToggle).toBeChecked();

  await inspectorToggle.uncheck();
  await expect(await workspaceControl(page, 'Strict CSP export')).toHaveAttribute('aria-pressed', 'false');
  await expect(inspectorToggle).not.toBeChecked();
});

test('dark-mode export toggle and frame override are editable', async ({ page }) => {
  const toggle = await workspaceControl(page, 'Dark-mode export CSS');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveClass(/active/);

  const frameOverride = page.getByRole('combobox', { name: 'Frame dark-mode export' });
  await expect(frameOverride).toHaveValue('inherit');
  await frameOverride.selectOption('off');
  await expect(frameOverride).toHaveValue('off');
  await frameOverride.selectOption('on');
  await expect(frameOverride).toHaveValue('on');
});

test('PWA export toggle and frame cache exclusion are editable', async ({ page }) => {
  const toggle = await workspaceControl(page, 'PWA-ready export');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveClass(/active/);

  const exclude = page.getByRole('checkbox', { name: 'Exclude frame from PWA export' });
  await expect(exclude).not.toBeChecked();
  await exclude.check();
  await expect(exclude).toBeChecked();
  await exclude.uncheck();
  await expect(exclude).not.toBeChecked();
});

test('frame favicon controls support project default and page override states', async ({ page }) => {
  const projectFavicon = page.getByRole('combobox', { name: 'Project default favicon' });
  await expect(projectFavicon).toHaveValue('');

  const frameFavicon = page.getByRole('combobox', { name: 'Frame favicon' });
  await expect(frameFavicon).toHaveValue('__inherit__');
  await frameFavicon.selectOption('__none__');
  await expect(frameFavicon).toHaveValue('__none__');
  await frameFavicon.selectOption('__inherit__');
  await expect(frameFavicon).toHaveValue('__inherit__');
});

test('transform inputs accept unit suffixes and keep authored value visible', async ({ page }) => {
  await clearInitialFrameSelection(page);
  const frame = page.locator('.frame').first();
  const title = frame.locator('.element.is-text').first();
  await title.click();

  const widthInput = page.getByRole('textbox', { name: 'Element width' });
  await widthInput.fill('50%');
  await widthInput.press('Tab');

  await expect(widthInput).toHaveValue('50%');
  await expect(title).toHaveCSS('width', '640px');

  const heightInput = page.getByRole('textbox', { name: 'Element height' });
  await heightInput.fill('4em');
  await heightInput.press('Tab');

  await expect(heightInput).toHaveValue('4em');
  await expect(title).toHaveCSS('height', '64px');
});
