import { NextResponse } from "next/server";
import {
  cliVersionResponseSchema,
  MIN_CLI_VERSION,
} from "@/lib/api-contract";

export const runtime = "nodejs";

/**
 * GET /api/cli/version
 *
 * Public, unauthenticated endpoint used by the CLI on every command to compare
 * its own version against the floor the server is willing to accept. The
 * payload shape lives in `lib/api-contract.ts`; bumping `MIN_CLI_VERSION`
 * there forces older CLIs to surface the upgrade-required UX.
 */
export async function GET(): Promise<NextResponse> {
  const body = cliVersionResponseSchema.parse({
    minCliVersion: MIN_CLI_VERSION,
  });
  return NextResponse.json(body);
}
