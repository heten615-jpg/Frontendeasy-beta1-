import { countAccessibilityIssues, type AccessibilityPreflightCode, type AccessibilityPreflightResult } from '../a11y/preflight';

export type ProjectHealthMetricCode = Extract<
  AccessibilityPreflightCode,
  'text-low-contrast' | 'image-missing-alt' | 'unsafe-iframe-src' | 'broken-link' | 'asset-unavailable'
>;

export interface ProjectHealthMetricCard {
  code: ProjectHealthMetricCode;
  label: string;
  value: number;
}

export const PROJECT_HEALTH_METRICS: ReadonlyArray<{ code: ProjectHealthMetricCode; label: string }> = [
  { code: 'text-low-contrast', label: 'Contrast' },
  { code: 'image-missing-alt', label: 'Alt text' },
  { code: 'unsafe-iframe-src', label: 'Iframes' },
  { code: 'broken-link', label: 'Broken links' },
  { code: 'asset-unavailable', label: 'Assets' },
] as const;

export function projectHealthIssueCount(preflight: Pick<AccessibilityPreflightResult, 'issues'>): number {
  return preflight.issues.length;
}

export function projectHealthSummary(preflight: Pick<AccessibilityPreflightResult, 'counts' | 'issues'>): string {
  if (projectHealthIssueCount(preflight) === 0) return 'No project health issues';

  const errors = preflight.counts.error;
  const warnings = preflight.counts.warning;
  return `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
}

export function projectHealthMetricCards(preflight: AccessibilityPreflightResult): ProjectHealthMetricCard[] {
  return PROJECT_HEALTH_METRICS.map(metric => ({
    ...metric,
    value: countAccessibilityIssues(preflight, metric.code),
  }));
}

export function projectHealthTriggerTitle(summary: string): string {
  return `Project health preflight: ${summary}`;
}

export function projectHealthTriggerLabel(issueCount: number): string {
  return issueCount > 0 ? `Health (${issueCount})` : 'Health ✓';
}
