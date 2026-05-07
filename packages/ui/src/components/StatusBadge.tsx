import * as React from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCw,
  TimerOff,
  CpuIcon,
  Bug,
  TerminalSquare,
  Lock,
  Loader2,
  CheckCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/cn.js";
import { statusPalette, type StatusKey } from "../tokens.js";

/**
 * StatusBadge — single source of truth for the status presentation.
 *
 * Always renders an icon AND a label so we never rely on color alone
 * (anti-pattern check from `docs/FRONTEND.md` accessibility section).
 */
const ICONS: Record<StatusKey, LucideIcon> = {
  pass: CheckCircle2,
  fail: XCircle,
  partial: AlertTriangle,
  retry: RotateCw,
  timeout: TimerOff,
  oom: CpuIcon,
  crash: Bug,
  exit_nonzero: TerminalSquare,
  locked: Lock,
  in_progress: Loader2,
  completed: CheckCheck,
};

const STATUS_CSS_VARS: Record<
  StatusKey,
  { fg: string; bg: string }
> = {
  pass: { fg: "var(--color-rc-success)", bg: "var(--color-rc-success-subtle)" },
  fail: { fg: "var(--color-rc-danger)", bg: "var(--color-rc-danger-subtle)" },
  partial: {
    fg: "var(--color-rc-warning)",
    bg: "var(--color-rc-warning-subtle)",
  },
  retry: {
    fg: "var(--color-rc-warning)",
    bg: "var(--color-rc-warning-subtle)",
  },
  timeout: {
    fg: "var(--color-rc-warning)",
    bg: "var(--color-rc-warning-subtle)",
  },
  oom: { fg: "var(--color-rc-danger)", bg: "var(--color-rc-danger-subtle)" },
  crash: { fg: "var(--color-rc-danger)", bg: "var(--color-rc-danger-subtle)" },
  exit_nonzero: {
    fg: "var(--color-rc-danger)",
    bg: "var(--color-rc-danger-subtle)",
  },
  locked: {
    fg: "var(--color-rc-locked)",
    bg: "var(--color-rc-locked-subtle)",
  },
  in_progress: {
    fg: "var(--color-rc-info)",
    bg: "var(--color-rc-info-subtle)",
  },
  completed: {
    fg: "var(--color-rc-success)",
    bg: "var(--color-rc-success-subtle)",
  },
};

export interface StatusBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Status key from the canonical palette. Defaults to `in_progress`. */
  status?: StatusKey;
  /** Override the default label from `statusPalette[status].label`. */
  label?: string;
  size?: "sm" | "md";
  /**
   * Optional pass-through label content. When provided, overrides both
   * `label` and `statusPalette[status].label`.
   */
  children?: React.ReactNode;
  /**
   * Informational tone hint surfaced in `data-tone` for downstream styling.
   * Does not change the visual palette — those come from `status`.
   */
  tone?: string;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  function StatusBadge(
    {
      status = "in_progress",
      label,
      size = "md",
      className,
      style,
      children,
      tone,
      ...rest
    },
    ref,
  ) {
    const palette = statusPalette[status];
    const Icon = ICONS[status];
    const cssVars = STATUS_CSS_VARS[status];
    const isAnimated = status === "in_progress";
    const content = children ?? label ?? palette.label;
    return (
      <span
        ref={ref}
        role="status"
        {...(tone !== undefined ? { "data-tone": tone } : {})}
        className={cn(
          "inline-flex items-center gap-1 rounded-(--radius-rc-sm) font-medium",
          size === "sm" ? "h-5 px-1.5 text-(--text-rc-xs)" : "h-6 px-2 text-(--text-rc-sm)",
          className,
        )}
        style={{
          color: cssVars.fg,
          backgroundColor: cssVars.bg,
          ...style,
        }}
        {...rest}
      >
        <Icon
          size={size === "sm" ? 12 : 14}
          aria-hidden
          className={isAnimated ? "animate-spin" : undefined}
        />
        <span>{content}</span>
      </span>
    );
  },
);
