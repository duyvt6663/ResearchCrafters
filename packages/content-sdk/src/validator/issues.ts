import type { Issue, IssueSeverity, ValidationLayer, ValidationReport } from '../types.js';

export function makeIssue(
  layer: ValidationLayer,
  severity: IssueSeverity,
  code: string,
  message: string,
  extras: { path?: string; ref?: string; pending?: boolean } = {},
): Issue {
  const issue: Issue = { layer, severity, code, message };
  if (extras.path !== undefined) issue.path = extras.path;
  if (extras.ref !== undefined) issue.ref = extras.ref;
  if (extras.pending !== undefined) issue.pending = extras.pending;
  return issue;
}

export function emptyReport(): ValidationReport {
  return { ok: true, errors: [], warnings: [], info: [] };
}

export function pushIssue(report: ValidationReport, issue: Issue): void {
  if (issue.severity === 'error') report.errors.push(issue);
  else if (issue.severity === 'warning') report.warnings.push(issue);
  else report.info.push(issue);
}

export function mergeReports(...reports: ValidationReport[]): ValidationReport {
  const merged = emptyReport();
  for (const r of reports) {
    merged.errors.push(...r.errors);
    merged.warnings.push(...r.warnings);
    merged.info.push(...r.info);
  }
  merged.ok = merged.errors.length === 0;
  return merged;
}

export function finalize(report: ValidationReport): ValidationReport {
  report.ok = report.errors.length === 0;
  return report;
}
