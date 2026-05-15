import { describe, it, expect } from 'vitest';
import { createProgram } from '../src/index.js';
import {
  renderCompletion,
  isSupportedShell,
  completionCommand,
} from '../src/commands/completion.js';

describe('researchcrafters completion', () => {
  it('isSupportedShell accepts the three supported shells', () => {
    expect(isSupportedShell('bash')).toBe(true);
    expect(isSupportedShell('zsh')).toBe(true);
    expect(isSupportedShell('fish')).toBe(true);
    expect(isSupportedShell('powershell')).toBe(false);
  });

  it('renders a bash completion script including every subcommand', () => {
    const program = createProgram();
    const out = renderCompletion(program, 'bash');
    expect(out).toContain('complete -F _researchcrafters_completion researchcrafters');
    for (const name of ['login', 'logout', 'start', 'test', 'submit', 'status', 'logs', 'validate', 'preview', 'build', 'completion']) {
      expect(out).toContain(name);
    }
  });

  it('renders a zsh completion script with #compdef header', () => {
    const program = createProgram();
    const out = renderCompletion(program, 'zsh');
    expect(out.startsWith('#compdef researchcrafters')).toBe(true);
    expect(out).toContain('_describe');
    expect(out).toContain("'validate:");
  });

  it('renders a fish completion script with per-subcommand completions', () => {
    const program = createProgram();
    const out = renderCompletion(program, 'fish');
    expect(out).toContain('complete -c researchcrafters');
    expect(out).toContain('__fish_use_subcommand');
    expect(out).toContain('__fish_seen_subcommand_from validate');
    expect(out).toContain('-l json');
  });

  it('completionCommand exits non-zero for an unsupported shell', async () => {
    const program = createProgram();
    const prev = process.exitCode;
    const stderr: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;
    try {
      await completionCommand(program, 'powershell');
      expect(process.exitCode).toBe(1);
      expect(stderr.join('')).toMatch(/Unsupported shell/);
    } finally {
      process.stderr.write = orig;
      process.exitCode = prev;
    }
  });
});
