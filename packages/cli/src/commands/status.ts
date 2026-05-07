import kleur from 'kleur';
import { api, ApiError } from '../lib/api.js';
import type { RunStatusResponse } from '../lib/api.js';
import { errors } from '../lib/error-ux.js';
import {
  formatPackageDisplay,
  isLoggedIn,
  readProjectConfig,
} from '../lib/config.js';
import type { LocalProjectConfig } from '../lib/config.js';

/**
 * Format an ISO timestamp as a short relative phrase like `2m ago`. Returns
 * `--` when the input is missing/invalid. Kept ASCII-only so the CLI stays
 * portable across terminals that don't render unicode well.
 */
export function relativeTime(iso?: string | null, now: number = Date.now()): string {
  if (!iso) return '--';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '--';
  const diffMs = now - t;
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const sec = Math.round(abs / 1000);
  if (sec < 5) return future ? 'just now' : 'just now';
  if (sec < 60) return future ? `in ${sec}s` : `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return future ? `in ${hr}h` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return future ? `in ${day}d` : `${day}d ago`;
}

export interface StatusRenderOptions {
  /** Override clock for tests. */
  now?: number;
}

/**
 * Pure render path used by tests. Given a project config and an optional run
 * status, returns the lines that `statusCommand` writes to stdout. Keeping
 * this function side-effect-free lets the slug-doubling regression be pinned
 * with a string-equality assertion.
 */
export function renderStatus(
  cfg: LocalProjectConfig,
  run?: RunStatusResponse | null,
  opts: StatusRenderOptions = {},
): string[] {
  const lines: string[] = [];
  const display = formatPackageDisplay(cfg);
  lines.push(`${kleur.bold('Package:')} ${display}`);
  lines.push(`${kleur.bold('Stage:')}   ${cfg.stageRef}`);
  lines.push(`${kleur.bold('API:')}     ${cfg.apiUrl}`);
  if (!cfg.lastRunId) {
    lines.push(
      `${kleur.dim('No runs yet — submit your work with `researchcrafters submit`.')}`,
    );
    return lines;
  }
  lines.push(`${kleur.bold('Last run:')} ${cfg.lastRunId}`);
  if (run) {
    lines.push(`${kleur.bold('  Status:')}    ${run.status}`);
    if (run.executionStatus) {
      lines.push(`${kleur.bold('  Execution:')} ${run.executionStatus}`);
    }
    if (run.startedAt) {
      lines.push(
        `${kleur.bold('  Started:')}   ${run.startedAt} (${relativeTime(run.startedAt, opts.now)})`,
      );
    }
    if (run.finishedAt) {
      lines.push(
        `${kleur.bold('  Finished:')}  ${run.finishedAt} (${relativeTime(run.finishedAt, opts.now)})`,
      );
    }
    if (run.logUrl) {
      lines.push(`${kleur.bold('  Logs:')}      ${run.logUrl}`);
    }
  }
  return lines;
}

export async function statusCommand(opts: { cwd?: string } = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  let cfg: LocalProjectConfig;
  try {
    cfg = await readProjectConfig(cwd);
  } catch {
    throw errors.noProjectConfig();
  }

  let run: RunStatusResponse | null = null;
  if (cfg.lastRunId && isLoggedIn()) {
    try {
      run = await api.getRunStatus(cfg.lastRunId);
    } catch (e) {
      // Surface the failure as a dim notice but keep rendering the cached
      // workspace state — `status` should never error out just because the
      // server is unreachable. The rendered run id alone is still useful.
      const msg = e instanceof ApiError ? `HTTP ${e.status} ${e.code}` : (e as Error).message;
      run = null;
      process.stderr.write(
        kleur.yellow(`warn: could not fetch run status (${msg})\n`),
      );
    }
  }

  for (const line of renderStatus(cfg, run)) {
    process.stdout.write(line + '\n');
  }
}
