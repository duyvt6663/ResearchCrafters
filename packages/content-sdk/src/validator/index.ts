import type { ValidationReport } from '../types.js';
import { loadPackage } from '../loader.js';
import { validateStructural } from './structural.js';
import { validateAraCrossLink } from './ara-cross-link.js';
import { validateSandbox } from './sandbox.js';
import { validatePedagogy } from './pedagogy.js';
import { emptyReport, finalize, makeIssue, mergeReports, pushIssue } from './issues.js';

export { validateStructural } from './structural.js';
export { validateAraCrossLink } from './ara-cross-link.js';
export { validateSandbox } from './sandbox.js';
export { validatePedagogy } from './pedagogy.js';

export async function validatePackage(packageDir: string): Promise<ValidationReport> {
  const structural = await validateStructural(packageDir);

  // If structural failed catastrophically, skip later layers but still return early.
  if (!structural.ok) {
    return finalize(structural);
  }

  let loaded;
  try {
    loaded = await loadPackage(packageDir);
  } catch (err) {
    const r = emptyReport();
    pushIssue(
      r,
      makeIssue(
        'structural',
        'error',
        'package.load_failed',
        `Failed to load package: ${String(err)}`,
        { path: packageDir },
      ),
    );
    return finalize(r);
  }

  const [araReport, sandboxReport, pedagogyReport] = await Promise.all([
    validateAraCrossLink(loaded),
    validateSandbox(loaded),
    validatePedagogy(loaded),
  ]);

  return mergeReports(structural, araReport, sandboxReport, pedagogyReport);
}
