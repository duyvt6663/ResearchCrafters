import kleur from 'kleur';
import { api } from './api.js';
import { getState, setState } from './config.js';

export const CLI_VERSION = '0.0.0';

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((p) => parseInt(p, 10) || 0);
  const pb = b.split('.').map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export async function maybeWarnVersionMismatch(): Promise<void> {
  const cached = getState().serverMinCliVersion;
  let minRequired = cached;
  if (!minRequired) {
    try {
      const v = await api.getVersionInfo();
      minRequired = v.minCliVersion;
      setState({ serverMinCliVersion: v.minCliVersion });
    } catch {
      return;
    }
  }
  if (!minRequired) return;
  if (compareSemver(CLI_VERSION, minRequired) < 0) {
    process.stderr.write(
      kleur.yellow(
        `Warning: researchcrafters CLI ${CLI_VERSION} is older than the server's minimum (${minRequired}). Please upgrade.\n`,
      ),
    );
  }
}
