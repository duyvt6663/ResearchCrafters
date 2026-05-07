// NextAuth v5 (Auth.js) configuration.
//
// We use the database session strategy backed by `@auth/prisma-adapter` and
// the workspace-shared Prisma client. Providers:
//   - GitHub OAuth (read env GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET).
//   - Email magic-link is intentionally not registered yet — Auth.js v5's
//     email provider requires `nodemailer` as a peer dependency, and we are
//     forbidden from introducing additional top-level deps. The login page
//     surfaces a disabled Email field with a "coming soon" hint and the
//     server-side wiring lands with the email-service workstream.
//
// Per repo policy this module is the single source for auth: pages, route
// handlers, and middleware should import { auth, signIn, signOut, handlers }
// from here.
//
// TODO: wire to email service (Resend / Postmark / SES) and register the
// Email provider once the SMTP / API config is available.

import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@researchcrafters/db";

const githubClientId = process.env["GITHUB_OAUTH_CLIENT_ID"];
const githubClientSecret = process.env["GITHUB_OAUTH_CLIENT_SECRET"];

// Build the providers list lazily so missing env vars don't blow up boot —
// the platform should still serve unauthenticated routes when GitHub secrets
// are absent (e.g. in CI / typecheck-only environments).
const providers: NextAuthConfig["providers"] = [];

if (githubClientId && githubClientSecret) {
  providers.push(
    GitHub({
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers,
  pages: {
    signIn: "/login",
  },
  // Trust the host header in dev so the local Next.js server boots without
  // requiring AUTH_TRUST_HOST=true to be set in the environment.
  trustHost: true,
});
