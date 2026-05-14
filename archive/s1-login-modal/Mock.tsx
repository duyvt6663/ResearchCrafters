"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogContent,
} from "@researchcrafters/ui/components";

/**
 * S1 — Login Modal mock.
 *
 * Demonstrates two surfaces over a shared `LoginForm` body:
 *  - Modal: opened from a faux PackageCard "Start package" CTA. Header
 *    surfaces the package title so the learner doesn't lose context.
 *  - Page fallback: same form, more spacious container, used for direct
 *    /login visits and shared links.
 *
 * No real auth: providers stub a 900ms delay and console.info. Email/
 * password validates locally to exercise the inline error band.
 */

const PACKAGE_TITLE = "ResNets from scratch";
const PACKAGE_NEXT = "/packages/resnet/start";

type Surface = "modal" | "page";

export function Mock(): React.ReactElement {
  const [surface, setSurface] = React.useState<Surface>("modal");
  const [open, setOpen] = React.useState(false);
  const [hasNext, setHasNext] = React.useState(true);

  return (
    <div
      className="flex flex-col gap-5 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-5"
      data-rc-experiment="s1-login-modal"
    >
      <ReviewerToolbar
        surface={surface}
        onSurfaceChange={setSurface}
        hasNext={hasNext}
        onHasNextChange={setHasNext}
      />

      <FauxPackageCard
        onStart={() => {
          if (surface === "modal") setOpen(true);
        }}
        ctaLabel={surface === "modal" ? "Start package" : "Start package →"}
      />

      {surface === "modal" ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            title={
              <span>
                Sign in to start{" "}
                <span className="text-(--color-rc-accent)">{PACKAGE_TITLE}</span>
              </span>
            }
            description={
              hasNext
                ? "We'll bring you straight to the first stage after sign-in."
                : "Sign in to continue."
            }
          >
            <LoginForm
              context="modal"
              onSubmitSuccess={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      ) : (
        <PageFallback packageTitle={hasNext ? PACKAGE_TITLE : null} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reviewer toolbar — not part of the proposal; lets reviewers toggle the
// surface and the `?next=` state without leaving the experiment URL.
// ---------------------------------------------------------------------------

function ReviewerToolbar({
  surface,
  onSurfaceChange,
  hasNext,
  onHasNextChange,
}: {
  surface: Surface;
  onSurfaceChange: (s: Surface) => void;
  hasNext: boolean;
  onHasNextChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-rc-sm) border border-dashed border-(--color-rc-border) bg-(--color-rc-surface) px-3 py-2">
      <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
        Reviewer controls · not part of the proposal
      </span>
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedToggle
          label="View as"
          value={surface}
          onChange={onSurfaceChange}
          options={[
            { value: "modal", label: "Modal" },
            { value: "page", label: "Page" },
          ]}
        />
        <label className="flex items-center gap-2 text-(--text-rc-xs) text-(--color-rc-text-muted)">
          <input
            type="checkbox"
            checked={hasNext}
            onChange={(e) => onHasNextChange(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <code className="font-(--font-rc-mono)">?next={hasNext ? PACKAGE_NEXT : "(none)"}</code>
        </label>
      </div>
    </div>
  );
}

function SegmentedToggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
        {label}:
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex overflow-hidden rounded-(--radius-rc-sm) border border-(--color-rc-border)"
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={
                "px-2.5 py-1 text-(--text-rc-xs) transition-colors duration-(--duration-rc-fast) " +
                (active
                  ? "bg-(--color-rc-accent) text-(--color-rc-on-accent)"
                  : "bg-(--color-rc-bg) text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted)")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Faux package card — a stand-in for `PackageCard` so the mock proves the
// transition from "I clicked Start" to "I see the auth surface" without
// pulling in the production card's real props.
// ---------------------------------------------------------------------------

function FauxPackageCard({
  onStart,
  ctaLabel,
}: {
  onStart: () => void;
  ctaLabel: string;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-surface) p-4">
      <div className="flex flex-col gap-1.5">
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Package · coding
        </span>
        <h3 className="text-(--text-rc-lg) font-semibold text-(--color-rc-text)">
          {PACKAGE_TITLE}
        </h3>
        <p className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
          Build a residual block, train it on CIFAR-10, and explain why the
          identity shortcut lets you stack 56 layers without training error
          climbing.
        </p>
      </div>
      <Button variant="primary" size="md" onClick={onStart}>
        {ctaLabel}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoginForm — the shared body. Same component is rendered inside the
// Dialog and inside the page-fallback container; only the wrapping
// chrome differs.
// ---------------------------------------------------------------------------

type Provider = "github" | "google" | "credentials";

function LoginForm({
  context,
  onSubmitSuccess,
}: {
  context: "modal" | "page";
  onSubmitSuccess?: () => void;
}): React.ReactElement {
  const [pending, setPending] = React.useState<Provider | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showCredentials, setShowCredentials] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const emailRef = React.useRef<HTMLInputElement>(null);

  const stubProvider = React.useCallback(
    async (provider: Provider) => {
      setError(null);
      setPending(provider);
      // eslint-disable-next-line no-console
      console.info(`[s1-login-modal] stub signIn(${provider})`);
      await new Promise((r) => setTimeout(r, 900));
      setPending(null);
      onSubmitSuccess?.();
    },
    [onSubmitSuccess],
  );

  const onCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter your email to continue.");
      emailRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    void stubProvider("credentials");
  };

  const anyPending = pending !== null;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <div
          role="alert"
          className="rounded-(--radius-rc-sm) border border-(--color-rc-danger) bg-(--color-rc-danger)/10 px-3 py-2 text-(--text-rc-sm) text-(--color-rc-danger)"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <ProviderButton
          provider="github"
          variant="primary"
          pending={pending === "github"}
          disabled={anyPending}
          onClick={() => void stubProvider("github")}
        />
        <ProviderButton
          provider="google"
          variant="secondary"
          pending={pending === "google"}
          disabled={anyPending}
          onClick={() => void stubProvider("google")}
        />
      </div>

      <Divider label="or" />

      <button
        type="button"
        onClick={() => setShowCredentials((v) => !v)}
        aria-expanded={showCredentials}
        className="inline-flex items-center justify-between gap-2 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-3 py-2 text-(--text-rc-sm) text-(--color-rc-text) hover:bg-(--color-rc-surface-muted)"
      >
        <span>More ways to sign in</span>
        <Chevron open={showCredentials} />
      </button>

      {showCredentials ? (
        <form onSubmit={onCredentialsSubmit} className="flex flex-col gap-2.5 pt-1">
          <Field
            id={`s1-${context}-email`}
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            inputRef={emailRef}
            disabled={anyPending}
          />
          <Field
            id={`s1-${context}-password`}
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            disabled={anyPending}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={anyPending}
          >
            {pending === "credentials" ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : null}

      <p className="pt-1 text-(--text-rc-xs) text-(--color-rc-text-subtle)">
        New here? An account is created automatically the first time you sign
        in with GitHub or Google.
      </p>
    </div>
  );
}

function ProviderButton({
  provider,
  variant,
  pending,
  disabled,
  onClick,
}: {
  provider: Provider;
  variant: "primary" | "secondary";
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}): React.ReactElement {
  const label = providerLabel(provider, pending);
  return (
    <Button
      variant={variant}
      size="lg"
      onClick={onClick}
      disabled={disabled}
      leadingIcon={
        pending ? <Spinner /> : <ProviderIcon provider={provider} />
      }
      className="justify-start"
    >
      {label}
    </Button>
  );
}

function providerLabel(provider: Provider, pending: boolean): string {
  if (provider === "credentials") return pending ? "Signing in…" : "Sign in";
  const name = provider === "github" ? "GitHub" : "Google";
  return pending ? `Redirecting to ${name}…` : `Continue with ${name}`;
}

function ProviderIcon({ provider }: { provider: Provider }): React.ReactElement {
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
  if (provider === "google") {
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
  return <span aria-hidden />;
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
  label,
  type,
  value,
  onChange,
  autoComplete,
  inputRef,
  disabled,
}: {
  id: string;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
        {label}
      </span>
      <input
        id={id}
        ref={inputRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        className="rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-2.5 py-2 text-(--text-rc-sm) text-(--color-rc-text) outline-none focus-visible:border-(--color-rc-accent) focus-visible:ring-2 focus-visible:ring-(--color-rc-accent) disabled:opacity-60"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Page fallback — what `/login` renders directly. Same LoginForm body, more
// breathing room, and an explicit acknowledgement that the user came from
// somewhere.
// ---------------------------------------------------------------------------

function PageFallback({
  packageTitle,
}: {
  packageTitle: string | null;
}): React.ReactElement {
  return (
    <div className="rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-surface) p-1">
      <div className="flex flex-col items-center gap-5 px-6 py-10">
        <div className="flex w-full max-w-[420px] flex-col gap-2 text-center">
          <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
            ResearchCrafters
          </span>
          <h2 className="text-(--text-rc-xl) font-semibold text-(--color-rc-text)">
            Sign in
          </h2>
          {packageTitle ? (
            <p className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
              You'll come back to{" "}
              <span className="text-(--color-rc-text)">{packageTitle}</span>{" "}
              after signing in.
            </p>
          ) : (
            <p className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
              Pick up where you left off.
            </p>
          )}
        </div>

        <div className="w-full max-w-[420px]">
          <LoginForm context="page" />
        </div>

        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="text-(--text-rc-xs) text-(--color-rc-text-muted) underline-offset-4 hover:underline"
        >
          {packageTitle ? "Back to where you were" : "Back to catalog"}
        </a>
      </div>
    </div>
  );
}
