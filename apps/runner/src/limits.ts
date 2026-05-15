import type { RunnerStage, RunnerResources } from '@researchcrafters/erp-schema';
import type { NetworkPolicy } from './security.js';
import type { RunnerMode } from './types.js';

export interface ResolvedLimits {
  cpu: number;
  memoryMb: number;
  wallClockSeconds: number;
  maxUploadBytes: number;
  network: NetworkPolicy;
}

export interface ModeCaps {
  cpu: number;
  memoryMb: number;
  wallClockSeconds: number;
  maxUploadBytes: number;
}

/**
 * MVP resource caps per runner mode. Mode handlers clamp the
 * package-author-supplied values down to these ceilings via
 * {@link resolveStageLimits}; the sandbox layer applies its own defence in
 * depth (LocalFsSandbox hard-errors above its own ceilings, DockerSandbox
 * will translate these into cgroup limits when wired).
 */
export const MODE_CAPS: Readonly<Record<RunnerMode, ModeCaps>> = {
  test: {
    cpu: 2,
    memoryMb: 2048,
    wallClockSeconds: 60,
    maxUploadBytes: 25 * 1024 * 1024,
  },
  replay: {
    cpu: 2,
    memoryMb: 2048,
    wallClockSeconds: 60,
    maxUploadBytes: 25 * 1024 * 1024,
  },
  mini_experiment: {
    cpu: 4,
    memoryMb: 4096,
    wallClockSeconds: 120,
    maxUploadBytes: 25 * 1024 * 1024,
  },
};

export class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceLimitError';
  }
}

export class NetworkPolicyNotSupportedError extends Error {
  constructor(public readonly requested: NetworkPolicy) {
    super(
      `network policy "${requested}" is not supported in the MVP runner; egress is disabled by default until container isolation lands (backlog/03 :101).`,
    );
    this.name = 'NetworkPolicyNotSupportedError';
  }
}

/**
 * Resolve the effective resource limits for a stage run. The package author
 * may set per-stage overrides on `runner.yaml`; if absent we fall back to the
 * global `resources` block. Whatever number reaches us is clamped to the
 * mode's MVP ceiling so a hostile package cannot ask for arbitrary CPU,
 * memory, or wall-clock budgets.
 *
 * Network policy is the bullet-84 default: every mode runs with
 * `network: 'none'`. If `runner.yaml` explicitly requests `'restricted'`,
 * we refuse — production container isolation (cgroups + egress allowlist)
 * is not wired yet, so honouring `'restricted'` would silently allow
 * unrestricted egress.
 */
export function resolveStageLimits(
  mode: RunnerMode,
  runnerStage: Pick<RunnerStage, 'cpu' | 'memory_mb' | 'wall_clock_seconds'>,
  resources: RunnerResources,
  requestedNetwork: NetworkPolicy = 'none',
): ResolvedLimits {
  const caps = MODE_CAPS[mode];
  if (caps === undefined) {
    throw new ResourceLimitError(`unknown runner mode "${String(mode)}"`);
  }

  const requestedCpu = runnerStage.cpu ?? resources.cpu;
  const requestedMemoryMb = runnerStage.memory_mb ?? resources.memory_mb;
  const requestedWallSec = runnerStage.wall_clock_seconds ?? resources.wall_clock_seconds;

  assertPositiveFinite('cpu', requestedCpu);
  assertPositiveFinite('memory_mb', requestedMemoryMb);
  assertPositiveFinite('wall_clock_seconds', requestedWallSec);

  if (requestedNetwork !== 'none') {
    throw new NetworkPolicyNotSupportedError(requestedNetwork);
  }

  return {
    cpu: Math.min(requestedCpu, caps.cpu),
    memoryMb: Math.min(requestedMemoryMb, caps.memoryMb),
    wallClockSeconds: Math.min(requestedWallSec, caps.wallClockSeconds),
    maxUploadBytes: caps.maxUploadBytes,
    network: 'none',
  };
}

function assertPositiveFinite(field: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ResourceLimitError(
      `runner.${field} must be a positive finite number; got ${String(value)}`,
    );
  }
}
