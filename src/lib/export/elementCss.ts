// Pure helpers for generated element CSS.
//
// Keep these routines byte-stable: generated HTML/CSS snapshot tests depend on
// declaration ordering, selector grouping, indentation, and newline behavior.

/**
 * Consolidate duplicate CSS declaration blocks within a block of CSS rules.
 *
 * Positional declarations (`left`, `top`) are treated as per-selector placement
 * and split out from the "visual" (shared) declarations. Rules whose visual
 * declarations are identical are merged into a comma-separated multi-selector
 * rule. When those rules also share the same placement, a single fully-merged
 * rule is emitted; when placement differs, one combined visual rule is emitted
 * plus individual (or sub-grouped) placement rules. Singletons are left as-is.
 *
 * Input: newline-separated `.class{declarations}` rules (as produced by
 * elementToCSS). Output: same rules with shared visual blocks consolidated.
 */
export function consolidateCSSRules(cssText: string): string {
  const rulePattern = /^([ \t]*)(\.[a-zA-Z0-9_-]+)\{([^}]*)\}/gm;

  // Properties that are per-element positional — never shared across selectors.
  const PLACEMENT_PROPS = new Set(['left', 'top']);

  interface ParsedRule {
    indent: string;
    selector: string;
    allDecls: string;
    placementDecls: string;
    sharedDecls: string;
  }

  const parsedRules: ParsedRule[] = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(cssText)) !== null) {
    const [, indent, selector, allDecls] = match;
    const parts = allDecls.split(';').filter(Boolean);
    const placement: string[] = [];
    const shared: string[] = [];
    for (const part of parts) {
      if (PLACEMENT_PROPS.has(part.split(':')[0].trim())) {
        placement.push(part);
      } else {
        shared.push(part);
      }
    }
    parsedRules.push({
      indent,
      selector,
      allDecls,
      placementDecls: placement.join(';'),
      sharedDecls: shared.join(';'),
    });
  }

  // Group selectors by shared (non-positional) declarations, preserving order of first appearance.
  const sharedOrder: string[] = [];
  const sharedMap = new Map<string, { indent: string; rules: ParsedRule[] }>();
  for (const rule of parsedRules) {
    if (sharedMap.has(rule.sharedDecls)) {
      sharedMap.get(rule.sharedDecls)!.rules.push(rule);
    } else {
      sharedOrder.push(rule.sharedDecls);
      sharedMap.set(rule.sharedDecls, { indent: rule.indent, rules: [rule] });
    }
  }

  const outputLines: string[] = [];

  for (const sharedDecls of sharedOrder) {
    const { indent, rules } = sharedMap.get(sharedDecls)!;

    if (rules.length === 1) {
      // Singleton: keep the original full rule unchanged to avoid any bloat.
      const r = rules[0];
      outputLines.push(`${r.indent}${r.selector}{${r.allDecls}}`);
      continue;
    }

    // Multiple selectors share the same visual declarations.
    const allSamePlacement = rules.every(r => r.placementDecls === rules[0].placementDecls);

    if (allSamePlacement) {
      // Placement is identical (or absent for all) — fully merge into one rule.
      const selectors = rules.map(r => r.selector).join(', ');
      outputLines.push(`${indent}${selectors}{${rules[0].allDecls}}`);
    } else {
      // Same visual style, different positions: one combined visual rule + per-selector placement.
      const selectors = rules.map(r => r.selector).join(', ');
      outputLines.push(`${indent}${selectors}{${sharedDecls}}`);

      // Sub-group placement rules so identical placements share one rule too.
      const placementOrder: string[] = [];
      const placementMap = new Map<string, { indent: string; selectors: string[] }>();
      for (const r of rules) {
        if (!r.placementDecls) continue;
        if (placementMap.has(r.placementDecls)) {
          placementMap.get(r.placementDecls)!.selectors.push(r.selector);
        } else {
          placementOrder.push(r.placementDecls);
          placementMap.set(r.placementDecls, { indent: r.indent, selectors: [r.selector] });
        }
      }
      for (const pDecls of placementOrder) {
        const { indent: pIndent, selectors: pSels } = placementMap.get(pDecls)!;
        outputLines.push(`${pIndent}${pSels.join(', ')}{${pDecls}}`);
      }
    }
  }

  return outputLines.join('\n');
}
