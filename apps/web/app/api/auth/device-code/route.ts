import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import {
  deviceCodeRequestSchema,
  deviceCodeResponseSchema,
} from "@/lib/api-contract";
import { track } from "@/lib/telemetry";

export const runtime = "nodejs";

const DEVICE_CODE_TTL_SECONDS = 600;
const POLL_INTERVAL_SECONDS = 5;

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function urlSafeRandom(bytes: number): string {
  return randomBytes(bytes)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function generateUserCode(): string {
  // 8 chars total -> "XXXX-XXXX". Reject chars likely to be confused (0/O, 1/I).
  const buf = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    const b = buf[i] ?? 0;
    out += USER_CODE_ALPHABET[b % USER_CODE_ALPHABET.length];
  }
  return `${out.slice(0, 4)}-${out.slice(4, 8)}`;
}

function verificationBaseUrl(): string {
  return (
    process.env["NEXTAUTH_URL"] ??
    process.env["AUTH_URL"] ??
    "http://localhost:3000"
  );
}

/**
 * POST /api/auth/device-code
 *
 * Mints a new device-code flow row. The CLI then polls `/api/auth/device-token`
 * with the returned `deviceCode`, while the learner approves the flow in
 * their browser at `verificationUri` (the page that consumes the userCode is
 * out of scope for this workstream — it's owned by the frontend-boundary
 * agent).
 */
export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = deviceCodeRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", reason: parsed.error.issues },
      { status: 400 },
    );
  }

  const deviceCode = urlSafeRandom(24); // ~32 chars after base64-url encoding
  const userCode = generateUserCode();
  const expiresAt = new Date(Date.now() + DEVICE_CODE_TTL_SECONDS * 1000);

  await withQueryTimeout(
    prisma.deviceCodeFlow.create({
      data: {
        deviceCode,
        userCode,
        state: "pending",
        expiresAt,
      },
      select: { id: true },
    }),
  );

  await track("paywall_viewed", {
    // Reuse an existing telemetry event for now; the dedicated
    // `device_flow_started` event is added when the telemetry workstream
    // extends the discriminated union. The wrapper logs and swallows unknown
    // names, so this is intentionally conservative.
  });

  const base = verificationBaseUrl().replace(/\/$/, "");
  const verificationUri = `${base}/auth/device`;
  const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;

  // TODO(frontend-boundary-agent): render `/auth/device` so the learner can
  // approve this flow in their browser. The page should `POST` an approval
  // action that sets `state = 'approved'` and writes `userId` on the matching
  // DeviceCodeFlow row. Until that page exists, dev callers can use
  // `developer_force_approve` on /api/auth/device-token (NODE_ENV=development
  // only).
  const body = deviceCodeResponseSchema.parse({
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete,
    expiresIn: DEVICE_CODE_TTL_SECONDS,
    interval: POLL_INTERVAL_SECONDS,
  });
  return NextResponse.json(body);
}
