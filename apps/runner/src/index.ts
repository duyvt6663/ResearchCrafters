/**
 * Runner entrypoint. Reads env, starts the BullMQ worker.
 *
 * In MVP this is launched by infra (apps/runner Dockerfile or `pnpm start`).
 * Tests should NEVER import this module — they import `worker.ts`,
 * `sandbox.ts`, and the mode handlers directly.
 */
import { selectSandbox } from './sandbox.js';
import { FilesystemFixtureReader } from './modes/replay.js';
import { startWorker } from './worker.js';

export * from './types.js';
export * from './execution-status.js';
export {
  type Sandbox,
  DockerSandbox,
  FakeSandbox,
  runSandbox,
  sanitizeRunOpts,
  selectSandbox,
} from './sandbox.js';
export {
  LocalFsSandbox,
  LocalFsSandboxConfigError,
  LocalFsSandboxPathError,
  MAX_LOCAL_FS_MEMORY_MB,
  MAX_LOCAL_FS_CPU,
  assertSafeRelativePath,
  readDeclaredOutputs,
} from './sandboxes/local-fs.js';
export {
  runTestMode,
  parseCommand,
} from './modes/test.js';
export {
  runReplayMode,
  verifyFixtures,
  FixtureMismatchError,
  FixtureMissingError,
  FilesystemFixtureReader,
  type FixtureReader,
} from './modes/replay.js';
export {
  runMiniExperimentMode,
  GpuNotAvailableError,
} from './modes/mini-experiment.js';
export { handleJob, startWorker } from './worker.js';
export {
  scrubLogs,
  type ScrubResult,
} from './log-scrub.js';
export {
  stripSecretsFromEnv,
  enforceMaxUploadSize,
  evaluateNetworkPolicy,
  scrubForPersistence,
  isPathInside,
  InMemoryRateLimiter,
  UploadTooLargeError,
  MAX_UPLOAD_BYTES,
  type RateLimiter,
  type NetworkPolicy,
} from './security.js';

/**
 * Launch helper. Real production wiring lives here. The function is async so
 * the bullmq import is lazy.
 */
export async function main(): Promise<void> {
  const queueName = process.env['RUNNER_QUEUE_NAME'] ?? 'submission_run';
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const fixtureRoot = process.env['RUNNER_FIXTURE_ROOT'] ?? process.cwd();

  const sandbox = await selectSandbox();
  const fixtureReader = new FilesystemFixtureReader(fixtureRoot);

  const handle = await startWorker({
    queueName,
    connection: { url: redisUrl },
    deps: {
      sandbox,
      images: {
        test: process.env['RUNNER_IMAGE_TEST'] ?? 'test-image:placeholder',
        replay: process.env['RUNNER_IMAGE_REPLAY'] ?? 'replay-image:placeholder',
        miniExperiment: process.env['RUNNER_IMAGE_MINI'] ?? 'mini-image:placeholder',
      },
      fixtureReader,
    },
  });

  const shutdown = async (): Promise<void> => {
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

// Only run main when this file is the entrypoint, not when imported.
const isEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();
if (isEntry) {
  void main();
}
