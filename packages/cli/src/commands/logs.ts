import kleur from 'kleur';
import { api, type RunLogLine } from '../lib/api.js';
import { isLoggedIn } from '../lib/config.js';
import { errors } from '../lib/error-ux.js';

interface LogsOptions {
  follow?: boolean;
  pollIntervalMs?: number;
  maxPolls?: number;
}

function formatLine(line: RunLogLine): string {
  return `[${line.ts}] ${line.severity.toUpperCase()} ${line.text}`;
}

export async function logsCommand(runId: string, opts: LogsOptions = {}): Promise<void> {
  if (!isLoggedIn()) throw errors.notLoggedIn();
  if (!opts.follow) {
    const out = await api.getRunLogs(runId);
    for (const line of out.lines) {
      process.stdout.write(formatLine(line) + '\n');
    }
    return;
  }
  const interval = opts.pollIntervalMs ?? 2000;
  const max = opts.maxPolls ?? Number.MAX_SAFE_INTEGER;
  let cursor: string | undefined = undefined;
  for (let i = 0; i < max; i += 1) {
    const out = await api.getRunLogs(runId, cursor);
    for (const line of out.lines) {
      process.stdout.write(formatLine(line) + '\n');
    }
    if (out.nextCursor && out.nextCursor !== cursor) {
      cursor = out.nextCursor;
    }
    const status = await api.getRunStatus(runId);
    if (status.status !== 'queued' && status.status !== 'running') {
      process.stdout.write(kleur.dim(`\n[run ${runId} finished: ${status.status}]\n`));
      return;
    }
    await new Promise((res) => setTimeout(res, interval));
  }
}
