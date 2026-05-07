import type { ReactElement } from "react";
import { signOut } from "@/auth";

// Server component. Renders a single-button form whose action is the
// NextAuth `signOut` server action. After sign-out we redirect to the
// catalog so the user lands somewhere intentional.

export const metadata = {
  title: "Sign out — ResearchCrafters",
};

async function signOutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/" });
}

export default function LogoutPage(): ReactElement {
  return (
    <main className="rc-page rc-page--logout">
      <header className="rc-band">
        <h1>Sign out</h1>
        <p>Confirm to end your ResearchCrafters session on this device.</p>
      </header>

      <section className="rc-band">
        <form action={signOutAction}>
          <button type="submit" className="rc-button rc-button--primary">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
