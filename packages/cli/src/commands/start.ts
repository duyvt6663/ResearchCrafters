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

  // Stub: download starter via signed URL.
  let starterBuffer: Buffer | null = null;
  if (pkg.starterUrl) {
    try {
      starterBuffer = await api.downloadSignedUrl(pkg.starterUrl);
    } catch {
      // Stubbed: tolerate no starter in offline/dev mode.
      starterBuffer = null;
    }
  }

  const projectDir = path.join(cwd, slug);
  await fs.mkdir(projectDir, { recursive: true });
  if (starterBuffer) {
    await fs.writeFile(path.join(projectDir, 'starter.bundle'), starterBuffer);
  }

  const cfgDir = path.join(projectDir, '.researchcrafters');
  await fs.mkdir(cfgDir, { recursive: true });
  const cfg: LocalProjectConfig = {
    apiUrl: pkg.apiUrl ?? apiUrl(),
    packageSlug: pkg.packageSlug,
    packageVersionId: pkg.packageVersionId,
    stageRef: pkg.stageRef,
    ...(pkg.smokeCommand !== undefined ? { smokeCommand: pkg.smokeCommand } : {}),
  };
  await fs.writeFile(path.join(cfgDir, 'config.json'), JSON.stringify(cfg, null, 2) + '\n');

  process.stdout.write(
    kleur.green('Started.') +
      ` Workspace: ${kleur.cyan(projectDir)}\n` +
      `  Stage: ${kleur.yellow(pkg.stageRef)}\n`,
  );
}
