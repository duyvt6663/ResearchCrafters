import type { ReactElement } from "react";
import { signIn } from "@/auth";

// Server component. Renders the GitHub OAuth button as a server-action form
// so the entire flow runs without client-side JS. Email magic-link is
// declared in the auth config but is not yet wired to a transactional email
// service — we render a disabled placeholder with a hint.

export const metadata = {
  title: "Sign in — ResearchCrafters",
};

async function signInWithGithub(): Promise<void> {
  "use server";
  await signIn("github", { redirectTo: "/" });
}

export default function LoginPage(): ReactElement {
  return (
    <main className="rc-page rc-page--login">
      <header className="rc-band">
        <h1>Sign in</h1>
        <p>
          Sign in with GitHub to enroll in a package and pick up where you
          left off.
        </p>
      </header>

      <section className="rc-band">
        <form action={signInWithGithub}>
          <button type="submit" className="rc-button rc-button--primary">
            Sign in with GitHub
          </button>
        </form>
      </section>

      <section className="rc-band">
        <h2>Email magic-link</h2>
        <p>Magic-link login is coming. For now, please use GitHub.</p>
        <form>
          <label htmlFor="rc-login-email">Email</label>
          <input
            id="rc-login-email"
            type="email"
            placeholder="you@example.com"
            disabled
            aria-describedby="rc-login-email-hint"
          />
          <p id="rc-login-email-hint" className="rc-hint">
            Magic-link login is coming.
          </p>
        </form>
      </section>
    </main>
  );
}
