import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * Button — primary, secondary, ghost, danger; sizes sm/md/lg.
 *
 * Tokens used: --color-rc-accent, --color-rc-on-accent, --color-rc-border,
 * --color-rc-danger, --radius-rc-md, --duration-rc-fast.
 *
 * Anti-patterns:
 * - No floating CTAs that obscure work areas (`docs/FRONTEND.md`).
 * - No decorative animation; transitions only on state change.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[--color-rc-accent] text-[--color-rc-on-accent] hover:bg-[--color-rc-accent-hover] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--color-rc-accent]",
  secondary:
    "bg-[--color-rc-surface] text-[--color-rc-text] border border-[--color-rc-border] hover:bg-[--color-rc-surface-muted]",
  ghost:
    "bg-transparent text-[--color-rc-text] hover:bg-[--color-rc-surface-muted]",
  danger:
    "bg-[--color-rc-danger] text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--color-rc-danger]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 px-2 text-[--text-rc-sm] gap-1",
  md: "h-9 px-3 text-[--text-rc-base] gap-1.5",
  lg: "h-11 px-4 text-[--text-rc-md] gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render a leading icon. Use lucide-react icons at 16px. */
  leadingIcon?: React.ReactNode;
  /** Render a trailing icon. */
  trailingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      leadingIcon,
      trailingIcon,
      className,
      type = "button",
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-[--radius-rc-md] font-medium transition-colors duration-[--duration-rc-fast] disabled:opacity-50 disabled:cursor-not-allowed",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...rest}
      >
        {leadingIcon ? (
          <span aria-hidden className="inline-flex">
            {leadingIcon}
          </span>
        ) : null}
        <span>{children}</span>
        {trailingIcon ? (
          <span aria-hidden className="inline-flex">
            {trailingIcon}
          </span>
        ) : null}
      </button>
    );
  },
);
