"use client";

import * as React from "react";
import { Dialog, DialogContent } from "./Dialog.js";
import { Button } from "./Button.js";
import {
  previewBoundary,
  lockedStage,
  mentorWithoutEntitlement,
  type PaywallCopy,
} from "../copy/paywall.js";

/**
 * PaywallModal — composes Dialog + authored paywall copy + Button.
 *
 * Surface only at natural boundaries (per `docs/FRONTEND.md` section 13 and
 * `backlog/09` Anti-Patterns: never interrupt mid-attempt).
 */
export type PaywallEntryPoint =
  | "previewBoundary"
  | "lockedStage"
  | "mentorWithoutEntitlement";

export interface PaywallModalProps {
  open: boolean;
  entryPoint: PaywallEntryPoint;
  onUpgrade: () => void;
  onClose: () => void;
  packageTitle?: string;
  unlocks?: string[];
}

function copyFor(
  entryPoint: PaywallEntryPoint,
  packageTitle: string | undefined,
  unlocks: string[] | undefined,
): PaywallCopy {
  // exactOptionalPropertyTypes: only include keys when defined.
  const args: { packageTitle?: string; unlocks?: string[] } = {};
  if (packageTitle !== undefined) args.packageTitle = packageTitle;
  if (unlocks !== undefined) args.unlocks = unlocks;
  switch (entryPoint) {
    case "previewBoundary":
      return previewBoundary(args);
    case "lockedStage":
      return lockedStage(args);
    case "mentorWithoutEntitlement":
      return mentorWithoutEntitlement(args);
  }
}

export function PaywallModal({
  open,
  entryPoint,
  onUpgrade,
  onClose,
  packageTitle,
  unlocks,
}: PaywallModalProps) {
  const copy = copyFor(entryPoint, packageTitle, unlocks);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent title={copy.title} description={copy.body}>
        <ul className="my-4 flex flex-col gap-2.5 text-(--text-rc-sm) leading-relaxed text-(--color-rc-text)">
          {copy.bullets.map((line, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden
                className="mt-2 h-1.5 w-1.5 rounded-full bg-(--color-rc-accent) flex-none"
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-(--color-rc-border) pt-4">
          <Button variant="ghost" size="md" onClick={onClose}>
            {copy.secondaryCta}
          </Button>
          <Button variant="primary" size="md" onClick={onUpgrade}>
            {copy.primaryCta}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
