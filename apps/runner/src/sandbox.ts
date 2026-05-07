import type { ExecutionStatus } from './types.js';
import { mapExitReason, type SandboxExitReason } from './execution-status.js';
import { stripSecretsFromEnv, type NetworkPolicy } from './security.js';
import { scrubLogs } from './log-scrub.js';

/**
 * Sandbox abstraction. The interface enforces the security posture required
 * by TODOS/03:
 *
 * - read-only base image,
 * - writable workspace mount,
 * - stripped env,
 * - explicit network policy,
 * - cgroup limits (cpu, memory, wall clock),
 * - max upload size.
 *
 * Tests use the abstract interface and never spawn Docker. The
 * `DockerSandbox` implementation throws unless `RUNNER_DOCKER_ENABLED=true`.
 */
export interface SandboxRunOpts {
  /** Image reference (digest preferred). */
  image: string;
  /** Command + args to execute inside the sandbox. */
  command: string[];
  /** Workspace path inside the container; mounted writable. */
  workspacePath: string;
  /** Path to the bundle on the host that should mount as workspace. */
  hostWorkspaceBundle: string;
  /** Resource limits — all enforced via cgroups by the implementation. */
  limits: {
    cpu: number;
    memoryMb: number;
    wallClockSeconds: number;
    maxUploadBytes: number;
  };
  /** Forwarded env. The sandbox WILL re-strip with `stripSecretsFromEnv`. */
  env?: Record<string, string | undefined>;
  /** Network policy. */
  network: NetworkPolicy;
  /**
   * If true, the writable workspace is the only writable mount; the rest of
   * the rootfs is read-only. Sandbox implementations MUST honour this.
   */
  readOnlyRootfs?: boolean;
}

export interface SandboxRunResult {
  exitReason: SandboxExitReason;
  executionStatus: ExecutionStatus;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface Sandbox {
  run(opts: SandboxRunOpts): Promise<SandboxRunResult>;
}

/**
 * Docker sandbox. Implementation is intentionally kept abstract — we DO NOT
 * actually spawn containers in tests. The constructor throws unless
 * `RUNNER_DOCKER_ENABLED=true` so accidentally instantiating it during tests
 * surfaces immediately.
 */
export class DockerSandbox implements Sandbox {
  constructor() {
    if (process.env['RUNNER_DOCKER_ENABLED'] !== 'true') {
      throw new Error(
        'DockerSandbox: RUNNER_DOCKER_ENABLED must be "true" to instantiate. Tests must use a fake Sandbox.',
      );
    }
  }

  async run(_opts: SandboxRunOpts): Promise<SandboxRunResult> {
    // The real implementation calls dockerode here. We deliberately avoid
    // pulling docker into the test path. See TODOS/08 for image setup.
    throw new Error(
      'DockerSandbox.run is not implemented in this scaffold. Wire up dockerode here.',
    );
  }
}

/**
 * Test-only fake sandbox. Tests construct it with a stubbed result.
 */
export class FakeSandbox implements Sandbox {
  constructor(
    private readonly handler: (opts: SandboxRunOpts) => Promise<SandboxRunResult> | SandboxRunResult,
  ) {}

  async run(opts: SandboxRunOpts): Promise<SandboxRunResult> {
    return this.handler(opts);
  }
}

/**
 * Helper that runs `opts.env` through `stripSecretsFromEnv` and returns the
 * cleaned options. All sandbox callers should pipe through here.
 */
export function sanitizeRunOpts(opts: SandboxRunOpts): SandboxRunOpts {
  return {
    ...opts,
    env: stripSecretsFromEnv(opts.env ?? {}),
    readOnlyRootfs: opts.readOnlyRootfs ?? true,
  };
}

/**
 * Convenience helper used by mode handlers. Runs the sandbox, scrubs the
 * stdout/stderr, and translates the exit reason.
 */
export async function runSandbox(
  sandbox: Sandbox,
  opts: SandboxRunOpts,
): Promise<SandboxRunResult & { scrubbed: { stdoutScrubbed: string[]; stderrScrubbed: string[] } }> {
  const result = await sandbox.run(sanitizeRunOpts(opts));
  const stdout = scrubLogs(result.stdout);
  const stderr = scrubLogs(result.stderr);
  return {
    ...result,
    stdout: stdout.text,
    stderr: stderr.text,
    executionStatus: mapExitReason(result.exitReason),
    scrubbed: {
      stdoutScrubbed: stdout.triggered,
      stderrScrubbed: stderr.triggered,
    },
  };
}
