import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import {
  validatePackage,
  loadPackage,
  buildPackageManifest,
} from '@researchcrafters/content-sdk';

interface BuildOptions {
  cwd?: string;
  outDir?: string;
}

export async function buildCommand(
  packagePath: string,
  opts: BuildOptions = {},
): Promise<{ manifestPath: string }> {
  const cwd = opts.cwd ?? process.cwd();
  const target = path.resolve(cwd, packagePath);
  const outDir = path.resolve(cwd, opts.outDir ?? path.join(target, '.build'));

  process.stdout.write(kleur.dim('Validating package...\n'));
  const report = await validatePackage(target);
  if (!report.ok) {
    process.stdout.write(
      kleur.red(`Validation failed: ${report.errors.length} error(s). See \`researchcrafters validate\` for details.\n`),
    );
    throw new Error('Package validation failed.');
  }

  process.stdout.write(kleur.dim('Loading package...\n'));
  const loaded = await loadPackage(target);
  const manifest = buildPackageManifest(loaded);
  await fs.mkdir(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(kleur.green(`Wrote ${manifestPath}\n`));
  return { manifestPath };
}
