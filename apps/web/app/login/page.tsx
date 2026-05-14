import type { ReactElement } from "react";
import { LoginForm } from "@researchcrafters/ui/components";
import { signIn } from "@/auth";

/**
 * /login — page-fallback surface for sign-in.
 *
 * In-app entry points (e.g. the package overview's "Start package" CTA) open
 * `LoginModal` over the originating page so context isn't lost. This route
 * remains for direct visits and shared `/login?next=…` links. The same
 * `LoginForm` primitive renders in both surfaces, so the visual language
 * stays in lockstep.
 *
 * Today only GitHub is wired (see `apps/web/auth.ts`); Google + email
 * password render as visibly disabled inside `LoginForm` until their
 * backend lands.
 */

export const metadata = {
  title: "Sign in — ResearchCrafters",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

async function signInWithGithubAction(redirectTo: string): Promise<void> {
  "use server";
  await signIn("github", { redirectTo });
}

function safeNext(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps): Promise<ReactElement> {
  const { next } = await searchParams;
  const redirectTo = safeNext(next);

  return (
    <main className="rc-page rc-page--login">
      <div className="mx-auto flex w-full max-w-[480px] flex-col items-center gap-6 px-6 py-16">
        <div className="flex w-full flex-col gap-2 text-center">
          <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
            ResearchCrafters
          </span>
          <h1 className="text-(--text-rc-2xl) font-semibold text-(--color-rc-text)">
            Sign in
          </h1>
          <p className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
            {redirectTo === "/"
              ? "Pick up where you left off."
              : "You'll come back to where you were after signing in."}
          </p>
        </div>

        <div className="w-full rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-surface) p-6">
          <LoginForm
            onGithubSignIn={signInWithGithubAction.bind(null, redirectTo)}
          />
        </div>

        <a
          href="/"
          className="text-(--text-rc-xs) text-(--color-rc-text-muted) underline-offset-4 hover:underline"
        >
          Back to catalog
        </a>
      </div>
    </main>
  );
}
