import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from '../src/lib/config.js';

vi.mock('../src/lib/config.js', async () => {
  const actual = await vi.importActual<typeof ConfigModule>(
    '../src/lib/config.js',
  );
  return {
    ...actual,
    isLoggedIn: () => true,
  };
});

const initMock = vi.fn();
const uploadMock = vi.fn();
const finalizeMock = vi.fn();

vi.mock('../src/lib/api.js', () => ({
  api: {
    initSubmission: (...args: unknown[]) => initMock(...args),
    uploadToSignedUrl: (...args: unknown[]) => uploadMock(...args),
    finalizeSubmission: (...args: unknown[]) => finalizeMock(...args),
  },
}));

import { submitCommand } from '../src/commands/submit.js';
import { PROJECT_CONFIG_PATH } from '../src/lib/config.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rc-submit-headers-'));
  const cfgPath = path.join(tmp, PROJECT_CONFIG_PATH);
  await fs.mkdir(path.dirname(cfgPath), { recursive: true });
  await fs.writeFile(
    cfgPath,
    JSON.stringify({
      apiUrl: 'https://example.invalid',
      packageSlug: 'pkg',
      packageVersionId: 'pv-1',
      stageRef: 'stage-1',
    }) + '\n',
    'utf8',
  );
  await fs.writeFile(path.join(tmp, 'main.py'), 'print(1)\n');
  initMock.mockReset();
  uploadMock.mockReset();
  finalizeMock.mockReset();
  initMock.mockResolvedValue({
    submissionId: 'sub-1',
    uploadUrl: 'https://example.invalid/upload',
    uploadHeaders: {
      'x-rc-submission-id': 'sub-1',
      'x-amz-signature': 'sig',
    },
  });
  finalizeMock.mockResolvedValue({ runId: 'run-1' });
  uploadMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('submitCommand — signed upload headers', () => {
  it('forwards uploadHeaders from initSubmission to uploadToSignedUrl', async () => {
    await submitCommand({ cwd: tmp });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [url, body, headers] = uploadMock.mock.calls[0];
    expect(url).toBe('https://example.invalid/upload');
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(headers).toEqual({
      'x-rc-submission-id': 'sub-1',
      'x-amz-signature': 'sig',
    });
  });
});
