// Stubbed session helper. No real auth provider is wired yet — providers
// (NextAuth, Clerk, GitHub OAuth) will be selected and wired in a later
// workstream. The shape below is the contract every route handler can rely on.

import { cookies } from "next/headers";

export type Session = {
  userId: string | null;
};

const SESSION_COOKIE = "rc_session";

export async function getSession(): Promise<Session> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return { userId: null };
  // Shape: "userId=<id>" — purely a stub format.
  const match = /userId=([^;]+)/.exec(raw);
  return { userId: match?.[1] ?? null };
}
