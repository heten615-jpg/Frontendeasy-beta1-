import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StudioState } from '../../types';
import { migrateState } from './storageMigrations';

const CURRENT_SCHEMA_VERSION = 23;
const FIXTURE_DIR = join(process.cwd(), 'src/lib/persistence/__fixtures__/projects');

type FixtureCase = {
  filename: string;
  assertMigrated: (migrated: StudioState) => void;
};

function loadFixture(filename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, filename), 'utf8')) as Record<string, unknown>;
}

const fixtureCases: FixtureCase[] = [
  {
    filename: 'v14-export-settings.json',
    assertMigrated: migrated => {
      expect(migrated.frames[0]).toMatchObject({ id: 'frame-fixture-v14', name: 'Fixture Export Settings' });
      expect(migrated.exportSettings).toMatchObject({
        layoutMode: 'flow',
        minifyHtml: true,
        strictCsp: true,
        includeInspectorMetadata: false,
        darkMode: { enabled: true, palette: { accent: '#14b8a6' } },
        pwa: { enabled: true, appName: 'Export Fixture', iconAssetId: 'asset-export-icon' },
        defaultFaviconAssetId: 'asset-export-favicon',
      });
      expect(migrated.frames[0].exportSettings).toMatchObject({ minifyHtml: false, darkModeEnabled: false });
    },
  },
  {
    filename: 'v16-comments.json',
    assertMigrated: migrated => {
      expect(migrated.frames[0]).toMatchObject({ id: 'frame-fixture-v16', name: 'Fixture Comments' });
      expect(migrated.comments?.[0]).toMatchObject({
        id: 'comment-thread-v16',
        clientId: 'comment-thread-v16',
        body: 'Resolve the comment fixture',
        status: 'queued',
        resolved: false,
      });
      expect(migrated.comments?.[0].messages[0]).toMatchObject({ id: 'comment-message-v16', authorName: 'Fixture Reviewer' });
    },
  },
  {
    filename: 'v21-styles-variables.json',
    assertMigrated: migrated => {
      expect(migrated.frames[0]).toMatchObject({ id: 'frame-fixture-v21', name: 'Fixture Styles Variables' });
      expect(migrated.projectStyles?.some(style => style.id === 'style-v21-heading' && style.fields.text?.fontSize === 64)).toBe(true);
      expect(migrated.variableCollections?.some(collection => (
        collection.id === 'vars-v21-brand'
        && collection.variables.some(variable => variable.id === 'var-v21-spacing' && variable.fallback === '24')
      ))).toBe(true);
      expect(migrated.componentMasters?.[0]).toMatchObject({ id: 'component-v21-card', name: 'Fixture Card' });
      expect(migrated.snippets?.[0]).toMatchObject({ id: 'snippet-v21-card-copy', name: 'Fixture Card Copy' });
      expect(migrated.frames[0].elements[0]).toMatchObject({
        id: 'image-v21-asset',
        type: 'image',
        imageAssetId: 'asset-v21-image',
        imageAssetPath: 'fixture/project/asset-v21-image.png',
      });
    },
  },
  {
    filename: 'v23-export-layout.json',
    assertMigrated: migrated => {
      expect(migrated.exportSettings?.layoutMode).toBe('flow');
      expect(migrated.frames[0]).toMatchObject({
        id: 'frame-fixture-v23-export-layout',
        exportLayoutMode: 'absolute',
        exportSettings: { layoutMode: 'inherit', minifyHtml: true },
      });
      expect(migrated.frames[0].elements[0]).toMatchObject({
        id: 'hero-v23-export-layout',
        exportPinned: true,
        semanticTag: 'main',
      });
      expect(migrated.frames[0].elements[1]).toMatchObject({
        id: 'flow-v23-export-layout',
        exportPinned: false,
        semanticTag: 'section',
      });
      expect(migrated.orphanElements[0]).toMatchObject({
        id: 'orphan-v23-export-layout',
        exportPinned: true,
        semanticTag: 'aside',
      });
    },
  },
  {
    filename: 'v22-minimal.json',
    assertMigrated: migrated => {
      expect(migrated.fontFamily).toBe('Space Grotesk');
      expect(migrated.frames[0]).toMatchObject({
        id: 'frame-fixture-v22',
        name: 'Fixture Home',
        exportLayoutMode: 'inherit',
      });
      expect(migrated.exportSettings).toMatchObject({
        layoutMode: 'absolute',
        minifyHtml: true,
        strictCsp: true,
        includeInspectorMetadata: true,
        pwa: { enabled: true, appName: 'Fixture App', iconAssetId: 'asset-icon' },
        defaultFaviconAssetId: 'asset-favicon',
      });
      expect(migrated.frames[0].elements[0]).toMatchObject({
        id: 'hero-fixture',
        exportPinned: true,
        semanticTag: 'header',
      });
      expect(migrated.textStylePresets?.some(preset => preset.id === 'heading1' && preset.label === 'Fixture Hero')).toBe(true);
      expect(migrated.appearancePresets?.some(preset => preset.id === 'appearance-fixture' && preset.label === 'Fixture Glass Card')).toBe(true);
      expect(migrated.projectStyles?.some(style => style.id === 'style-fixture-accent' && style.fields.color === '#f97316')).toBe(true);
      expect(migrated.variableCollections?.some(collection => (
        collection.id === 'vars-fixture'
        && collection.variables.some(variable => variable.id === 'var-fixture-accent' && variable.valuesByMode?.['mode-dark'] === '#fb923c')
      ))).toBe(true);
      expect(migrated.comments?.[0]).toMatchObject({ id: 'comment-thread-fixture', body: 'Check fixture migration', status: 'local' });
      expect(migrated.reviewOverlays?.[0]).toMatchObject({ id: 'overlay-fixture', kind: 'measurement', label: 'Fixture width' });
      expect(migrated.guides?.[0]).toMatchObject({ id: 'guide-fixture', scope: 'frame', frameId: 'frame-fixture-v22' });
      expect(migrated.componentMasters?.[0]).toMatchObject({ id: 'component-fixture', name: 'Fixture CTA' });
      expect(migrated.snippets?.[0]).toMatchObject({ id: 'snippet-fixture', name: 'Fixture Hero Copy' });
    },
  },
];

describe('storage migration project fixtures', () => {
  it.each(fixtureCases)('$filename migrates to the current schema and preserves its contract fields', ({ filename, assertMigrated }) => {
    const migrated = migrateState(loadFixture(filename), CURRENT_SCHEMA_VERSION);

    expect(migrated, `${filename} should migrate`).not.toBeNull();
    expect(migrated?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    assertMigrated(migrated as StudioState);
  });
});
