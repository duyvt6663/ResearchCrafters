"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./Button.js";
import { cn } from "../lib/cn.js";

/**
 * LoginForm — provider buttons + collapsed credentials field, shared by the
 * standalone `/login` page and `LoginModal`.
 *
 * OAuth providers run via `<form action={serverAction}>` so Next's framework
 * handles the redirect natively. Wrapping the call in a client-side
 * `try/catch` swallows the `NEXT_REDIRECT` throw and the navigation never
 * fires — see https://authjs.dev/getting-started/authentication/oauth.
 *
 * Today only GitHub is wired (see `apps/web/auth.ts`); Google + email
 * password render as visibly disabled with a `Coming soon` hint until their
 * backends land. To enable: drop the `disabled` flags by passing real
 * server-action handlers through `onGoogleSignIn` / `onCredentialsSubmit`.
 */

export type CredentialsServerAction = (
  formData: FormData,
) => void | Promise<void>;

export interface LoginFormProps {
  /** Server action: invoked when the user clicks "Continue with GitHub". */
  onGithubSignIn: () => void | Promise<void>;
  /** Optional Google handler. Omit to render the button as disabled. */
  onGoogleSignIn?: () => void | Promise<void>;
  /** Optional credentials handler. Receives FormData with `email` + `password`. */
  onCredentialsSubmit?: CredentialsServerAction;
  /** Override the "Coming soon" hint shown on disabled providers. */
  disabledHint?: string;
  className?: string;
}

export function LoginForm({
  onGithubSignIn,
  onGoogleSignIn,
  onCredentialsSubmit,
  disabledHint = "Coming soon",
  className,
}: LoginFormProps): React.ReactElement {
  const [showCredentials, setShowCredentials] = React.useState(false);
  const googleEnabled = Boolean(onGoogleSignIn);
  const credentialsEnabled = Boolean(onCredentialsSubmit);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-2">
        <form action={onGithubSignIn}>
          <ProviderSubmit provider="github" variant="primary" />
        </form>
        {googleEnabled && onGoogleSignIn ? (
          <form action={onGoogleSignIn}>
            <ProviderSubmit provider="google" variant="secondary" />
          </form>
        ) : (
          <DisabledProvider provider="google" hint={disabledHint} />
        )}
      </div>

      <Divider label="or" />

      <button
        type="button"
        onClick={() => setShowCredentials((v) => !v)}
        aria-expanded={showCredentials}
        className="inline-flex items-center justify-between gap-2 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-3 py-2 text-(--text-rc-sm) text-(--color-rc-text) hover:bg-(--color-rc-surface-muted)"
      >
        <span>
          More ways to sign in
          {!credentialsEnabled ? (
            <span className="ml-2 font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
              {disabledHint}
            </span>
          ) : null}
        </span>
        <Chevron open={showCredentials} />
      </button>

      {showCredentials ? (
        credentialsEnabled && onCredentialsSubmit ? (
          <CredentialsForm action={onCredentialsSubmit} />
        ) : (
          <DisabledCredentialsForm />
        )
      ) : null}

      <p className="pt-1 text-(--text-rc-xs) text-(--color-rc-text-subtle)">
        New here? An account is created automatically the first time you sign
        in with a supported provider.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OAuth provider buttons — submit-typed inside their own <form> so Next's
// framework owns the redirect.
// ---------------------------------------------------------------------------

function ProviderSubmit({
  provider,
  variant,
}: {
  provider: "github" | "google";
  variant: "primary" | "secondary";
}): React.ReactElement {
  const { pending } = useFormStatus();
  const name = provider === "github" ? "GitHub" : "Google";
  const label = pending ? `Redirecting to ${name}…` : `Continue with ${name}`;
  return (
    <Button
      type="submit"
      variant={variant}
      size="lg"
      disabled={pending}
      leadingIcon={
        pending ? <Spinner /> : <ProviderIcon provider={provider} />
      }
      className="w-full justify-start"
    >
      {label}
    </Button>
  );
}

function DisabledProvider({
  provider,
  hint,
}: {
  provider: "github" | "google";
  hint: string;
}): React.ReactElement {
  const name = provider === "github" ? "GitHub" : "Google";
  return (
    <Button
      variant="secondary"
      size="lg"
      disabled
      leadingIcon={<ProviderIcon provider={provider} />}
      className="w-full justify-start"
    >
      <span className="flex items-baseline gap-2">
        <span>Continue with {name}</span>
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          {hint}
        </span>
      </span>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Credentials form — same `<form action>` pattern so success can redirect
// without a try/catch swallow. Local validation gates submission via
// `formAction` only firing when fields are valid.
// ---------------------------------------------------------------------------

function CredentialsForm({
  action,
}: {
  action: CredentialsServerAction;
}): React.ReactElement {
  const [clientError, setClientError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    if (!email) {
      e.preventDefault();
      setClientError("Enter your email to continue.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.preventDefault();
      setClientError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      e.preventDefault();
      setClientError("Password must be at least 8 characters.");
      return;
    }
    setClientError(null);
    // Let the form action proceed — Next will handle the redirect.
  };

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={onSubmit}
      className="flex flex-col gap-2.5 pt-1"
    >
      {clientError ? (
        <div
          role="alert"
          className="rounded-(--radius-rc-sm) border border-(--color-rc-danger) bg-(--color-rc-danger)/10 px-3 py-2 text-(--text-rc-sm) text-(--color-rc-danger)"
        >
          {clientError}
        </div>
      ) : null}
      <Field
        id="rc-login-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
      />
      <Field
        id="rc-login-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
      />
      <CredentialsSubmit />
    </form>
  );
}

function CredentialsSubmit(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

function DisabledCredentialsForm(): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <Field
        id="rc-login-email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        disabled
      />
      <Field
        id="rc-login-password"
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        disabled
      />
      <Button type="button" variant="primary" size="md" disabled>
        Sign in
      </Button>
      <p className="text-(--text-rc-xs) text-(--color-rc-text-subtle)">
        Email + password is not yet available. Use GitHub to sign in.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual primitives
// ---------------------------------------------------------------------------

function ProviderIcon({
  provider,
}: {
  provider: "github" | "google";
}): React.ReactElement {
  if (provider === "github") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.38-3.87-1.38-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.05 11.05 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56A10.52 10.52 0 0 0 23.5 12.02C23.5 5.66 18.35.5 12 .5Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.51 5.51 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.65Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.92-2.91l-3.86-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.3v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58V6.61H1.3a11.99 11.99 0 0 0 0 10.78l3.99-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.39 0 3.39 2.65 1.3 6.61l3.99 3.1C6.23 6.86 8.88 4.75 12 4.75Z"
      />
    </svg>
  );
}

function Spinner(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 12 12"
          to="360 12 12"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

function Chevron({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform var(--duration-rc-fast)",
      }}
    >
      <path
        d="M6 9l6 6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Divider({ label }: { label: string }): React.ReactElement {
  return (
    <div
      role="separator"
      className="flex items-center gap-3 py-1 text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)"
    >
      <span aria-hidden className="h-px flex-1 bg-(--color-rc-border)" />
      <span>{label}</span>
      <span aria-hidden className="h-px flex-1 bg-(--color-rc-border)" />
    </div>
  );
}

function Field({
  id,
  name,
  label,
  type,
  autoComplete,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  type: "email" | "password";
  autoComplete: string;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
        {label}
      </span>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        className="rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-2.5 py-2 text-(--text-rc-sm) text-(--color-rc-text) outline-none focus-visible:border-(--color-rc-accent) focus-visible:ring-2 focus-visible:ring-(--color-rc-accent) disabled:opacity-60"
      />
    </label>
  );
}
