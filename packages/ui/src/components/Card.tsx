import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * Card — primitive bounded surface.
 *
 * IMPORTANT (anti-pattern): NEVER nest cards. The `data-card` attribute is the
 * lint marker — `styles.css` paints a debug outline when one Card sits inside
 * another, and downstream lint rules can grep for `data-card` containment.
 *
 * Use cards only for repeated items (catalog), individual package summaries,
 * modals, and clearly bounded tools (per `docs/FRONTEND.md` section 4).
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Increase visual weight (e.g. for a primary package card). */
  emphasis?: "default" | "strong";
  /** Render as a different element if you need <article> semantics, etc. */
  as?: "div" | "article" | "section";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { emphasis = "default", as = "div", className, children, ...rest },
  ref,
) {
  const Element = as as React.ElementType;
  return (
    <Element
      ref={ref}
      data-card="true"
      className={cn(
        "rounded-(--radius-rc-lg) border bg-(--color-rc-surface) text-(--color-rc-text)",
        emphasis === "strong"
          ? "border-(--color-rc-border-strong) shadow-sm"
          : "border-(--color-rc-border)",
        className,
      )}
      {...rest}
    >
      {children}
    </Element>
  );
});

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}
export function CardHeader({ className, ...rest }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 border-b border-(--color-rc-border)",
        className,
      )}
      {...rest}
    />
  );
}

export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {}
export function CardBody({ className, ...rest }: CardBodyProps) {
  return <div className={cn("p-4", className)} {...rest} />;
}

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}
export function CardFooter({ className, ...rest }: CardFooterProps) {
  return (
    <div
      className={cn(
        "px-4 py-3 border-t border-(--color-rc-border)",
        className,
      )}
      {...rest}
    />
  );
}
