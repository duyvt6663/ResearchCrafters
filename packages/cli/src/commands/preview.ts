import path from 'node:path';
import kleur from 'kleur';
import { apiUrl } from '../lib/api.js';

interface PreviewOptions {
  cwd?: string;
}

export async function previewCommand(
  packagePath: string,
  opts: PreviewOptions = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const target = path.resolve(cwd, packagePath);
  const slug = path.basename(target);
  const url = `${apiUrl().replace(/\/$/, '')}/preview/${encodeURIComponent(slug)}`;
  process.stdout.write(`Preview URL (stub): ${kleur.cyan(url)}\n`);
  process.stdout.write(kleur.dim(`Local package: ${target}\n`));
  process.stdout.write(
    kleur.dim('Open the URL once the package is uploaded by the preview workflow.\n'),
  );
}
