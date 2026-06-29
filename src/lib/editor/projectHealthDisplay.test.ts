import { describe, expect, it } from 'vitest';
import type { AccessibilityPreflightIssue, AccessibilityPreflightResult, AccessibilityPreflightSeverity } from '../a11y/preflight';
import {
  PROJECT_HEALTH_METRICS,
  projectHealthIssueCount,
  projectHealthMetricCards,
  projectHealthSummary,
  projectHealthTriggerLabel,
  projectHealthTriggerTitle,
} from './projectHealthDisplay';

function issue(
  code: AccessibilityPreflightIssue['code'],
  severity: AccessibilityPreflightSeverity = 'warning',
): AccessibilityPreflightIssue {
  return {
    id: `${code}:${severity}`,
    code,
    category: severity === 'error' ? 'security' : 'perceivable',
    severity,
    scope: 'element',
    title: code,
    message: `${code} message`,
  };
}

function preflight(issues: AccessibilityPreflightIssue[]): AccessibilityPreflightResult {
  return {
    issues,
    counts: {
      error: issues.filter(item => item.severity === 'error').length,
      warning: issues.filter(item => item.severity === 'warning').length,
      info: issues.filter(item => item.severity === 'info').length,
    },
    byFrameId: {},
    byElementId: {},
  };
}

describe('project health display helpers', () => {
  it('summarizes a clean project and formats the healthy trigger label', () => {
    const result = preflight([]);

    expect(projectHealthIssueCount(result)).toBe(0);
    expect(projectHealthSummary(result)).toBe('No project health issues');
    expect(projectHealthTriggerTitle(projectHealthSummary(result))).toBe('Project health preflight: No project health issues');
    expect(projectHealthTriggerLabel(projectHealthIssueCount(result))).toBe('Health ✓');
  });

  it('preserves error and warning pluralization for unhealthy projects', () => {
    const result = preflight([
      issue('unsafe-iframe-src', 'error'),
      issue('broken-link', 'error'),
      issue('image-missing-alt', 'warning'),
    ]);

    expect(projectHealthIssueCount(result)).toBe(3);
    expect(projectHealthSummary(result)).toBe('2 errors, 1 warning');
    expect(projectHealthTriggerTitle(projectHealthSummary(result))).toBe('Project health preflight: 2 errors, 1 warning');
    expect(projectHealthTriggerLabel(projectHealthIssueCount(result))).toBe('Health (3)');
  });

  it('keeps metric card order and labels stable', () => {
    const result = preflight([
      issue('text-low-contrast', 'warning'),
      issue('text-low-contrast', 'warning'),
      issue('image-missing-alt', 'warning'),
      issue('unsafe-iframe-src', 'error'),
      issue('broken-link', 'error'),
      issue('asset-unavailable', 'warning'),
      issue('tab-order-review', 'info'),
    ]);

    expect(PROJECT_HEALTH_METRICS.map(metric => metric.code)).toEqual([
      'text-low-contrast',
      'image-missing-alt',
      'unsafe-iframe-src',
      'broken-link',
      'asset-unavailable',
    ]);
    expect(projectHealthMetricCards(result)).toEqual([
      { code: 'text-low-contrast', label: 'Contrast', value: 2 },
      { code: 'image-missing-alt', label: 'Alt text', value: 1 },
      { code: 'unsafe-iframe-src', label: 'Iframes', value: 1 },
      { code: 'broken-link', label: 'Broken links', value: 1 },
      { code: 'asset-unavailable', label: 'Assets', value: 1 },
    ]);
  });
});
