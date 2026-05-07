import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  generatePublicSlug,
  runShareCardRender,
  type ShareCardPrisma,
} from '../src/jobs/share-card-render.js';
import {
  _resetTelemetryForTests,
  initTelemetry,
  setEventStoreForTests,
} from '@researchcrafters/telemetry';

interface FakeRow {
  id: string;
  userId: string;
  enrollmentId: string;
  packageVersionId: string;
  publicSlug: string | null;
}

function makePrisma(initial: FakeRow): {
  prisma: ShareCardPrisma;
  state: { row: FakeRow; updates: number };
} {
  const state = { row: { ...initial }, updates: 0 };
  const prisma: ShareCardPrisma = {
    shareCard: {
      async findUnique({ where }) {
        return where.id === state.row.id ? state.row : null;
      },
      async update({ where, data }) {
        if (where.id !== state.row.id) {
          throw new Error('row not found');
        }
        state.updates += 1;
        state.row = { ...state.row, publicSlug: data.publicSlug };
        return state.row;
      },
    },
  };
  return { prisma, state };
}

describe('generatePublicSlug', () => {
  it('produces a 12-char base32 string', () => {
    const slug = generatePublicSlug();
    expect(slug).toHaveLength(12);
    expect(slug).toMatch(/^[a-z2-7]+$/);
  });

  it('is deterministic given a deterministic rng', () => {
    const rng = {
      randomBytes: (n: number) => new Uint8Array(n).fill(0),
    };
    expect(generatePublicSlug(rng)).toBe('aaaaaaaaaaaa');
  });
});

describe('runShareCardRender', () => {
  beforeEach(() => {
    _resetTelemetryForTests();
    setEventStoreForTests({
      event: {
        async create() {
          return undefined;
        },
      },
    });
    initTelemetry({});
  });

  afterEach(() => {
    _resetTelemetryForTests();
    setEventStoreForTests(null);
  });

  it('generates and persists a public slug exactly once', async () => {
    const { prisma, state } = makePrisma({
      id: 'sc_1',
      userId: 'u_1',
      enrollmentId: 'enr_1',
      packageVersionId: 'pv_1',
      publicSlug: null,
    });

    const result = await runShareCardRender({ shareCardId: 'sc_1' }, prisma);

    expect(result.generated).toBe(true);
    expect(result.publicSlug).toMatch(/^[a-z2-7]{12}$/);
    expect(state.updates).toBe(1);
    expect(state.row.publicSlug).toBe(result.publicSlug);
  });

  it('is idempotent — re-running on a card that already has a slug does not regenerate', async () => {
    const { prisma, state } = makePrisma({
      id: 'sc_1',
      userId: 'u_1',
      enrollmentId: 'enr_1',
      packageVersionId: 'pv_1',
      publicSlug: 'existingslug',
    });

    const result = await runShareCardRender({ shareCardId: 'sc_1' }, prisma);

    expect(result.generated).toBe(false);
    expect(result.publicSlug).toBe('existingslug');
    expect(state.updates).toBe(0);
  });

  it('throws when share card does not exist', async () => {
    const { prisma } = makePrisma({
      id: 'sc_1',
      userId: 'u_1',
      enrollmentId: 'enr_1',
      packageVersionId: 'pv_1',
      publicSlug: null,
    });

    await expect(
      runShareCardRender({ shareCardId: 'unknown' }, prisma),
    ).rejects.toThrow(/not found/i);
  });
});
