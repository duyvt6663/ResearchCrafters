"use client";

import * as React from "react";

export interface PricingCtaProps {
  slug: string;
  cta: "buy" | "waitlist";
  monthlyUsd?: number;
  /** Pre-resolved label for the buy CTA, e.g. "Buy — $19/month". */
  buyLabel: string;
  /** Pre-resolved label for the waitlist CTA, e.g. "Join the waitlist". */
  waitlistLabel: string;
  /** Server action invoked when the learner taps "Join the waitlist". */
  onJoinWaitlist: () => Promise<void>;
}

const BUTTON_CLASSES =
  "inline-flex w-full items-center justify-center rounded-(--radius-rc-md) " +
  "bg-(--color-rc-accent) px-4 py-2.5 text-(--text-rc-sm) font-semibold " +
  "text-(--color-rc-on-accent) transition-colors duration-(--duration-rc-fast) " +
  "hover:bg-(--color-rc-accent-hover) " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function PricingCta({
  slug,
  cta,
  monthlyUsd,
  buyLabel,
  waitlistLabel,
  onJoinWaitlist,
}: PricingCtaProps): React.ReactElement {
  const [pending, startTransition] = React.useTransition();
  const [joined, setJoined] = React.useState(false);

  if (cta === "buy") {
    const price = typeof monthlyUsd === "number" && monthlyUsd > 0 ? monthlyUsd : null;
    return (
      <div className="flex flex-col gap-3" data-testid="pricing-cta-buy">
        {price !== null ? (
          <div className="flex items-baseline gap-1">
            <span className="text-(--text-rc-xl) font-bold text-(--color-rc-text)">
              ${price}
            </span>
            <span className="text-(--text-rc-sm) text-(--color-rc-text-muted)">
              /month
            </span>
          </div>
        ) : null}
        <p className="text-(--text-rc-xs) leading-relaxed text-(--color-rc-text-muted)">
          Free preview included — pay to unlock every stage, mentor feedback,
          and run history.
        </p>
        <a
          href={`/packages/${slug}/start`}
          className={BUTTON_CLASSES}
          data-cta="buy"
        >
          {buyLabel}
        </a>
      </div>
    );
  }

  if (joined) {
    return (
      <div
        className={
          "rounded-(--radius-rc-md) border border-(--color-rc-success)/30 " +
          "bg-(--color-rc-success-subtle) px-4 py-3 text-(--text-rc-sm) " +
          "text-(--color-rc-success)"
        }
        role="status"
        data-testid="pricing-cta-waitlist-thanks"
      >
        Thanks — we'll let you know when this package opens.
      </div>
    );
  }

  return (
    <form
      data-testid="pricing-cta-waitlist"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await onJoinWaitlist();
          setJoined(true);
        });
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-(--text-rc-xs) leading-relaxed text-(--color-rc-text-muted)">
        Not live yet — join the waitlist and we'll email you when it opens.
      </p>
      <button
        type="submit"
        className={BUTTON_CLASSES}
        data-cta="waitlist"
        disabled={pending}
        aria-disabled={pending || undefined}
        // The slug is included for testing parity with server-action wiring.
        data-slug={slug}
      >
        {pending ? "Joining…" : waitlistLabel}
      </button>
    </form>
  );
}
