// NextAuth v5 catch-all route. The handlers object exposes both GET and POST,
// covering provider sign-in, callback URLs, sign-out, session, csrf, and
// session-management endpoints.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;

export const runtime = "nodejs";
