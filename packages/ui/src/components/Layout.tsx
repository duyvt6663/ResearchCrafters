import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * AppShell — top-level layout wrapper that hosts a sticky top navigation and
 * the routed page content beneath it.
 *
 * Intentionally minimal: visual chrome lives in `topNav` and consumers
 * compose pages inside `children`. Apps may swap this for a richer shell
 * once nav, sidebars, or breadcrumbs are introduced.
 */
export interface AppShellProps {
  /** Slot for the top navigation row. */
  topNav?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({
  topNav,
  children,
  className,
}: AppShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen flex flex-col bg-[--color-rc-bg] text-[--color-rc-text]",
        className,
      )}
    >
      {topNav ? (
        <header className="sticky top-0 z-30 border-b border-[--color-rc-border] bg-[--color-rc-bg]">
          {topNav}
        </header>
      ) : null}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

/**
 * TopNavLink — a single navigation entry. `href` may be any path; the host
 * app supplies an `<a>` (the link is rendered semantically — Next.js `<Link>`
 * ergonomics belong to the consumer if a richer client transition is needed).
 */
export interface TopNavLink {
  href: string;
  label: string;
}

export interface TopNavProps {
  /** Brand name rendered as the home anchor. */
  brand: React.ReactNode;
  /** Brand href; defaults to "/". */
  brandHref?: string;
  links?: ReadonlyArray<TopNavLink>;
  className?: string;
}

/**
 * TopNav — primary navigation row inside `AppShell`. Stays semantic; styling
 * comes from tokens, not bespoke chrome.
 */
export function TopNav({
  brand,
  brandHref = "/",
  links = [],
  className,
}: TopNavProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 px-4 py-3",
        className,
      )}
    >
      <a
        href={brandHref}
        className="text-[--text-rc-md] font-semibold text-[--color-rc-text] hover:text-[--color-rc-accent]"
      >
        {brand}
      </a>
      {links.length > 0 ? (
        <ul className="flex items-center gap-3 text-[--text-rc-sm]">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-[--color-rc-text-muted] hover:text-[--color-rc-text]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}

/**
 * CatalogFilters — placeholder filter shelf for the package catalog.
 *
 * Shape is intentionally empty until filter facets are designed (skills,
 * difficulty, time budget). Consumers can render this above a card grid as
 * a layout anchor; future props may add `facets`, `selected`, `onChange`.
 */
export interface CatalogFiltersProps {
  className?: string;
}

export function CatalogFilters({ className }: CatalogFiltersProps = {}) {
  return (
    <div
      aria-label="Catalog filters"
      className={cn(
        "rounded-[--radius-rc-md] border border-[--color-rc-border] bg-[--color-rc-surface] px-3 py-2 text-[--text-rc-sm] text-[--color-rc-text-muted]",
        className,
      )}
    >
      {/* TODO: wire to filter facets (skills, difficulty, time budget). */}
      <span>All packages</span>
    </div>
  );
}

/**
 * EmptyState — generic empty-state surface used by catalog, enrollment lists,
 * and similar zero-data views. Pairs an authored title with body copy.
 */
export interface EmptyStateProps {
  title: string;
  body: string;
  /** Optional CTA element rendered below the body. */
  cta?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, body, cta, className }: EmptyStateProps) {
  return (
    <section
      className={cn(
        "flex flex-col items-start gap-2 rounded-[--radius-rc-md] border border-[--color-rc-border] bg-[--color-rc-surface] px-4 py-6",
        className,
      )}
    >
      <h2 className="text-[--text-rc-md] font-semibold">{title}</h2>
      <p className="text-[--text-rc-sm] text-[--color-rc-text-muted]">{body}</p>
      {cta ? <div className="mt-2">{cta}</div> : null}
    </section>
  );
}
