// Edge-safe NextAuth config. Imported by both `auth.ts` (which adds the
// PrismaAdapter for full Node usage) and `middleware.ts` (which runs on the
// Edge runtime and cannot import Node-only modules — Prisma, `node:crypto`,
// or anything reachable through `@researchcrafters/db`).
//
// Keep this file free of Node-only imports. Provider OAuth clients are fine;
// adapters and the Prisma client are NOT.

import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { isAlphaAccessAllowed } from "./lib/alpha-allowlist";

const githubClientId = process.env["GITHUB_OAUTH_CLIENT_ID"];
const githubClientSecret = process.env["GITHUB_OAUTH_CLIENT_SECRET"];

const providers: NextAuthConfig["providers"] = [];

if (githubClientId && githubClientSecret) {
  providers.push(
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
      // Request the user's primary email so the alpha-allowlist gate can
      // match against it even when the public GitHub profile email is null.
      authorization: { params: { scope: "read:user user:email" } },
    }),
  );
}

export const authConfig = {
  providers,
  pages: {
    signIn: "/login",
  },
  trustHost: true,
  callbacks: {
    // Alpha access gate. `ALPHA_ACCESS_ALLOWLIST` (comma- or newline-separated
    // emails) is the manual access list for the alpha cohort. When the env
    // var is unset/empty the gate is OFF — every authenticated user passes
    // — so local dev and pre-alpha environments are unaffected. Returning
    // `false` redirects the user back to `/login?error=AccessDenied`, where
    // the page surfaces a friendly explainer.
    signIn({ user, profile }) {
      const email =
        user?.email ??
        (profile && typeof profile === "object"
          ? ((profile as { email?: string | null }).email ?? null)
          : null);
      return isAlphaAccessAllowed(email);
    },
  },
} satisfies NextAuthConfig;
