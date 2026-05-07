// Unit tests for the account-deletion cascade and the account-export shape.
//
// We mock `@researchcrafters/db` with an in-memory store so the cascade and
// export are exercised end-to-end without a live Postgres. The mock
// implements every Prisma model accessor used by `lib/account-cascade.ts`.

import { describe, expect, it, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// In-memory Prisma-like fixture
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { id: string };
type Store = {
  user: Row[];
  session: Row[];
  account: Row[];
  deviceCodeFlow: Row[];
  verificationToken: Row[];
  membership: Row[];
  entitlement: Row[];
  enrollment: Row[];
  stageAttempt: Row[];
  submission: Row[];
  run: Row[];
  grade: Row[];
  mentorThread: Row[];
  mentorMessage: Row[];
  shareCard: Row[];
  nodeTraversal: Row[];
  review: Row[];
  event: Row[];
};

let store: Store;

function createStore(): Store {
  const now = new Date("2026-05-01T00:00:00.000Z");
  return {
    user: [
      {
        id: "u-fixture",
        email: "fixture@researchcrafters.dev",
        githubHandle: "fixture",
        displayName: "Fixture Learner",
        name: "Fixture Learner",
        image: null,
        emailVerified: now,
        createdAt: now,
        updatedAt: now,
      },
    ],
    session: [
      {
        id: "sess-1",
        sessionToken: "tok-1",
        userId: "u-fixture",
        expires: new Date("2026-06-01T00:00:00.000Z"),
      },
    ],
    account: [
      {
        id: "acc-1",
        userId: "u-fixture",
        type: "oauth",
        provider: "github",
        providerAccountId: "fixture-github-id",
      },
    ],
    deviceCodeFlow: [
      {
        id: "dcf-1",
        deviceCode: "dev-code",
        userCode: "ABCD-EFGH",
        userId: "u-fixture",
        state: "approved",
        expiresAt: new Date("2026-05-02T00:00:00.000Z"),
        createdAt: now,
      },
    ],
    verificationToken: [
      {
        // VerificationToken has no `id` column in the schema, but our store
        // models every row as a Row for uniform deleteMany handling. The
        // synthetic id here is never returned to consumers.
        id: "vt-synthetic-1",
        identifier: "fixture@researchcrafters.dev",
        token: "magic-token",
        expires: new Date("2026-05-02T00:00:00.000Z"),
      },
    ],
    membership: [
      {
        id: "m-1",
        userId: "u-fixture",
        plan: "pro",
        status: "active",
        billingRef: "cus_stripe_xxx",
        createdAt: now,
        updatedAt: now,
      },
    ],
    entitlement: [
      {
        id: "ent-1",
        userId: "u-fixture",
        scope: "package",
        packageVersionId: "pv-resnet",
        stageId: null,
        source: "membership",
        expiresAt: null,
        createdAt: now,
      },
    ],
    enrollment: [
      {
        id: "enr-1",
        userId: "u-fixture",
        packageVersionId: "pv-resnet",
        activeStageRef: "S001",
        completedStageRefs: [],
        unlockedNodeRefs: [],
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ],
    stageAttempt: [
      {
        id: "att-1",
        enrollmentId: "enr-1",
        stageRef: "S001",
        answer: { text: "user-authored answer" },
        branchId: null,
        score: null,
        passed: false,
        executionStatus: null,
        gradeId: null,
        createdAt: now,
      },
    ],
    submission: [
      {
        id: "sub-1",
        stageAttemptId: "att-1",
        bundleObjectKey: "submissions/u-fixture/sub-1.zip",
        bundleSha: "sha256:abc",
        byteSize: 1024,
        fileCount: 3,
        createdAt: now,
      },
    ],
    run: [
      {
        id: "run-1",
        submissionId: "sub-1",
        status: "ok",
        runnerMode: "test",
        logObjectKey: "runs/u-fixture/run-1.log",
        metricsJson: null,
        startedAt: now,
        finishedAt: now,
        createdAt: now,
      },
    ],
    grade: [
      {
        id: "grade-1",
        stageAttemptId: "att-1",
        submissionId: "sub-1",
        rubricVersion: "1",
        evaluatorVersion: "1",
        passed: true,
        score: 0.9,
        dimensions: {},
        evidenceRefs: {},
        modelMeta: null,
        history: [],
        createdAt: now,
      },
    ],
    mentorThread: [
      {
        id: "mt-1",
        enrollmentId: "enr-1",
        stageRef: "S001",
        createdAt: now,
      },
    ],
    mentorMessage: [
      {
        id: "mm-1",
        threadId: "mt-1",
        role: "user",
        bodyText: "I am stuck on the residual gradient question",
        modelTier: null,
        modelId: null,
        provider: null,
        promptTokens: null,
        completionTokens: null,
        redactionTriggered: false,
        flagged: false,
        createdAt: now,
      },
    ],
    shareCard: [
      {
        id: "sc-1",
        userId: "u-fixture",
        enrollmentId: "enr-1",
        packageVersionId: "pv-resnet",
        payload: {
          insight: "user-authored insight",
        },
        publicSlug: "fixture-resnet",
        createdAt: now,
      },
    ],
    nodeTraversal: [
      {
        id: "nt-1",
        enrollmentId: "enr-1",
        decisionNodeId: "dn-1",
        branchId: "br-1",
        selectedAt: now,
      },
    ],
    review: [
      {
        id: "rev-1",
        packageVersionId: "pv-resnet",
        reviewerId: "u-fixture",
        status: "approved",
        notes: "looks good",
        createdAt: now,
        updatedAt: now,
      },
    ],
    event: [
      {
        id: "ev-1",
        name: "stage_attempt_submitted",
        userId: "u-fixture",
        packageVersionId: "pv-resnet",
        stageRef: "S001",
        payload: {},
        auditGrade: false,
        createdAt: now,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mock surface
// ---------------------------------------------------------------------------

interface WhereInput {
  id?: string | { in: string[] };
  userId?: string | null;
  reviewerId?: string | null;
  enrollmentId?: string | { in: string[] };
  stageAttemptId?: string | { in: string[] };
  submissionId?: string | { in: string[] };
  threadId?: string | { in: string[] };
  identifier?: string;
}

function matches(row: Row, where: WhereInput): boolean {
  for (const [k, v] of Object.entries(where)) {
    if (v && typeof v === "object" && "in" in (v as Record<string, unknown>)) {
      const arr = (v as { in: string[] }).in;
      if (!arr.includes(String(row[k] ?? ""))) return false;
    } else {
      if (row[k] !== v) return false;
    }
  }
  return true;
}

function makeModel<K extends keyof Store>(key: K) {
  return {
    findUnique: async ({ where }: { where: WhereInput }) =>
      store[key].find((r) => matches(r, where)) ?? null,
    findMany: async ({ where }: { where?: WhereInput } = {}) =>
      where ? store[key].filter((r) => matches(r, where)) : [...store[key]],
    deleteMany: async ({ where }: { where: WhereInput }) => {
      const before = store[key].length;
      store[key] = store[key].filter((r) => !matches(r, where));
      return { count: before - store[key].length };
    },
    update: async ({
      where,
      data,
    }: {
      where: WhereInput;
      data: Record<string, unknown>;
    }) => {
      const row = store[key].find((r) => matches(r, where));
      if (!row) throw new Error(`not found in ${String(key)}`);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: WhereInput;
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const row of store[key]) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    },
  };
}

type TxClient = {
  user: ReturnType<typeof makeModel<"user">>;
  session: ReturnType<typeof makeModel<"session">>;
  account: ReturnType<typeof makeModel<"account">>;
  deviceCodeFlow: ReturnType<typeof makeModel<"deviceCodeFlow">>;
  verificationToken: ReturnType<typeof makeModel<"verificationToken">>;
  membership: ReturnType<typeof makeModel<"membership">>;
  entitlement: ReturnType<typeof makeModel<"entitlement">>;
  enrollment: ReturnType<typeof makeModel<"enrollment">>;
  stageAttempt: ReturnType<typeof makeModel<"stageAttempt">>;
  submission: ReturnType<typeof makeModel<"submission">>;
  run: ReturnType<typeof makeModel<"run">>;
  grade: ReturnType<typeof makeModel<"grade">>;
  mentorThread: ReturnType<typeof makeModel<"mentorThread">>;
  mentorMessage: ReturnType<typeof makeModel<"mentorMessage">>;
  shareCard: ReturnType<typeof makeModel<"shareCard">>;
  nodeTraversal: ReturnType<typeof makeModel<"nodeTraversal">>;
  review: ReturnType<typeof makeModel<"review">>;
  event: ReturnType<typeof makeModel<"event">>;
};

function buildPrismaMock() {
  const tx: TxClient = {
    user: makeModel("user"),
    session: makeModel("session"),
    account: makeModel("account"),
    deviceCodeFlow: makeModel("deviceCodeFlow"),
    verificationToken: makeModel("verificationToken"),
    membership: makeModel("membership"),
    entitlement: makeModel("entitlement"),
    enrollment: makeModel("enrollment"),
    stageAttempt: makeModel("stageAttempt"),
    submission: makeModel("submission"),
    run: makeModel("run"),
    grade: makeModel("grade"),
    mentorThread: makeModel("mentorThread"),
    mentorMessage: makeModel("mentorMessage"),
    shareCard: makeModel("shareCard"),
    nodeTraversal: makeModel("nodeTraversal"),
    review: makeModel("review"),
    event: makeModel("event"),
  };
  return {
    ...tx,
    $transaction: async (
      fn: (tx: TxClient) => Promise<unknown>,
      _opts?: unknown,
    ) => fn(tx),
  };
}

// Hoist the mock so vi.mock sees it.
import { vi } from "vitest";
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: buildPrismaMock(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: mockPrisma,
  withQueryTimeout: async <T>(p: PromiseLike<T>): Promise<T> => await p,
}));

// Import after the mock so the module under test resolves to the mocked db.
import {
  ACCOUNT_DELETE_PLAN,
  anonymizedEmailFor,
  deleteAccount,
  exportAccount,
} from "../account-cascade.js";

beforeEach(() => {
  // Reset the in-memory store between tests, and re-point the hoisted mock
  // at the fresh fixtures.
  store = createStore();
  Object.assign(mockPrisma, buildPrismaMock());
});

// ---------------------------------------------------------------------------
// Plan invariants
// ---------------------------------------------------------------------------

describe("ACCOUNT_DELETE_PLAN", () => {
  it("documents every PII-bearing table in the schema", () => {
    const tables = ACCOUNT_DELETE_PLAN.map((p) => p.table);
    for (const required of [
      "User",
      "Session",
      "Account",
      "DeviceCodeFlow",
      "VerificationToken",
      "Membership",
      "Entitlement",
      "Enrollment",
      "StageAttempt",
      "Submission",
      "Run",
      "Grade",
      "MentorThread",
      "MentorMessage",
      "ShareCard",
      "NodeTraversal",
      "Review",
      "Event",
    ]) {
      expect(tables).toContain(required);
    }
  });

  it("processes the User row last so referenced rows can be anonymized in place", () => {
    expect(ACCOUNT_DELETE_PLAN.at(-1)?.table).toBe("User");
    expect(ACCOUNT_DELETE_PLAN.at(-1)?.strategy).toBe("anonymize");
  });

  it("never silently retains a PII-bearing row without a documented rationale", () => {
    for (const row of ACCOUNT_DELETE_PLAN) {
      expect(row.rationale.length).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

describe("deleteAccount", () => {
  it("removes 'delete' rows, anonymizes the User, and nulls retained FKs", async () => {
    const result = await deleteAccount({ userId: "u-fixture", reason: "user_request" });

    // 'delete' rows are gone.
    expect(store.session).toHaveLength(0);
    expect(store.account).toHaveLength(0);
    expect(store.deviceCodeFlow).toHaveLength(0);
    expect(store.verificationToken).toHaveLength(0);
    expect(store.membership).toHaveLength(0);
    expect(store.entitlement).toHaveLength(0);
    expect(store.run).toHaveLength(0);
    expect(store.grade).toHaveLength(0);
    expect(store.submission).toHaveLength(0);
    expect(store.stageAttempt).toHaveLength(0);
    expect(store.mentorMessage).toHaveLength(0);
    expect(store.mentorThread).toHaveLength(0);
    expect(store.nodeTraversal).toHaveLength(0);
    expect(store.shareCard).toHaveLength(0);
    expect(store.enrollment).toHaveLength(0);

    // 'retain' rows still exist, with their userId-style FK nulled.
    expect(store.event).toHaveLength(1);
    const ev = store.event[0]!;
    expect(ev.userId).toBeNull();
    expect(store.review).toHaveLength(1);
    const rev = store.review[0]!;
    expect(rev.reviewerId).toBeNull();

    // 'anonymize' — User row remains but PII is scrubbed.
    expect(store.user).toHaveLength(1);
    const u = store.user[0]!;
    expect(u.email).toBe(anonymizedEmailFor("u-fixture"));
    expect(u.githubHandle).toBeNull();
    expect(u.displayName).toBeNull();
    expect(u.name).toBeNull();
    expect(u.image).toBeNull();
    expect(u.emailVerified).toBeNull();

    // Result envelope captures per-table counts and the caller's reason.
    expect(result.userId).toBe("u-fixture");
    expect(result.reason).toBe("user_request");
    expect(result.counts.User).toBe(1);
    expect(result.counts.Session).toBe(1);
    expect(result.counts.MentorMessage).toBe(1);
    expect(result.counts.Event).toBe(1);
  });

  it("throws if the user does not exist (so the transaction rolls back)", async () => {
    await expect(
      deleteAccount({ userId: "u-missing" }),
    ).rejects.toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// exportAccount
// ---------------------------------------------------------------------------

describe("exportAccount", () => {
  it("returns every section the contract promises", async () => {
    const out = await exportAccount({ userId: "u-fixture" });
    for (const key of [
      "user",
      "memberships",
      "entitlements",
      "enrollments",
      "attempts",
      "traversals",
      "submissions",
      "runs",
      "grades",
      "mentorThreads",
      "mentorMessages",
      "shareCards",
      "events",
    ] as const) {
      expect(out).toHaveProperty(key);
    }
    expect(out.user?.id).toBe("u-fixture");
    expect(out.memberships).toHaveLength(1);
    expect(out.enrollments).toHaveLength(1);
    expect(out.attempts).toHaveLength(1);
    expect(out.submissions).toHaveLength(1);
    expect(out.runs).toHaveLength(1);
    expect(out.grades).toHaveLength(1);
    expect(out.mentorThreads).toHaveLength(1);
    expect(out.mentorMessages).toHaveLength(1);
    expect(out.shareCards).toHaveLength(1);
    expect(out.events).toHaveLength(1);
  });

  it("is JSON-serializable with no Prisma engine internals", async () => {
    const out = await exportAccount({ userId: "u-fixture" });
    const round = JSON.parse(JSON.stringify(out));
    // Date columns are ISO strings, not Date instances.
    expect(typeof round.user.createdAt).toBe("string");
    expect(typeof round.attempts[0].createdAt).toBe("string");
  });

  it("matches a deterministic snapshot of the export shape", async () => {
    const out = await exportAccount({ userId: "u-fixture" });
    // Strip the dynamic generatedAt so the snapshot is stable.
    const stable = { ...out, generatedAt: "<frozen>" };
    expect(stable).toMatchInlineSnapshot(`
      {
        "attempts": [
          {
            "answer": {
              "text": "user-authored answer",
            },
            "branchId": null,
            "createdAt": "2026-05-01T00:00:00.000Z",
            "enrollmentId": "enr-1",
            "executionStatus": null,
            "gradeId": null,
            "id": "att-1",
            "passed": false,
            "score": null,
            "stageRef": "S001",
          },
        ],
        "enrollments": [
          {
            "activeStageRef": "S001",
            "completedStageRefs": [],
            "createdAt": "2026-05-01T00:00:00.000Z",
            "id": "enr-1",
            "packageVersionId": "pv-resnet",
            "status": "active",
            "unlockedNodeRefs": [],
            "updatedAt": "2026-05-01T00:00:00.000Z",
            "userId": "u-fixture",
          },
        ],
        "entitlements": [
          {
            "createdAt": "2026-05-01T00:00:00.000Z",
            "expiresAt": null,
            "id": "ent-1",
            "packageVersionId": "pv-resnet",
            "scope": "package",
            "source": "membership",
            "stageId": null,
            "userId": "u-fixture",
          },
        ],
        "events": [
          {
            "auditGrade": false,
            "createdAt": "2026-05-01T00:00:00.000Z",
            "id": "ev-1",
            "name": "stage_attempt_submitted",
            "packageVersionId": "pv-resnet",
            "payload": {},
            "stageRef": "S001",
            "userId": "u-fixture",
          },
        ],
        "exportVersion": 1,
        "generatedAt": "<frozen>",
        "grades": [
          {
            "createdAt": "2026-05-01T00:00:00.000Z",
            "dimensions": {},
            "evaluatorVersion": "1",
            "evidenceRefs": {},
            "history": [],
            "id": "grade-1",
            "modelMeta": null,
            "passed": true,
            "rubricVersion": "1",
            "score": 0.9,
            "stageAttemptId": "att-1",
            "submissionId": "sub-1",
          },
        ],
        "memberships": [
          {
            "billingRef": "cus_stripe_xxx",
            "createdAt": "2026-05-01T00:00:00.000Z",
            "id": "m-1",
            "plan": "pro",
            "status": "active",
            "updatedAt": "2026-05-01T00:00:00.000Z",
            "userId": "u-fixture",
          },
        ],
        "mentorMessages": [
          {
            "bodyText": "I am stuck on the residual gradient question",
            "completionTokens": null,
            "createdAt": "2026-05-01T00:00:00.000Z",
            "flagged": false,
            "id": "mm-1",
            "modelId": null,
            "modelTier": null,
            "promptTokens": null,
            "provider": null,
            "redactionTriggered": false,
            "role": "user",
            "threadId": "mt-1",
          },
        ],
        "mentorThreads": [
          {
            "createdAt": "2026-05-01T00:00:00.000Z",
            "enrollmentId": "enr-1",
            "id": "mt-1",
            "stageRef": "S001",
          },
        ],
        "runs": [
          {
            "createdAt": "2026-05-01T00:00:00.000Z",
            "finishedAt": "2026-05-01T00:00:00.000Z",
            "id": "run-1",
            "logObjectKey": "runs/u-fixture/run-1.log",
            "metricsJson": null,
            "runnerMode": "test",
            "startedAt": "2026-05-01T00:00:00.000Z",
            "status": "ok",
            "submissionId": "sub-1",
          },
        ],
        "shareCards": [
          {
            "createdAt": "2026-05-01T00:00:00.000Z",
            "enrollmentId": "enr-1",
            "id": "sc-1",
            "packageVersionId": "pv-resnet",
            "payload": {
              "insight": "user-authored insight",
            },
            "publicSlug": "fixture-resnet",
            "userId": "u-fixture",
          },
        ],
        "submissions": [
          {
            "bundleObjectKey": "submissions/u-fixture/sub-1.zip",
            "bundleSha": "sha256:abc",
            "byteSize": 1024,
            "createdAt": "2026-05-01T00:00:00.000Z",
            "fileCount": 3,
            "id": "sub-1",
            "stageAttemptId": "att-1",
          },
        ],
        "traversals": [
          {
            "branchId": "br-1",
            "decisionNodeId": "dn-1",
            "enrollmentId": "enr-1",
            "id": "nt-1",
            "selectedAt": "2026-05-01T00:00:00.000Z",
          },
        ],
        "user": {
          "createdAt": "2026-05-01T00:00:00.000Z",
          "displayName": "Fixture Learner",
          "email": "fixture@researchcrafters.dev",
          "emailVerified": "2026-05-01T00:00:00.000Z",
          "githubHandle": "fixture",
          "id": "u-fixture",
          "image": null,
          "name": "Fixture Learner",
          "updatedAt": "2026-05-01T00:00:00.000Z",
        },
      }
    `);
  });
});
