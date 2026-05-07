import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import { errors } from '../lib/error-ux.js';
import type { LocalProjectConfig } from '../lib/config.js';

async function readProjectConfig(cwd: string): Promise<LocalProjectConfig> {
  const file = path.join(cwd, '.researchcrafters', 'config.json');
  try {
    const text = await fs.readFile(file, 'utf8');
    return JSON.parse(text) as LocalProjectConfig;
  } catch {
    throw errors.noProjectConfig();
  }
}

export async function testCommand(opts: { cwd?: string } = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const cfg = await readProjectConfig(cwd);
  const cmd = cfg.smokeCommand ?? 'pnpm test';
  process.stdout.write(kleur.dim(`Running smoke command: ${cmd}\n`));
  const [bin, ...args] = cmd.split(/\s+/);
  if (!bin) throw new Error('Empty smoke command.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Smoke command exited with code ${code}`));
    });
  });
}
