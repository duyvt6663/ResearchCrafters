// NextAuth v5 (Auth.js) — full Node configuration.
//
// We use the database session strategy backed by `@auth/prisma-adapter` and
// the workspace-shared Prisma client. The edge-safe slice (providers, pages,
// trustHost) lives in `./auth.config.ts` and is shared with `middleware.ts`
// so the Edge runtime never has to bundle Prisma or `node:crypto`.
//
// Per repo policy this module is the single source for full-Node auth: pages,
// route handlers, and server components should import
// { auth, signIn, signOut, handlers } from here. Middleware imports the
// edge-safe `authConfig` from `./auth.config` instead.
//
// TODO: wire to email service (Resend / Postmark / SES) and register the
// Email provider once the SMTP / API config is available.

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@researchcrafters/db";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
});
