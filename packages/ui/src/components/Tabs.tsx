"use client";

import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "../lib/cn.js";

/**
 * Tabs — wraps Radix Tabs with our token classes.
 *
 * Used by the right context panel (Evidence / Feedback / Mentor / Logs)
 * and by MentorPanel mode switching (Hint / Clarify / Review / Explain).
 */

export const Tabs = RadixTabs.Root;

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof RadixTabs.List> {}
export const TabsList = React.forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  TabsListProps
>(function TabsList({ className, ...rest }, ref) {
  return (
    <RadixTabs.List
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 border-b border-[--color-rc-border]",
        className,
      )}
      {...rest}
    />
  );
});

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger> {}
export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  TabsTriggerProps
>(function TabsTrigger({ className, ...rest }, ref) {
  return (
    <RadixTabs.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center h-9 px-3 text-[--text-rc-sm] font-medium text-[--color-rc-text-muted]",
        "border-b-2 border-transparent -mb-px",
        "data-[state=active]:text-[--color-rc-text] data-[state=active]:border-[--color-rc-accent]",
        "hover:text-[--color-rc-text]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--color-rc-accent]",
        className,
      )}
      {...rest}
    />
  );
});

export interface TabsContentProps
  extends React.ComponentPropsWithoutRef<typeof RadixTabs.Content> {}
export const TabsContent = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  TabsContentProps
>(function TabsContent({ className, ...rest }, ref) {
  return (
    <RadixTabs.Content
      ref={ref}
      className={cn("pt-3 focus-visible:outline-none", className)}
      {...rest}
    />
  );
});
