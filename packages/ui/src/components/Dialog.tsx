"use client";

import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * Dialog — wraps Radix Dialog with token-driven styles. Composed by
 * `PaywallModal` and any other modal surface in the app.
 *
 * Animation budget: opacity-only, 180ms — no decorative scale or slide.
 */

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogPortal = RadixDialog.Portal;
export const DialogClose = RadixDialog.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(function DialogOverlay({ className, ...rest }, ref) {
  return (
    <RadixDialog.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 bg-black/40 transition-opacity duration-[--duration-rc-base]",
        className,
      )}
      {...rest}
    />
  );
});

export interface DialogContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RadixDialog.Content>, "title"> {
  /** Render the close button in the top-right (default true). */
  showCloseButton?: boolean;
  /** Visible label for the dialog; required for a11y. */
  title?: React.ReactNode;
  description?: React.ReactNode;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, showCloseButton = true, title, description, ...rest },
  ref,
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <RadixDialog.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          "w-[min(92vw,520px)] max-h-[85vh] overflow-auto",
          "rounded-[--radius-rc-lg] border border-[--color-rc-border] bg-[--color-rc-bg] text-[--color-rc-text]",
          "shadow-lg p-5",
          className,
        )}
        {...rest}
      >
        {title ? (
          <RadixDialog.Title className="text-[--text-rc-lg] font-semibold mb-1">
            {title}
          </RadixDialog.Title>
        ) : null}
        {description ? (
          <RadixDialog.Description className="text-[--text-rc-sm] text-[--color-rc-text-muted] mb-3">
            {description}
          </RadixDialog.Description>
        ) : null}
        {children}
        {showCloseButton ? (
          <RadixDialog.Close
            aria-label="Close"
            className="absolute top-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-[--radius-rc-sm] text-[--color-rc-text-muted] hover:bg-[--color-rc-surface-muted]"
          >
            <X size={16} aria-hidden />
          </RadixDialog.Close>
        ) : null}
      </RadixDialog.Content>
    </DialogPortal>
  );
});
