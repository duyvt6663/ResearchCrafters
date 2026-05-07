"use client";

import * as React from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Code as CodeIcon,
  Quote,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * RichTextToolbar — emits markdown snippets into the wrapped editor.
 *
 * Workbench-aware: the toolbar lives ABOVE the textarea so it never
 * obscures the writing surface. Buttons are 32px squares (sm = 28px) with
 * lucide icons. The "active" data-attribute paints the green icon-accent.
 *
 * The toolbar does not own any text — it calls `onInsert` with a
 * `{ before, placeholder, after }` triple and the wrapping editor is
 * responsible for inserting at the caret / wrapping the selection.
 */
export interface RichTextSnippet {
  before: string;
  placeholder?: string;
  after: string;
}

export interface RichTextToolbarProps {
  onInsert: (snippet: RichTextSnippet) => void;
  /**
   * Active button keys. The wrapping editor can pass this in if it knows the
   * caret is currently inside a bold span / heading / etc — the matching
   * button will paint the green icon-accent.
   */
  activeKeys?: ReadonlyArray<string>;
  size?: "sm" | "md";
  className?: string;
}

interface ToolbarItem {
  key: string;
  label: string;
  shortcut?: string;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  snippet: RichTextSnippet;
}

const ITEMS: ReadonlyArray<ToolbarItem> = [
  {
    key: "bold",
    label: "Bold",
    shortcut: "Cmd/Ctrl+B",
    icon: Bold,
    snippet: { before: "**", placeholder: "bold", after: "**" },
  },
  {
    key: "italic",
    label: "Italic",
    shortcut: "Cmd/Ctrl+I",
    icon: Italic,
    snippet: { before: "*", placeholder: "italic", after: "*" },
  },
  {
    key: "h1",
    label: "Heading 1",
    icon: Heading1,
    snippet: { before: "# ", placeholder: "Heading", after: "" },
  },
  {
    key: "h2",
    label: "Heading 2",
    icon: Heading2,
    snippet: { before: "## ", placeholder: "Heading", after: "" },
  },
  {
    key: "h3",
    label: "Heading 3",
    icon: Heading3,
    snippet: { before: "### ", placeholder: "Heading", after: "" },
  },
  {
    key: "ul",
    label: "Bullet list",
    icon: List,
    snippet: { before: "- ", placeholder: "item", after: "" },
  },
  {
    key: "ol",
    label: "Numbered list",
    icon: ListOrdered,
    snippet: { before: "1. ", placeholder: "item", after: "" },
  },
  {
    key: "code",
    label: "Inline code",
    shortcut: "Cmd/Ctrl+E",
    icon: CodeIcon,
    snippet: { before: "`", placeholder: "code", after: "`" },
  },
  {
    key: "quote",
    label: "Block quote",
    icon: Quote,
    snippet: { before: "> ", placeholder: "quote", after: "" },
  },
  {
    key: "link",
    label: "Link",
    shortcut: "Cmd/Ctrl+K",
    icon: LinkIcon,
    snippet: { before: "[", placeholder: "link text", after: "](https://)" },
  },
];

export const RICH_TEXT_TOOLBAR_ITEMS = ITEMS;

export function RichTextToolbar({
  onInsert,
  activeKeys = [],
  size = "md",
  className,
}: RichTextToolbarProps) {
  const activeSet = new Set(activeKeys);
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-surface) p-1",
        className,
      )}
      data-rc-rich-toolbar
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeSet.has(item.key);
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onInsert(item.snippet)}
            title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
            aria-label={item.label}
            aria-pressed={isActive}
            data-active={isActive ? "true" : "false"}
            data-rc-toolbar-key={item.key}
            className={cn(
              "rc-toolbar-btn",
              size === "sm" ? "rc-toolbar-btn--sm" : "",
            )}
          >
            <Icon
              size={size === "sm" ? 14 : 16}
              aria-hidden
              {...(isActive
                ? { className: "text-(--color-rc-icon-accent)" }
                : {})}
            />
          </button>
        );
      })}
    </div>
  );
}
