"use client";

import * as React from "react";
import { Compass, Moon, Sun } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * AppShell — top-level layout wrapper that hosts a sticky top navigation and
 * the routed page content beneath it.
 *
 * Intentionally minimal: visual chrome lives in `topNav` and consumers
 * compose pages inside `children`. Apps may swap this for a richer shell
 * once nav, sidebars, or breadcrumbs are introduced.
 *
 * Visual contract (per `docs/FRONTEND.md` §4 + §5):
 *  - Full-bleed bands: the shell uses `--color-rc-bg` and never floats.
 *  - Page gutter: pages may use `px-6 lg:px-8` for a consistent inset; the
 *    shell does not impose horizontal padding so dense surfaces (stage
 *    player) can go edge-to-edge.
 *  - Includes a thin loading bar slot under the nav (`aria-hidden`) reserved
 *    for future Suspense / route-transition wiring.
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
        <header className="sticky top-0 z-30 border-b border-[--color-rc-border] bg-[--color-rc-bg]/95 backdrop-blur-sm supports-[backdrop-filter]:bg-[--color-rc-bg]/80">
          {topNav}
          {/* Reserved indeterminate loading bar slot for future Suspense wiring. */}
          <div
            aria-hidden
            data-active="false"
            className="rc-loading-bar"
          />
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
 * Internal — dark-mode toggle button. Lives next to the nav links.
 *
 * Hydration-safe: starts in an "unknown" state (icon hidden) and only paints
 * the Sun/Moon affordance after `useEffect` has read the persisted preference
 * or the OS-level `prefers-color-scheme`. This avoids the SSR/CSR mismatch
 * that would otherwise flash the wrong icon.
 *
 * Persists user choice to `localStorage` under `rc-theme` and writes
 * `data-theme="dark"` on `<html>` (matching the `:where([data-theme="dark"])`
 * override in `packages/ui/src/styles.css`).
 */
function ThemeToggle() {
  const [theme, setTheme] = React.useState<"light" | "dark" | null>(null);

  React.useEffect(() => {
    let initial: "light" | "dark";
    try {
      const stored = window.localStorage.getItem("rc-theme");
      if (stored === "light" || stored === "dark") {
        initial = stored;
      } else if (
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        initial = "dark";
      } else {
        initial = "light";
      }
    } catch {
      initial = "light";
    }
    document.documentElement.setAttribute("data-theme", initial);
    setTheme(initial);
  }, []);

  const flip = React.useCallback(() => {
    setTheme((prev) => {
      const next: "light" | "dark" = prev === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem("rc-theme", next);
      } catch {
        /* ignore quota / privacy mode */
      }
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  // Render a fixed-size shell on first paint to avoid layout shift, but keep
  // the icon invisible until we know the resolved theme.
  return (
    <button
      type="button"
      aria-label={
        theme === null
          ? "Toggle theme"
          : theme === "dark"
            ? "Switch to light mode"
            : "Switch to dark mode"
      }
      aria-pressed={theme === "dark"}
      onClick={flip}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-[--radius-rc-md]",
        "border border-[--color-rc-border] bg-transparent text-[--color-rc-text-muted]",
        "transition-colors duration-[--duration-rc-fast]",
        "hover:bg-[--color-rc-surface-muted] hover:text-[--color-rc-text]",
      )}
    >
      {theme === null ? (
        <span aria-hidden className="block h-4 w-4" />
      ) : theme === "dark" ? (
        <Sun aria-hidden size={14} />
      ) : (
        <Moon aria-hidden size={14} />
      )}
    </button>
  );
}

/**
 * TopNav — primary navigation row inside `AppShell`.
 *
 * Layout per `docs/FRONTEND.md` §5:
 *  - Brand on the left in mono.
 *  - Links right-aligned, 56px row height, bottom border via shell.
 *  - Active link gets a 2px accent under-rule (resolved on the client to
 *    avoid passing route state through props).
 */
export function TopNav({
  brand,
  brandHref = "/",
  links = [],
  className,
}: TopNavProps) {
  // Resolve the active link client-side so we don't break the prop interface.
  // Server-rendered HTML still ships every link unstyled; the under-rule paints
  // after hydration. Falls back to root path when called outside the browser.
  const [activePath, setActivePath] = React.useState<string | null>(null);
  React.useEffect(() => {
    setActivePath(window.location.pathname);
  }, []);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between gap-6 px-6 lg:px-8",
        className,
      )}
    >
      <a
        href={brandHref}
        className={cn(
          "font-[--font-rc-mono] text-[--text-rc-md] font-semibold tracking-tight",
          "text-[--color-rc-text] transition-colors duration-[--duration-rc-fast]",
          "hover:text-[--color-rc-accent]",
        )}
      >
        {brand}
      </a>
      <div className="flex items-center gap-4">
        {links.length > 0 ? (
          <ul className="flex items-center gap-1 text-[--text-rc-sm]">
            {links.map((link) => {
              const isActive =
                activePath !== null &&
                (link.href === "/"
                  ? activePath === "/"
                  : activePath === link.href ||
                    activePath.startsWith(`${link.href}/`));
              return (
                <li key={link.href}>
                  <a
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative inline-flex h-14 items-center px-3",
                      "text-[--color-rc-text-muted] transition-colors duration-[--duration-rc-fast]",
                      "hover:text-[--color-rc-text]",
                      isActive && "text-[--color-rc-text]",
                    )}
                  >
                    {link.label}
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-3 bottom-[-1px] h-[2px]",
                        isActive
                          ? "bg-[--color-rc-accent]"
                          : "bg-transparent",
                      )}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
        <ThemeToggle />
      </div>
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
  // Placeholder pills convey what the filter shelf will hold without inventing
  // filter copy beyond `cope/copy`. Render-only, no interactivity yet.
  const placeholderFacets = ["Difficulty", "Skill", "Time", "Free preview"];
  return (
    <div
      aria-label="Catalog filters"
      className={cn(
        "flex items-center gap-2 overflow-x-auto",
        "rounded-[--radius-rc-md] border border-[--color-rc-border]",
        "bg-[--color-rc-surface] px-3 py-2 text-[--text-rc-sm] text-[--color-rc-text-muted]",
        className,
      )}
    >
      <span className="font-medium text-[--color-rc-text]">Filters</span>
      <span aria-hidden className="h-4 w-px bg-[--color-rc-border]" />
      {placeholderFacets.map((facet) => (
        <span
          key={facet}
          className={cn(
            "inline-flex h-6 items-center rounded-[--radius-rc-sm]",
            "border border-[--color-rc-border] bg-[--color-rc-bg] px-2",
            "text-[--text-rc-xs] text-[--color-rc-text-muted]",
          )}
        >
          {facet}
        </span>
      ))}
    </div>
  );
}

/**
 * EmptyState — generic empty-state surface used by catalog, enrollment lists,
 * and similar zero-data views. Pairs an authored title with body copy.
 *
 * Visual: center-aligned, generous whitespace, optional subtle icon (via the
 * `Compass` glyph) sitting above the title. The icon is decorative — never
 * use it to convey state on its own (per accessibility section).
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
        "mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-16 text-center",
        "rounded-[--radius-rc-lg] border border-[--color-rc-border] bg-[--color-rc-surface]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex h-10 w-10 items-center justify-center rounded-full",
          "border border-[--color-rc-border] bg-[--color-rc-bg] text-[--color-rc-text-subtle]",
        )}
      >
        <Compass size={18} />
      </span>
      <h2 className="text-[--text-rc-lg] font-semibold text-[--color-rc-text]">
        {title}
      </h2>
      <p className="max-w-md text-[--text-rc-sm] leading-relaxed text-[--color-rc-text-muted]">
        {body}
      </p>
      {cta ? <div className="mt-2">{cta}</div> : null}
    </section>
  );
}
