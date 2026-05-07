// Typed renderers for the standard error/empty states. The visual primitives
// (EmptyState, ErrorPanel, etc.) live in @researchcrafters/ui; the copy lives
// in @researchcrafters/ui/copy. This module wires the two together so pages
// don't import the components ad-hoc.

import { createElement, type ReactElement } from "react";
import { ErrorPanel } from "@researchcrafters/ui/components";
import { copy } from "@researchcrafters/ui/copy";

export type ErrorPageKind =
  | "runner-offline"
  | "mentor-unavailable"
  | "stage-locked"
  | "stale-cli";

export type ErrorPageProps = {
  retryHref?: string;
  details?: string;
};

const COPY_BY_KIND: Record<
  ErrorPageKind,
  { title: string; body: string; cta?: string }
> = {
  "runner-offline": copy.errors.runnerOffline,
  "mentor-unavailable": copy.errors.mentorUnavailable,
  "stage-locked": copy.errors.stageLocked,
  "stale-cli": copy.errors.staleCli,
};

export function renderErrorPage(
  kind: ErrorPageKind,
  props: ErrorPageProps = {},
): ReactElement {
  const c = COPY_BY_KIND[kind];
  return createElement(ErrorPanel, {
    kind,
    title: c.title,
    body: c.body,
    cta: c.cta,
    retryHref: props.retryHref,
    details: props.details,
  });
}
