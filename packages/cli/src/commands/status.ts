import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import { errors } from '../lib/error-ux.js';
import type { LocalProjectConfig } from '../lib/config.js';

export async function statusCommand(opts: { cwd?: string } = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const file = path.join(cwd, '.researchcrafters', 'config.json');
  let cfg: LocalProjectConfig;
  try {
    cfg = JSON.parse(await fs.readFile(file, 'utf8')) as LocalProjectConfig;
  } catch {
    throw errors.noProjectConfig();
  }
  process.stdout.write(`${kleur.bold('Package:')} ${cfg.packageSlug}@${cfg.packageVersionId}\n`);
  process.stdout.write(`${kleur.bold('Stage:')}   ${cfg.stageRef}\n`);
  process.stdout.write(`${kleur.bold('API:')}     ${cfg.apiUrl}\n`);
  if (cfg.lastRunId) {
    process.stdout.write(`${kleur.bold('Last run:')} ${cfg.lastRunId}\n`);
  } else {
    process.stdout.write(`${kleur.dim('No runs yet.')}\n`);
  }
}
