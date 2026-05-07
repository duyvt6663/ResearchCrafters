import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import { api, apiUrl } from '../lib/api.js';
import { isLoggedIn } from '../lib/config.js';
import { errors } from '../lib/error-ux.js';
import type { LocalProjectConfig } from '../lib/config.js';

interface StartOptions {
  cwd?: string;
}

export async function startCommand(slug: string, opts: StartOptions = {}): Promise<void> {
  if (!isLoggedIn()) throw errors.notLoggedIn();
  const cwd = opts.cwd ?? process.cwd();

  process.stdout.write(`Resolving package ${kleur.cyan(slug)}...\n`);
  const pkg = await api.startPackage(slug);

  // TODO(workspace-provisioning): the enroll route does not yet return a
  // signed `starterUrl` / `smokeCommand`. When the dedicated
  // `/api/packages/<slug>/starter-url` endpoint lands, fetch the bundle
  // here and unpack it into `projectDir`. Until then we materialize an
  // empty workspace; learners can copy in their own scaffolding from the
  // package's `content/` README.

  const projectDir = path.join(cwd, slug);
  await fs.mkdir(projectDir, { recursive: true });

  const cfgDir = path.join(projectDir, '.researchcrafters');
  await fs.mkdir(cfgDir, { recursive: true });
  const cfg: LocalProjectConfig = {
    apiUrl: apiUrl(),
    packageSlug: pkg.packageSlug,
    packageVersionId: pkg.packageVersionId,
    stageRef: pkg.stageRef,
  };
  await fs.writeFile(path.join(cfgDir, 'config.json'), JSON.stringify(cfg, null, 2) + '\n');

  process.stdout.write(
    kleur.green('Started.') +
      ` Workspace: ${kleur.cyan(projectDir)}\n` +
      `  Stage: ${kleur.yellow(pkg.stageRef)}\n`,
  );
}
