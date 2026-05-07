import kleur from 'kleur';
import { api, ApiError } from '../lib/api.js';
import { clearAuth, getState } from '../lib/config.js';

export async function logoutCommand(): Promise<void> {
  const tok = getState().token;
  if (tok) {
    try {
      await api.revokeToken(tok);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      // Best-effort: continue clearing local token regardless of server status.
    }
  }
  clearAuth();
  process.stdout.write(kleur.green('Logged out. Local credentials cleared.\n'));
}
