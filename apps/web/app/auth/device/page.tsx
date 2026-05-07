import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  ErrorPanel,
} from "@researchcrafters/ui";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
// Device-approval state is stable for at most ~10 minutes; never cache.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Approve device — ResearchCrafters",
};

type SearchParams = Record<string, string | string[] | undefined>;

function pickUserCode(params: SearchParams): string | null {
  const raw = params["user_code"];
  if (typeof raw === "string") return raw.trim() || null;
  if (Array.isArray(raw)) {
    const first = raw[0];
    return typeof first === "string" ? first.trim() || null : null;
  }
  return null;
}

/**
 * Server action posted by the Approve / Deny buttons. We render the same
 * page after mutation so the success/error banner reflects the new state.
 *
 * The decision endpoint is the source of truth for state transitions; this
 * action is a thin wrapper that calls the same handler on the server side
 * (via direct Prisma updates) so the page doesn't depend on a fetch round
 * trip during an SSR render.
 */
async function decideAction(formData: FormData): Promise<void> {
  "use server";
  const userCode = String(formData.get("userCode") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  if (!userCode || (decision !== "approve" && decision !== "deny")) {
    return;
  }

  const session = await getSession();
  if (!session.userId) {
    redirect(
      `/login?next=${encodeURIComponent(`/auth/device?user_code=${userCode}`)}`,
    );
  }

  const flow = await withQueryTimeout(
    prisma.deviceCodeFlow.findUnique({
      where: { userCode },
      select: {
        id: true,
        state: true,
        expiresAt: true,
        consumedAt: true,
      },
    }),
  );
  if (!flow) {
    redirect(`/auth/device?user_code=${userCode}&result=not_found`);
  }

  const now = Date.now();
  const isExpired = flow.expiresAt.getTime() <= now;

  // Already-handled flows are no-ops. Render the page; the page-level lookup
  // will paint the right banner from the persisted state.
  if (flow.state !== "pending" || flow.consumedAt !== null) {
    revalidatePath("/auth/device");
    return;
  }

  if (isExpired) {
    await withQueryTimeout(
      prisma.deviceCodeFlow.update({
        where: { id: flow.id },
        data: { state: "expired" },
      }),
    );
    revalidatePath("/auth/device");
    return;
  }

  const nextState = decision === "approve" ? "approved" : "denied";
  await withQueryTimeout(
    prisma.deviceCodeFlow.update({
      where: { id: flow.id },
      data: { state: nextState, userId: session.userId },
    }),
  );
  revalidatePath("/auth/device");
}

function fingerprintFromUserCode(userCode: string): string {
  // No device fingerprint is collected today — we surface the human-readable
  // user code as the "fingerprint" so the learner can verify the CLI prompt
  // matches the browser prompt. Future iterations can read additional
  // metadata (CLI version, ip prefix, ua) from DeviceCodeFlow.
  return userCode;
}

interface DevicePageProps {
  searchParams?: Promise<SearchParams> | SearchParams;
}

export default async function DeviceApprovalPage({
  searchParams,
}: DevicePageProps): Promise<ReactElement> {
  const params: SearchParams =
    searchParams === undefined
      ? {}
      : "then" in (searchParams as Promise<SearchParams>)
        ? await (searchParams as Promise<SearchParams>)
        : (searchParams as SearchParams);

  const userCode = pickUserCode(params);

  // Pull the live session before doing anything else: unauthenticated visitors
  // are redirected to login with a `next` so they bounce back here.
  const session = await getSession();
  if (!session.userId) {
    const next = userCode
      ? `/auth/device?user_code=${encodeURIComponent(userCode)}`
      : "/auth/device";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (!userCode) {
    return (
      <main className="rc-page rc-page--device-auth mx-auto max-w-xl p-6">
        <ErrorPanel
          kind="generic"
          title="Missing user code"
          body="Open the link printed by the CLI, or paste the user code from `researchcrafters login` into the address bar."
        />
      </main>
    );
  }

  const flow = await withQueryTimeout(
    prisma.deviceCodeFlow.findUnique({
      where: { userCode },
      select: {
        id: true,
        state: true,
        userId: true,
        expiresAt: true,
        consumedAt: true,
        createdAt: true,
      },
    }),
  );

  if (!flow) {
    return (
      <main className="rc-page rc-page--device-auth mx-auto max-w-xl p-6">
        <ErrorPanel
          kind="generic"
          title="Unknown user code"
          body={`No pending device login matched ${userCode}. Re-run \`researchcrafters login\` and try again.`}
        />
      </main>
    );
  }

  const now = Date.now();
  const isExpired = flow.expiresAt.getTime() <= now;
  const fingerprint = fingerprintFromUserCode(userCode);

  if (flow.state === "approved" && flow.consumedAt !== null) {
    return (
      <main className="rc-page rc-page--device-auth mx-auto max-w-xl p-6">
        <Card emphasis="strong">
          <CardHeader>
            <h1 className="text-(--text-rc-md) font-semibold">
              Device already linked
            </h1>
          </CardHeader>
          <CardBody>
            <p>
              The CLI session for <code>{fingerprint}</code> has already been
              issued. You can close this tab.
            </p>
          </CardBody>
        </Card>
      </main>
    );
  }

  if (flow.state === "approved") {
    return (
      <main className="rc-page rc-page--device-auth mx-auto max-w-xl p-6">
        <Card emphasis="strong">
          <CardHeader>
            <h1 className="text-(--text-rc-md) font-semibold">
              Device approved
            </h1>
          </CardHeader>
          <CardBody>
            <p>
              <code>{fingerprint}</code> is approved. Return to the CLI; it will
              finish signing in within a few seconds.
            </p>
          </CardBody>
        </Card>
      </main>
    );
  }

  if (flow.state === "denied") {
    return (
      <main className="rc-page rc-page--device-auth mx-auto max-w-xl p-6">
        <ErrorPanel
          kind="generic"
          title="Device denied"
          body={`You denied the CLI sign-in request for ${fingerprint}. Re-run \`researchcrafters login\` to start a new flow.`}
        />
      </main>
    );
  }

  if (flow.state === "expired" || isExpired) {
    return (
      <main className="rc-page rc-page--device-auth mx-auto max-w-xl p-6">
        <ErrorPanel
          kind="generic"
          title="Device code expired"
          body="This sign-in code has expired. Re-run `researchcrafters login` to issue a new one."
        />
      </main>
    );
  }

  // pending — render the confirmation form.
  return (
    <main className="rc-page rc-page--device-auth mx-auto max-w-xl p-6">
      <Card emphasis="strong">
        <CardHeader>
          <h1 className="text-(--text-rc-md) font-semibold">
            Approve CLI sign-in?
          </h1>
        </CardHeader>
        <CardBody>
          <p className="mb-2">
            A CLI session is asking for permission to sign in as you.
          </p>
          <p className="mb-2">
            Verify the code below matches the one printed by{" "}
            <code>researchcrafters login</code>:
          </p>
          <p className="text-(--text-rc-lg) font-mono tracking-widest">
            {fingerprint}
          </p>
        </CardBody>
        <CardFooter>
          <form action={decideAction} className="flex gap-2">
            <input type="hidden" name="userCode" value={userCode} />
            <Button type="submit" name="decision" value="approve">
              Approve
            </Button>
            <Button
              type="submit"
              variant="secondary"
              name="decision"
              value="deny"
            >
              Deny
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}
