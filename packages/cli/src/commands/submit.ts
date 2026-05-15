import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import kleur from 'kleur';
import fg from 'fast-glob';
import { api } from '../lib/api.js';
import { errors } from '../lib/error-ux.js';
import { isLoggedIn, readProjectConfig, setProjectConfig } from '../lib/config.js';
import type { LocalProjectConfig } from '../lib/config.js';

const DENY_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/dist/**',
  '**/.cache/**',
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/.researchcrafters/**',
];

export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const SUBMIT_DENY_PATTERNS = DENY_PATTERNS;

export interface SubmitResult {
  submissionId: string;
  bundleSha256: string;
  bundleSizeBytes: number;
  fileCount: number;
}

async function loadProjectConfig(cwd: string): Promise<LocalProjectConfig> {
  try {
    return await readProjectConfig(cwd);
  } catch {
    throw errors.noProjectConfig();
  }
}

interface BundleEntry {
  rel: string;
  size: number;
  data: Buffer;
}

export async function collectFiles(cwd: string): Promise<BundleEntry[]> {
  const entries = await fg(['**/*'], {
    cwd,
    onlyFiles: true,
    dot: true,
    ignore: DENY_PATTERNS,
    followSymbolicLinks: false,
  });
  entries.sort();
  if (entries.length > MAX_FILES) {
    throw new Error(`Submission has ${entries.length} files; max is ${MAX_FILES}.`);
  }
  const out: BundleEntry[] = [];
  let total = 0;
  for (const rel of entries) {
    const abs = path.join(cwd, rel);
    const data = await fs.readFile(abs);
    if (data.length > MAX_FILE_BYTES) {
      throw new Error(`File ${rel} exceeds per-file limit (${MAX_FILE_BYTES} bytes).`);
    }
    total += data.length;
    if (total > MAX_BYTES) {
      throw new Error(`Submission bundle exceeds ${MAX_BYTES} bytes.`);
    }
    out.push({ rel, size: data.length, data });
  }
  return out;
}

function buildBundle(entries: BundleEntry[]): Buffer {
  const header = entries.map((e) => `${e.rel}\t${e.size}`).join('\n');
  const headerBuf = Buffer.from(header + '\n---\n', 'utf8');
  return Buffer.concat([headerBuf, ...entries.map((e) => e.data)]);
}

export async function submitCommand(opts: { cwd?: string } = {}): Promise<SubmitResult> {
  if (!isLoggedIn()) throw errors.notLoggedIn();
  const cwd = opts.cwd ?? process.cwd();
  const cfg = await loadProjectConfig(cwd);

  process.stdout.write(kleur.dim('Collecting submission files...\n'));
  const entries = await collectFiles(cwd);
  const bundle = buildBundle(entries);
  const sha = createHash('sha256').update(bundle).digest('hex');

  process.stdout.write(
    kleur.dim(`Bundle: ${entries.length} files, ${bundle.length} bytes, sha256=${sha.slice(0, 12)}...\n`),
  );

  const init = await api.initSubmission({
    packageVersionId: cfg.packageVersionId,
    stageRef: cfg.stageRef,
    fileCount: entries.length,
    byteSize: bundle.length,
    sha256: sha,
  });
  await api.uploadToSignedUrl(init.uploadUrl, bundle, init.uploadHeaders);
  const finalize = await api.finalizeSubmission(init.submissionId, {
    uploadedSha256: sha,
    uploadedBytes: bundle.length,
  });

  // Persist the runId in the workspace config so `researchcrafters status`
  // can fetch and render the latest run. Surface a friendly hint pointing the
  // learner at the right next-step command.
  try {
    await setProjectConfig({ lastRunId: finalize.runId }, cwd);
  } catch {
    // Best-effort: a stale workspace shouldn't fail the whole submission.
  }

  process.stdout.write(kleur.green(`Submitted. id=${init.submissionId}\n`));
  process.stdout.write(
    `${kleur.bold('Run id:')} ${finalize.runId} ${kleur.dim('— track with `researchcrafters status`')}\n`,
  );
  return {
    submissionId: init.submissionId,
    bundleSha256: sha,
    bundleSizeBytes: bundle.length,
    fileCount: entries.length,
  };
}
