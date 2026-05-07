import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { ZodError} from 'zod';
import { type ZodType } from 'zod';

export class ErpParseError extends Error {
  public readonly filePath: string;
  public readonly issues: unknown;

  constructor(filePath: string, message: string, issues?: unknown) {
    super(message);
    this.name = 'ErpParseError';
    this.filePath = filePath;
    this.issues = issues;
  }
}

export function parseYaml<T>(filePath: string, schema: ZodType<T>): T {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ErpParseError(filePath, `Failed to read ${filePath}: ${reason}`);
  }

  let data: unknown;
  try {
    data = yaml.load(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ErpParseError(filePath, `Failed to parse YAML in ${filePath}: ${reason}`);
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ErpParseError(
      filePath,
      `Schema validation failed for ${filePath}:\n${formatZodError(result.error)}`,
      result.error.issues,
    );
  }
  return result.data;
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
}
