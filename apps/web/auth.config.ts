// Edge-safe NextAuth config. Imported by both `auth.ts` (which adds the
// PrismaAdapter for full Node usage) and `middleware.ts` (which runs on the
// Edge runtime and cannot import Node-only modules — Prisma, `node:crypto`,
// or anything reachable through `@researchcrafters/db`).
//
// Keep this file free of Node-only imports. Provider OAuth clients are fine;
// adapters and the Prisma client are NOT.

import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

const githubClientId = process.env["GITHUB_OAUTH_CLIENT_ID"];
const githubClientSecret = process.env["GITHUB_OAUTH_CLIENT_SECRET"];

const providers: NextAuthConfig["providers"] = [];

if (githubClientId && githubClientSecret) {
  providers.push(
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    }),
  );
}

export const authConfig = {
  providers,
  pages: {
    signIn: "/login",
  },
  trustHost: true,
} satisfies NextAuthConfig;
