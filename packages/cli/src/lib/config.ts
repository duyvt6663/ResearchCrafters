import { promises as fs } from 'node:fs';
import path from 'node:path';
import Conf from 'conf';

export interface CliState {
  apiUrl?: string;
  token?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  email?: string;
  serverMinCliVersion?: string;
}

const store = new Conf<CliState>({
  projectName: 'researchcrafters',
  defaults: {},
});

export function getState(): CliState {
  return store.store;
}

export function setState(patch: Partial<CliState>): void {
  for (const [k, v] of Object.entries(patch) as [keyof CliState, CliState[keyof CliState]][]) {
    if (v === undefined) {
      store.delete(k);
    } else {
      store.set(k, v);
    }
  }
}

export function clearAuth(): void {
  store.delete('token');
  store.delete('refreshToken');
  store.delete('tokenExpiresAt');
  store.delete('email');
}

export function isLoggedIn(): boolean {
  const s = store.store;
  if (!s.token) return false;
  if (s.tokenExpiresAt && Date.now() >= s.tokenExpiresAt) return false;
  return true;
}

export interface LocalProjectConfig {
  apiUrl: string;
  packageSlug: string;
  packageVersionId: string;
  stageRef: string;
  lastRunId?: string;
  smokeCommand?: string;
}

export const PROJECT_CONFIG_PATH = '.researchcrafters/config.json';

/**
 * Read `.researchcrafters/config.json` for the given (or current) directory.
 * Throws the underlying fs error when the file is missing — call sites that
 * want a friendly CLI error should catch and rethrow `errors.noProjectConfig()`.
 */
export async function readProjectConfig(cwd?: string): Promise<LocalProjectConfig> {
  const dir = cwd ?? process.cwd();
  const file = path.join(dir, PROJECT_CONFIG_PATH);
  const text = await fs.readFile(file, 'utf8');
  return JSON.parse(text) as LocalProjectConfig;
}

/**
 * Merge the given patch into `.researchcrafters/config.json` and write back
 * atomically. Intended for command flows like `submit` that need to persist
 * `lastRunId` between invocations so `status` can render the latest run.
 *
 * The file MUST already exist (i.e. `start <package>` has been run); this
 * helper does not create the workspace from scratch.
 */
export async function setProjectConfig(
  patch: Partial<LocalProjectConfig>,
  cwd?: string,
): Promise<LocalProjectConfig> {
  const dir = cwd ?? process.cwd();
  const file = path.join(dir, PROJECT_CONFIG_PATH);
  const current = (await readProjectConfig(dir)) as LocalProjectConfig;
  const next: LocalProjectConfig = { ...current, ...patch };
  await fs.writeFile(file, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

/**
 * Render the package display string used by `status`. The web app's enroll
 * route returns `packageVersionId` as `${slug}@stub` (and may eventually
 * return real versions like `${slug}@0.1.0`), so naively interpolating
 * `${slug}@${packageVersionId}` produces `slug@slug@stub`. This helper
 * collapses the duplication: if `packageVersionId` already starts with
 * `${slug}@` we render it bare, otherwise we render `${slug}@${id}`. When
 * `packageVersionId` is missing we fall back to the slug alone.
 */
export function formatPackageDisplay(cfg: {
  packageSlug: string;
  packageVersionId?: string;
}): string {
  const slug = cfg.packageSlug;
  const id = cfg.packageVersionId;
  if (!id) return slug;
  const prefix = `${slug}@`;
  const suffix = id.startsWith(prefix) ? id.slice(prefix.length) : id;
  // Show the suffix shortened when it's clearly a cuid (>= 16 chars, no '.')
  // so the line stays readable. Real semver / stub labels are kept intact.
  const isCuidLike = suffix.length >= 16 && !suffix.includes('.') && !suffix.includes('-');
  const shown = isCuidLike ? suffix.slice(0, 12) : suffix;
  return `${slug}@${shown}`;
}
