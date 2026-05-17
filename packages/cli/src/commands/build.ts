import { promises as fs } from 'node:fs';
import path from 'node:path';
import kleur from 'kleur';
import {
  validatePackage,
  loadPackage,
  buildPackageManifest,
  computeManifestSourceHash,
} from '@researchcrafters/content-sdk';

interface BuildOptions {
  cwd?: string;
  outDir?: string;
}

export interface BuildArtifacts {
  manifestPath: string;
  sourceHashPath: string;
  sourceHash: string;
}

export async function buildCommand(
  packagePath: string,
  opts: BuildOptions = {},
): Promise<BuildArtifacts> {
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
  // Pin the deterministic source hash alongside the manifest so the DB
  // mirror step (PackageVersion.sourceHash / PackageVersion.manifest) can
  // be populated from build output without re-deriving the algorithm.
  // See backlog/06-data-access-analytics.md "Package Build Mirroring".
  const sourceHash = computeManifestSourceHash(manifest);

  await fs.mkdir(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  const sourceHashPath = path.join(outDir, 'source-hash.txt');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(sourceHashPath, sourceHash + '\n');
  process.stdout.write(kleur.green(`Wrote ${manifestPath}\n`));
  process.stdout.write(kleur.green(`Wrote ${sourceHashPath} (${sourceHash})\n`));
  return { manifestPath, sourceHashPath, sourceHash };
}
