import type { ReactElement } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ErrorPanel } from "@researchcrafters/ui/components";
import { getSession } from "@/lib/auth";

type Params = { slug: string };

/**
 * /packages/[slug]/start — server-side enrollment kickoff.
 *
 * Behavior:
 *   1. If unauthenticated, redirect to /login?next=/packages/{slug}/start so
 *      the learner returns here after sign-in.
 *   2. POST to /api/packages/{slug}/enroll on behalf of the user (forwarding
 *      the inbound cookie so the route's getSession() resolves).
 *   3. On success, redirect to /enrollments/{id}/stages/{firstStageRef}.
 *   4. On error, render a graceful error panel using the shared ErrorPanel.
 *      We re-use the runner-offline copy slot because (a) we are forbidden
 *      from touching @researchcrafters/ui/copy in this workstream and (b) it
 *      conveys the right "service is reachable but enrollment didn't take —
 *      try again" signal for the few well-known failure modes (network,
 *      forbidden, 5xx). The dedicated "enrollment_failed" copy lands with the
 *      copy-library workstream.
 */
export default async function StartEnrollmentPage({
  params,
}: {
  params: Promise<Params>;
}): Promise<ReactElement> {
  const { slug } = await params;

  const session = await getSession();
  if (!session.userId) {
    redirect(`/login?next=/packages/${slug}/start`);
  }

  // Build an absolute URL to the local enrollment endpoint. We forward the
  // cookie header so getSession() in the route handler resolves to the same
  // user. `headers()` is async in Next 15.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const cookie = requestHeaders.get("cookie") ?? "";

  if (!host) {
    return (
      <main className="rc-page rc-page--start">
        <ErrorPanel
          kind="generic"
          title="Could not start the package"
          body="We couldn't determine the request origin while enrolling. Please retry from the package page."
          cta="Back to package"
          retryHref={`/packages/${slug}`}
        />
      </main>
    );
  }

  const url = `${proto}://${host}/api/packages/${slug}/enroll`;
  let firstStageRef: string | null = null;
  let enrollmentId: string | null = null;
  let errorDetails: string | undefined;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      // Internal call; the enrollment API requires no body today.
      body: "{}",
      cache: "no-store",
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        enrollment?: {
          id?: string;
          activeStageRef?: string | null;
        };
      };
      enrollmentId = payload.enrollment?.id ?? null;
      firstStageRef = payload.enrollment?.activeStageRef ?? null;
    } else {
      const text = await response.text();
      errorDetails = `HTTP ${response.status}: ${text.slice(0, 200)}`;
    }
  } catch (err) {
    errorDetails = err instanceof Error ? err.message : String(err);
  }

  if (enrollmentId && firstStageRef) {
    redirect(`/enrollments/${enrollmentId}/stages/${firstStageRef}`);
  }

  return (
    <main className="rc-page rc-page--start">
      <ErrorPanel
        kind="generic"
        title="Could not start the package"
        body="Enrollment didn't complete. The service may be briefly unavailable, or your session may have expired. Try again from the package page."
        cta="Back to package"
        retryHref={`/packages/${slug}`}
        details={errorDetails}
      />
    </main>
  );
}
