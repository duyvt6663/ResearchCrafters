"use client";

import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "../lib/cn.js";

/**
 * Tooltip — wraps Radix Tooltip. Required for icon-only buttons per the
 * accessibility checklist in `docs/FRONTEND.md` section 17.
 */

export const TooltipProvider = RadixTooltip.Provider;
export const TooltipRoot = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof RadixTooltip.Content> {}

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof RadixTooltip.Content>,
  TooltipContentProps
>(function TooltipContent({ className, sideOffset = 6, ...rest }, ref) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-bg) px-2 py-1 text-(--text-rc-xs) text-(--color-rc-text) shadow-md",
          className,
        )}
        {...rest}
      />
    </RadixTooltip.Portal>
  );
});

/**
 * Convenience: render a tooltip-wrapped trigger in one call.
 */
export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delayDuration?: number;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({
  content,
  children,
  delayDuration = 200,
  side = "top",
}: TooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
