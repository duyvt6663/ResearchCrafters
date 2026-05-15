import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import { api, ApiError, apiUrl } from '../lib/api.js';
import { isLoggedIn } from '../lib/config.js';
import { errors } from '../lib/error-ux.js';
import { extractStarterTarGz } from '../lib/starter.js';
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

  // Download + extract the starter workspace when the API surfaced a signed
  // URL. We refuse to overwrite an existing workspace: if the project dir
  // already contains anything besides `.researchcrafters/`, skip the extract
  // and let the learner clean up by hand. This avoids stomping on a partial
  // attempt if `start` is re-run by mistake.
  let starterStatus: 'extracted' | 'skipped-existing' | 'skipped-no-url' | 'failed' =
    'skipped-no-url';
  let starterDetail = '';
  if (pkg.starterUrl) {
    if (await hasNonConfigEntries(projectDir)) {
      starterStatus = 'skipped-existing';
    } else {
      try {
        const bundle = await api.downloadSignedUrl(pkg.starterUrl);
        const result = await extractStarterTarGz(bundle, projectDir);
        starterStatus = 'extracted';
        starterDetail = `${result.fileCount} files, ${result.byteCount} bytes`;
      } catch (err) {
        starterStatus = 'failed';
        starterDetail = err instanceof ApiError || err instanceof Error ? err.message : String(err);
      }
    }
  }

  process.stdout.write(
    kleur.green('Started.') +
      ` Workspace: ${kleur.cyan(projectDir)}\n` +
      `  Stage: ${kleur.yellow(pkg.stageRef)}\n`,
  );
  if (starterStatus === 'extracted') {
    process.stdout.write(`  Starter bundle: ${kleur.green('extracted')} (${starterDetail})\n`);
  } else if (starterStatus === 'skipped-existing') {
    process.stdout.write(
      `  Starter bundle: ${kleur.yellow('skipped')} (workspace already contains files)\n`,
    );
  } else if (starterStatus === 'failed') {
    process.stdout.write(
      `  Starter bundle: ${kleur.red('download failed')} (${starterDetail || 'unknown error'})\n`,
    );
  } else if (pkg.starterUrl) {
    // unreachable: starterUrl set but status remained `skipped-no-url`.
    process.stdout.write(`  Starter bundle: ${kleur.dim('signed URL captured')}\n`);
  }
}

async function hasNonConfigEntries(projectDir: string): Promise<boolean> {
  const entries = await fs.readdir(projectDir);
  return entries.some((name) => name !== '.researchcrafters');
}
