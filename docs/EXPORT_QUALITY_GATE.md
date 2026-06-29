# Export quality gate

`npm run lint:export` is the non-visual guardrail for Frontendeasy's "clean export" contract. It checks representative generated HTML without changing runtime export output.

## What runs

```bash
npm run lint:export
```

The command runs `scripts/check-export-quality.mjs`, which launches the focused Vitest fixture `src/lib/export/exportQualityFixture.test.ts`. That fixture:

1. Loads the built-in Showcase project template.
2. Generates the first frame through `generateFrameHTML(..., { layoutMode: 'flow' })`.
3. Analyzes the resulting HTML with `analyzeExportHtml()`.
4. Writes concise metrics for CI/local logs.
5. Keeps a deliberate bad fixture proving the analyzer turns regressions red.

The GitHub Actions `smoke` job runs this gate after unit tests and before handoff/build/browser smoke gates.

## Current thresholds

The current CI fixture is intentionally strict for the Showcase flow export:

- `maxAbsolutePositioned: 0`
  - The representative flow export must not emit `position:absolute` rules.
- `requiredLandmarks: ['main']`
  - The export must include at least one `<main>` landmark.
- `imagesMissingAlt: 0`
  - Every emitted `<img>` must have non-empty meaningful `alt` text.
- `inlineStyleAttributeCount: 0`
  - Body markup must not contain inline `style=` attributes. CSS belongs in generated `<style>` blocks.
- `unsafeUrlCount: 0`
  - `href` and `src` attributes must not contain `javascript:` URLs.

`analyzeExportHtml()` also reports counts for `header`, `nav`, `section`, and `footer`. Those are tracked as metrics now, but only `<main>` is required by the first CI gate because the current fixture may legitimately omit `nav`.

## Analyzer metrics

`src/lib/export/exportQuality.ts` returns:

- `absolutePositionedCount`: count of `position:absolute` CSS occurrences in the full HTML string.
- `landmarkCounts`: counts for `main`, `header`, `nav`, `section`, and `footer` tags.
- `imageCount`: number of `<img>` tags.
- `imagesMissingAlt`: number of `<img>` tags with missing or empty `alt`.
- `inlineStyleAttributeCount`: count of `style=` attributes in body markup.
- `unsafeUrlCount`: count of `javascript:` values in `href`/`src` attributes.
- `issues`: structured issue records; the script/test decide whether those issues fail the gate.

The analyzer is zero-dependency by design. It uses conservative string/regex checks rather than a full HTML parser so the gate stays fast and does not expand the dependency surface.

## Known legacy exceptions and boundaries

- The first gate covers a representative generated **flow** export fixture, not every possible project shape.
- Older projects and explicit legacy/absolute export paths may still rely on absolute layout output. Do not silently tighten this gate across those paths without adding fixtures and snapshots that prove compatibility.
- CSS inside generated `<style>` tags is allowed. The gate rejects inline `style=` attributes in body markup.
- An export with no images is valid; if images are present, each image must carry meaningful `alt` text.
- This gate is not a replacement for export snapshots, browser smoke tests, accessibility preflight, or manual QA on production deploys.

## Owner modules

- `storage.ts`
  - Owns the public export generator entry points such as `generateFrameHTML()` and template loading re-exports consumed by tests/scripts.
- `src/lib/export/*`
  - Owns clean-export analysis, semantic/flow export helpers, and focused export tests.
- `src/lib/export/exportQuality.ts`
  - Owns analyzer types, metrics, and issue detection.
- `src/lib/export/exportQualityFixture.test.ts`
  - Owns the representative generated fixture and deliberate bad-fixture contract.
- `scripts/check-export-quality.mjs`
  - Owns the npm/CI command wrapper and metrics printing.
- `.github/workflows/ci.yml`
  - Owns CI smoke placement of `npm run lint:export`.

## How to adjust the gate safely

When export architecture improves, prefer tightening the contract rather than weakening it:

1. Add or update focused fixtures first.
2. Run the fixture and watch the expected failure if the new rule is not implemented yet.
3. Implement the smallest export/analyzer change.
4. Update this document with the new threshold and known exceptions.
5. Run:

```bash
npm run lint:export
npm run check
npm run build:budget
npm run validate:handoff
git diff --check
```

For docs-only threshold documentation changes, runtime tests can be skipped, but `npm run validate:handoff` and `git diff --check` are still required.
