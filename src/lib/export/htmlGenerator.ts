// Compatibility facade for generated HTML/export helpers.
//
// NUI-061 intentionally does not move generator internals yet: storage.ts remains
// the canonical implementation and backwards-compatible public API. This module
// gives future export code a stable src/lib/export/* import path before the risky
// element/document generator slices are extracted.

export {
  consolidateCSSRules,
  connectFolder,
  downloadAllFrames,
  downloadFrame,
  generateFrameHTML,
  generateOrphanHTML,
  generatePwaExportFiles,
  generatePwaIconSVG,
  generatePwaManifestJSON,
  generatePwaServiceWorkerJS,
  generateRobotsTxt,
  generateSitemapXML,
  generateSliceHTML,
  writeFolder,
  writeFolderElectron,
} from '../../storage';

export { minifyGeneratedHTML } from './htmlSanitizers';
export type { GenerateHTMLOptions } from './htmlSanitizers';
