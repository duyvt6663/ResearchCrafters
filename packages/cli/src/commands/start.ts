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

  // The enroll route surfaces `starterUrl` / `smokeCommand` only when a
  // bundle object exists for `<slug>/<packageVersionId>` in the packages
  // bucket and the manifest declares a smoke command. We persist them into
  // `.researchcrafters/config.json` so downstream commands (`test`, future
  // `start --refresh`) can consume them without re-hitting the API.

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
  if (pkg.starterUrl) cfg.starterUrl = pkg.starterUrl;
  if (pkg.smokeCommand) cfg.smokeCommand = pkg.smokeCommand;
  await fs.writeFile(path.join(cfgDir, 'config.json'), JSON.stringify(cfg, null, 2) + '\n');

  process.stdout.write(
    kleur.green('Started.') +
      ` Workspace: ${kleur.cyan(projectDir)}\n` +
      `  Stage: ${kleur.yellow(pkg.stageRef)}\n`,
  );
  if (pkg.starterUrl) {
    process.stdout.write(`  Starter bundle: ${kleur.dim('signed URL captured (download pending)')}\n`);
  }
}
