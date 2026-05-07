import { describe, expect, it } from 'vitest';
import { redact, findRedactionEvidence } from '../src/redaction.js';

describe('redact', () => {
  it('returns input unchanged when no targets', () => {
    const result = redact('hello world', []);
    expect(result.text).toBe('hello world');
    expect(result.triggered).toBe(false);
    expect(result.matchedTargets).toEqual([]);
  });

  it('replaces literal targets with [redacted] (case-insensitive)', () => {
    const result = redact('the canonical solution is here', ['canonical solution']);
    expect(result.text).toBe('the [redacted] is here');
    expect(result.triggered).toBe(true);
    expect(result.matchedTargets).toEqual(['canonical solution']);
  });

  it('matches mixed case', () => {
    const result = redact('CANONICAL Solution leak', ['canonical solution']);
    expect(result.triggered).toBe(true);
    expect(result.text).toContain('[redacted]');
  });

  it('supports glob patterns with *', () => {
    const result = redact('answer key 42 found', ['answer key *']);
    expect(result.triggered).toBe(true);
    expect(result.text).toContain('[redacted]');
  });

  it('supports ? wildcard for single char', () => {
    const result = redact('S001 secret S00X', ['S00?']);
    expect(result.triggered).toBe(true);
    expect(result.text).not.toContain('S001');
  });

  it('records all matched targets when multiple fire', () => {
    const result = redact('foo bar baz', ['foo', 'baz']);
    expect(result.matchedTargets).toEqual(['foo', 'baz']);
  });

  it('skips empty targets', () => {
    const result = redact('hello', ['', 'world']);
    expect(result.triggered).toBe(false);
  });
});

describe('findRedactionEvidence', () => {
  it('returns matched substrings without modifying text', () => {
    const evidence = findRedactionEvidence(
      'the answer is 42 and the canonical thing',
      ['canonical', 'answer is *'],
    );
    expect(evidence.length).toBeGreaterThan(0);
  });

  it('returns empty for clean text', () => {
    expect(findRedactionEvidence('clean text', ['secret'])).toEqual([]);
  });
});
