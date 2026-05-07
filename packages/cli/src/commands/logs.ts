import kleur from 'kleur';
import { api } from '../lib/api.js';
import { isLoggedIn } from '../lib/config.js';
import { errors } from '../lib/error-ux.js';

interface LogsOptions {
  follow?: boolean;
  pollIntervalMs?: number;
  maxPolls?: number;
}

export async function logsCommand(runId: string, opts: LogsOptions = {}): Promise<void> {
  if (!isLoggedIn()) throw errors.notLoggedIn();
  if (!opts.follow) {
    const out = await api.getRunLogs(runId);
    process.stdout.write(out.logs.endsWith('\n') ? out.logs : out.logs + '\n');
    return;
  }
  const interval = opts.pollIntervalMs ?? 2000;
  const max = opts.maxPolls ?? Number.MAX_SAFE_INTEGER;
  let cursor = '';
  for (let i = 0; i < max; i += 1) {
    const out = await api.getRunLogs(runId);
    if (out.logs.length > cursor.length && out.logs.startsWith(cursor)) {
      const delta = out.logs.slice(cursor.length);
      process.stdout.write(delta);
      cursor = out.logs;
    } else if (out.logs !== cursor) {
      process.stdout.write(out.logs);
      cursor = out.logs;
    }
    const status = await api.getRunStatus(runId);
    if (status.status !== 'queued' && status.status !== 'running') {
      process.stdout.write(kleur.dim(`\n[run ${runId} finished: ${status.status}]\n`));
      return;
    }
    await new Promise((res) => setTimeout(res, interval));
  }
}
