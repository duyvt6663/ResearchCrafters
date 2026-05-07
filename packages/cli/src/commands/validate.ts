import path from 'node:path';
import kleur from 'kleur';
import { validatePackage } from '@researchcrafters/content-sdk';
import type { Issue, ValidationReport } from '@researchcrafters/content-sdk';

interface ValidateOptions {
  cwd?: string;
  json?: boolean;
}

function severityColor(severity: Issue['severity']): (s: string) => string {
  if (severity === 'error') return kleur.red().bold;
  if (severity === 'warning') return kleur.yellow().bold;
  return kleur.cyan;
}

function severityLabel(severity: Issue['severity']): string {
  if (severity === 'error') return 'ERROR';
  if (severity === 'warning') return 'WARN ';
  return 'INFO ';
}

function formatIssue(issue: Issue): string {
  const color = severityColor(issue.severity);
  const head = `${color(severityLabel(issue.severity))} [${issue.layer}] ${kleur.gray(issue.code)}`;
  const where: string[] = [];
  if (issue.path) where.push(`path=${issue.path}`);
  if (issue.ref) where.push(`ref=${issue.ref}`);
  const whereStr = where.length ? `\n      ${kleur.dim(where.join(' '))}` : '';
  const pendingStr = issue.pending ? ` ${kleur.dim('(pending)')}` : '';
  return `  ${head}${pendingStr}\n    ${issue.message}${whereStr}`;
}

function printReport(report: ValidationReport, target: string): void {
  process.stdout.write(`\nValidation report for ${kleur.cyan(target)}\n`);
  for (const i of report.errors) process.stdout.write(formatIssue(i) + '\n');
  for (const i of report.warnings) process.stdout.write(formatIssue(i) + '\n');
  for (const i of report.info) process.stdout.write(formatIssue(i) + '\n');
  const summary =
    `\n${report.errors.length} error(s), ` +
    `${report.warnings.length} warning(s), ` +
    `${report.info.length} info\n`;
  process.stdout.write(report.ok ? kleur.green(summary) : kleur.red(summary));
}

export async function validateCommand(
  packagePath: string,
  opts: ValidateOptions = {},
): Promise<ValidationReport> {
  const cwd = opts.cwd ?? process.cwd();
  const target = path.resolve(cwd, packagePath);
  const report = await validatePackage(target);
  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    printReport(report, target);
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
  return report;
}
