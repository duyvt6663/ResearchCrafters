import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// Hard caps for a downloaded starter bundle. They mirror the submission
// limits in `commands/submit.ts` (50MB total, 5000 files, 5MB per file) so
// a hostile or accidentally large bundle can't blow up a learner's disk.
export const STARTER_MAX_BYTES = 50 * 1024 * 1024;
export const STARTER_MAX_FILES = 5000;
export const STARTER_MAX_FILE_BYTES = 5 * 1024 * 1024;

interface TarEntry {
  name: string;
  type: 'file' | 'directory' | 'other';
  size: number;
  data: Buffer; // empty for non-files
}

/**
 * Parse a USTAR / GNU-tar / PAX byte stream into entries. Only handles the
 * subset we need for starter workspaces: regular files and directories with
 * USTAR `prefix` joining, GNU long-name (`L`) records, and PAX extended
 * headers (`x`/`g`) whose `path=` field overrides the entry name. Hardlinks,
 * symlinks, and device nodes are surfaced as `type: 'other'` so the caller
 * can skip them — we never materialize special files from an untrusted
 * bundle.
 */
function parseTar(buf: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pendingLongName: string | null = null;
  let pendingPaxPath: string | null = null;

  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    // End-of-archive: a zero block. Stop on the first one — GNU tar pads to
    // two but we don't need to validate that.
    if (header.every((b) => b === 0)) break;

    const rawName = readString(header, 0, 100);
    const sizeOctal = readString(header, 124, 12);
    const typeflag = String.fromCharCode(header[156] ?? 0);
    const magic = readString(header, 257, 6);
    const prefix = readString(header, 345, 155);

    const size = parseOctal(sizeOctal);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    const blockEnd = dataStart + roundUp512(size);
    if (dataEnd > buf.length) {
      throw new Error('Truncated tar: entry data extends past buffer end.');
    }
    const data = buf.subarray(dataStart, dataEnd);

    // GNU long-name record — its data is the name of the *next* entry.
    if (typeflag === 'L') {
      pendingLongName = data.toString('utf8').replace(/\0+$/u, '');
      offset = blockEnd;
      continue;
    }
    // PAX extended (per-file 'x', global 'g'). Parse `path=` for long names.
    if (typeflag === 'x' || typeflag === 'g') {
      const paxPath = parsePaxPath(data);
      if (typeflag === 'x' && paxPath) pendingPaxPath = paxPath;
      offset = blockEnd;
      continue;
    }

    let name = rawName;
    if (magic.startsWith('ustar') && prefix.length > 0) {
      name = `${prefix}/${rawName}`;
    }
    if (pendingLongName) {
      name = pendingLongName;
      pendingLongName = null;
    }
    if (pendingPaxPath) {
      name = pendingPaxPath;
      pendingPaxPath = null;
    }

    let type: TarEntry['type'] = 'other';
    if (typeflag === '0' || typeflag === '\0') type = 'file';
    else if (typeflag === '5') type = 'directory';

    entries.push({ name, type, size, data: type === 'file' ? Buffer.from(data) : Buffer.alloc(0) });
    offset = blockEnd;
  }

  return entries;
}

function readString(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? len : nul).toString('utf8');
}

function parseOctal(s: string): number {
  const trimmed = s.replace(/[\s\0]+$/u, '').trim();
  if (trimmed.length === 0) return 0;
  const n = parseInt(trimmed, 8);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid tar size field: "${s}"`);
  }
  return n;
}

function roundUp512(n: number): number {
  const rem = n % 512;
  return rem === 0 ? n : n + (512 - rem);
}

function parsePaxPath(data: Buffer): string | null {
  // PAX records are `<len> <key>=<value>\n` repeated.
  const text = data.toString('utf8');
  let i = 0;
  while (i < text.length) {
    const sp = text.indexOf(' ', i);
    if (sp === -1) break;
    const recLen = parseInt(text.slice(i, sp), 10);
    if (!Number.isFinite(recLen) || recLen <= 0) break;
    const rec = text.slice(sp + 1, i + recLen - 1); // strip trailing \n
    const eq = rec.indexOf('=');
    if (eq !== -1 && rec.slice(0, eq) === 'path') {
      return rec.slice(eq + 1);
    }
    i += recLen;
  }
  return null;
}

/**
 * Normalize a tar entry name and reject anything that would escape `root`
 * (absolute paths, `..` segments) or contain NUL bytes. Returns the safe
 * relative POSIX path, or `null` if the entry must be skipped.
 */
export function safeEntryPath(name: string): string | null {
  if (!name || name.includes('\0')) return null;
  // Strip a leading "./" and any duplicate slashes; reject absolute / drive
  // paths and `..` segments outright rather than trying to fix them up.
  const n = name.replace(/^\.\//u, '').replace(/\\/gu, '/');
  while (n.startsWith('/')) return null;
  if (/^[A-Za-z]:/u.test(n)) return null;
  const segments = n.split('/').filter((s) => s.length > 0 && s !== '.');
  if (segments.some((s) => s === '..')) return null;
  if (segments.length === 0) return null;
  return segments.join('/');
}

export interface ExtractResult {
  fileCount: number;
  byteCount: number;
}

/**
 * Decompress a gzipped tar buffer and materialize it under `destDir`.
 *
 * Enforces total/per-file/file-count caps and refuses any entry that would
 * resolve outside `destDir`. The caller is expected to guarantee `destDir`
 * exists; nested directories inside the archive are created on demand.
 *
 * Hardlinks, symlinks, and device entries are silently skipped — we never
 * materialize them from an untrusted bundle. Only regular files and
 * directories land on disk.
 */
export async function extractStarterTarGz(
  bundle: Buffer,
  destDir: string,
): Promise<ExtractResult> {
  const tar = gunzipSync(bundle);
  const entries = parseTar(tar);

  let fileCount = 0;
  let byteCount = 0;
  const absDest = path.resolve(destDir);

  for (const entry of entries) {
    const rel = safeEntryPath(entry.name);
    if (!rel) continue; // unsafe path — skip silently
    const abs = path.resolve(absDest, rel);
    // Defense in depth: the resolved path must remain inside destDir.
    if (abs !== absDest && !abs.startsWith(absDest + path.sep)) continue;

    if (entry.type === 'directory') {
      await fs.mkdir(abs, { recursive: true });
      continue;
    }
    if (entry.type !== 'file') continue;

    if (entry.size > STARTER_MAX_FILE_BYTES) {
      throw new Error(
        `Starter bundle file "${rel}" exceeds per-file limit (${STARTER_MAX_FILE_BYTES} bytes).`,
      );
    }
    byteCount += entry.size;
    if (byteCount > STARTER_MAX_BYTES) {
      throw new Error(`Starter bundle exceeds total size limit (${STARTER_MAX_BYTES} bytes).`);
    }
    fileCount += 1;
    if (fileCount > STARTER_MAX_FILES) {
      throw new Error(`Starter bundle exceeds file count limit (${STARTER_MAX_FILES}).`);
    }

    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, entry.data);
  }

  return { fileCount, byteCount };
}
