import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { api, ApiError } from '../src/lib/api.js';

// Pin the contract from backlog/03-cli-runner.md:64 — `uploadToSignedUrl`
// must forward every header the API returned in `uploadHeaders`, while
// keeping a sensible `content-type` default when the API does not specify
// one. Storage backends like S3 or GCS reject the PUT if a signed
// `x-amz-*` header is missing or if `content-type` differs from the value
// the URL was signed with.

interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: NodeJS.Dict<string | string[]>;
  body: Buffer;
}

let server: http.Server;
let baseUrl: string;
let captured: CapturedRequest | undefined;
let nextStatus = 200;

beforeEach(async () => {
  captured = undefined;
  nextStatus = 200;
  server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      captured = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks),
      };
      res.statusCode = nextStatus;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/upload/sub-1`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe('api.uploadToSignedUrl — uploadHeaders forwarding', () => {
  it('forwards every API-returned header on the PUT', async () => {
    await api.uploadToSignedUrl(baseUrl, Buffer.from('hello'), {
      'x-rc-submission-id': 'sub-1',
      'x-amz-server-side-encryption': 'AES256',
      'x-amz-meta-foo': 'bar',
    });
    expect(captured?.method).toBe('PUT');
    expect(captured?.headers['x-rc-submission-id']).toBe('sub-1');
    expect(captured?.headers['x-amz-server-side-encryption']).toBe('AES256');
    expect(captured?.headers['x-amz-meta-foo']).toBe('bar');
    expect(captured?.body.toString()).toBe('hello');
  });

  it('keeps the default octet-stream content-type when none is supplied', async () => {
    await api.uploadToSignedUrl(baseUrl, Buffer.from('x'), {
      'x-rc-submission-id': 'sub-1',
    });
    expect(captured?.headers['content-type']).toBe('application/octet-stream');
  });

  it('lets the API override content-type case-insensitively', async () => {
    await api.uploadToSignedUrl(baseUrl, Buffer.from('x'), {
      'Content-Type': 'application/x-tar',
      'x-rc-submission-id': 'sub-1',
    });
    // The API-supplied value wins; the default must not shadow it.
    const ct = captured?.headers['content-type'];
    expect(ct).toBe('application/x-tar');
  });

  it('still works without uploadHeaders (back-compat call signature)', async () => {
    await api.uploadToSignedUrl(baseUrl, Buffer.from('x'));
    expect(captured?.headers['content-type']).toBe('application/octet-stream');
    expect(captured?.method).toBe('PUT');
  });

  it('throws ApiError("upload_failed") on a 4xx storage response', async () => {
    nextStatus = 403;
    await expect(
      api.uploadToSignedUrl(baseUrl, Buffer.from('x'), { 'x-rc-submission-id': 'sub-1' }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
