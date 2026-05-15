import { describe, expect, it } from 'vitest';
import {
  MODE_CAPS,
  NetworkPolicyNotSupportedError,
  ResourceLimitError,
  resolveStageLimits,
} from '../src/limits.js';

const baseResources = { cpu: 1, memory_mb: 512, wall_clock_seconds: 30 };

describe('resolveStageLimits', () => {
  it('falls back to global resources when the stage omits overrides', () => {
    const out = resolveStageLimits('test', { mode: 'test', command: 'echo hi' }, baseResources);
    expect(out).toEqual({
      cpu: 1,
      memoryMb: 512,
      wallClockSeconds: 30,
      maxUploadBytes: MODE_CAPS.test.maxUploadBytes,
      network: 'none',
    });
  });

  it('clamps test/replay overrides to MVP ceilings', () => {
    const overrides = { mode: 'test' as const, command: 'pytest', cpu: 99, memory_mb: 999_999, wall_clock_seconds: 99_999 };
    const test = resolveStageLimits('test', overrides, baseResources);
    expect(test.cpu).toBe(MODE_CAPS.test.cpu);
    expect(test.memoryMb).toBe(MODE_CAPS.test.memoryMb);
    expect(test.wallClockSeconds).toBe(MODE_CAPS.test.wallClockSeconds);

    const replay = resolveStageLimits('replay', { ...overrides, mode: 'replay' }, baseResources);
    expect(replay.cpu).toBe(MODE_CAPS.replay.cpu);
    expect(replay.memoryMb).toBe(MODE_CAPS.replay.memoryMb);
    expect(replay.wallClockSeconds).toBe(MODE_CAPS.replay.wallClockSeconds);
  });

  it('clamps mini_experiment to its larger ceiling', () => {
    const overrides = {
      mode: 'mini_experiment' as const,
      command: 'python run.py',
      cpu: 99,
      memory_mb: 999_999,
      wall_clock_seconds: 99_999,
    };
    const mini = resolveStageLimits('mini_experiment', overrides, baseResources);
    expect(mini.cpu).toBe(MODE_CAPS.mini_experiment.cpu);
    expect(mini.memoryMb).toBe(MODE_CAPS.mini_experiment.memoryMb);
    expect(mini.wallClockSeconds).toBe(MODE_CAPS.mini_experiment.wallClockSeconds);
  });

  it('rejects non-positive or non-finite resource numbers', () => {
    expect(() =>
      resolveStageLimits('test', { mode: 'test', command: 'x' }, { ...baseResources, cpu: 0 }),
    ).toThrow(ResourceLimitError);
    expect(() =>
      resolveStageLimits('test', { mode: 'test', command: 'x' }, { ...baseResources, memory_mb: -1 }),
    ).toThrow(ResourceLimitError);
    expect(() =>
      resolveStageLimits('test', { mode: 'test', command: 'x' }, {
        ...baseResources,
        wall_clock_seconds: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(ResourceLimitError);
  });

  it("defaults network to 'none' and refuses 'restricted'", () => {
    const out = resolveStageLimits('test', { mode: 'test', command: 'x' }, baseResources);
    expect(out.network).toBe('none');

    expect(() =>
      resolveStageLimits('test', { mode: 'test', command: 'x' }, baseResources, 'restricted'),
    ).toThrow(NetworkPolicyNotSupportedError);
  });
});
