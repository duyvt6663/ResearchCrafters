"use client";

import * as React from "react";
import { Dialog, DialogContent } from "./Dialog.js";
import { LoginForm, type LoginFormProps } from "./LoginForm.js";

/**
 * LoginModal — Dialog wrapper around `LoginForm` with a header that names
 * the surface the learner was trying to enter (typically a package). Use
 * for in-app sign-in entry points where redirecting to `/login` would
 * lose context (e.g. clicking "Start package" while signed-out).
 *
 * For direct visits to `/login` (shared links, marketing → sign in),
 * keep using the standalone page surface — render `LoginForm` directly.
 */

export interface LoginModalProps extends LoginFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional surface name surfaced in the modal title. */
  contextTitle?: string;
  /** Override the description rendered under the title. */
  description?: React.ReactNode;
}

export function LoginModal({
  open,
  onOpenChange,
  contextTitle,
  description,
  ...formProps
}: LoginModalProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={
          contextTitle ? (
            <span>
              Sign in to start{" "}
              <span className="text-(--color-rc-accent)">{contextTitle}</span>
            </span>
          ) : (
            "Sign in"
          )
        }
        description={
          description ??
          (contextTitle
            ? "We'll bring you back here right after sign-in."
            : "Pick up where you left off.")
        }
      >
        <LoginForm {...formProps} />
      </DialogContent>
    </Dialog>
  );
}
