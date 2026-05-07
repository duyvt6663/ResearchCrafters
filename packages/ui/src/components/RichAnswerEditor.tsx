"use client";

import * as React from "react";
import { Eye, Pencil, Columns2 } from "lucide-react";
import { cn } from "../lib/cn.js";
import { AnswerEditor, type AnswerEditorProps } from "./AnswerEditor.js";
import {
  RichTextToolbar,
  type RichTextSnippet,
} from "./RichTextToolbar.js";

/**
 * RichAnswerEditor — markdown-backed answer editor with formatting toolbar
 * and live preview.
 *
 * Wraps `AnswerEditor` (which keeps autosave / sanitize / undo-redo)
 * unchanged. The wrapper layers:
 *  - A `RichTextToolbar` above the textarea that emits markdown snippets.
 *  - A mode switcher (Edit / Preview / Split).
 *  - A markdown preview pane backed by `react-markdown` + `remark-gfm`.
 *    Falls back to a plain `<pre>` when the deps are not yet installed.
 *
 * The textarea continues to be a plain controlled input — we do NOT use
 * contentEditable. The "rich" part is the markdown layer; the storage
 * format is plain text.
 */
export type RichAnswerEditorMode = "edit" | "preview" | "split";

export interface RichAnswerEditorProps extends AnswerEditorProps {
  showPreview?: boolean;
  initialMode?: RichAnswerEditorMode;
  /**
   * Optional toolbar size. Defaults to `md` (32px squares); pass `sm` when
   * embedded in a tight column.
   */
  toolbarSize?: "sm" | "md";
}

interface ReactMarkdown {
  default: React.ComponentType<{
    children: string;
    remarkPlugins?: unknown[];
  }>;
}
interface RemarkGfm {
  default: unknown;
}

let cachedMarkdown:
  | { Markdown: ReactMarkdown["default"]; gfm: unknown }
  | null = null;
let attemptedMarkdown = false;

function tryLoadMarkdown(): {
  Markdown: ReactMarkdown["default"];
  gfm: unknown;
} | null {
  if (attemptedMarkdown) return cachedMarkdown;
  attemptedMarkdown = true;
  try {
    const g = globalThis as unknown as {
      __RC_REACT_MARKDOWN__?: { Markdown: ReactMarkdown["default"]; gfm: unknown };
      require?: (id: string) => unknown;
    };
    if (g.__RC_REACT_MARKDOWN__) {
      cachedMarkdown = g.__RC_REACT_MARKDOWN__;
      return cachedMarkdown;
    }
    const req = g.require;
    if (typeof req === "function") {
      const md = req("react-markdown") as ReactMarkdown | undefined;
      const gfm = req("remark-gfm") as RemarkGfm | undefined;
      if (md && md.default) {
        cachedMarkdown = { Markdown: md.default, gfm: gfm?.default };
        return cachedMarkdown;
      }
    }
  } catch {
    cachedMarkdown = null;
  }
  return cachedMarkdown;
}

/**
 * Allow consumers to register the resolved react-markdown + remark-gfm so
 * the preview pane uses them without paying the dynamic-resolution cost.
 */
export function registerReactMarkdown(payload: {
  Markdown: ReactMarkdown["default"];
  gfm?: unknown;
}): void {
  cachedMarkdown = { Markdown: payload.Markdown, gfm: payload.gfm };
  attemptedMarkdown = true;
  (
    globalThis as { __RC_REACT_MARKDOWN__?: { Markdown: ReactMarkdown["default"]; gfm: unknown } }
  ).__RC_REACT_MARKDOWN__ = cachedMarkdown;
}

function MarkdownPreview({
  source,
  className,
}: {
  source: string;
  className?: string;
}): React.ReactElement {
  const md = tryLoadMarkdown();
  if (md && md.Markdown) {
    const Markdown = md.Markdown;
    return (
      <div
        className={cn("rc-rich-prose", className)}
        data-rc-rich-preview
        data-rc-markdown="resolved"
      >
        <Markdown remarkPlugins={md.gfm ? [md.gfm] : []}>{source}</Markdown>
      </div>
    );
  }
  // Fallback: render the raw markdown verbatim. This keeps the surface
  // functional even before `react-markdown` is installed.
  return (
    <div
      className={cn("rc-rich-prose", className)}
      data-rc-rich-preview
      data-rc-markdown="fallback"
    >
      <pre className="whitespace-pre-wrap font-(--font-rc-mono) text-(--text-rc-sm)">
        {source}
      </pre>
    </div>
  );
}

export function RichAnswerEditor({
  showPreview = true,
  initialMode = "edit",
  toolbarSize = "md",
  ...editorProps
}: RichAnswerEditorProps) {
  const [mode, setMode] = React.useState<RichAnswerEditorMode>(
    showPreview ? initialMode : "edit",
  );
  // Track local value so the preview pane can re-render even when the parent
  // is uncontrolled (the wrapped AnswerEditor still owns the autosave path).
  const [localValue, setLocalValue] = React.useState(editorProps.value ?? "");
  React.useEffect(() => {
    if (editorProps.value !== undefined) setLocalValue(editorProps.value);
  }, [editorProps.value]);

  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const handleChange = (next: string) => {
    setLocalValue(next);
    editorProps.onChange?.(next);
  };

  const insertSnippet = (snippet: RichTextSnippet) => {
    const ta = textareaRef.current;
    if (!ta) {
      // No DOM yet — append to value.
      const placeholder = snippet.placeholder ?? "";
      handleChange(localValue + snippet.before + placeholder + snippet.after);
      return;
    }
    const start = ta.selectionStart ?? localValue.length;
    const end = ta.selectionEnd ?? localValue.length;
    const selected = localValue.slice(start, end);
    const inner = selected || snippet.placeholder || "";
    const next =
      localValue.slice(0, start) +
      snippet.before +
      inner +
      snippet.after +
      localValue.slice(end);
    handleChange(next);
    // Re-focus and select the inserted placeholder so the user can type
    // over it.
    requestAnimationFrame(() => {
      const focusStart = start + snippet.before.length;
      const focusEnd = focusStart + inner.length;
      ta.focus();
      try {
        ta.setSelectionRange(focusStart, focusEnd);
      } catch {
        // ignore
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") {
      e.preventDefault();
      insertSnippet({ before: "**", placeholder: "bold", after: "**" });
    } else if (k === "i") {
      e.preventDefault();
      insertSnippet({ before: "*", placeholder: "italic", after: "*" });
    } else if (k === "e") {
      e.preventDefault();
      insertSnippet({ before: "`", placeholder: "code", after: "`" });
    } else if (k === "k") {
      e.preventDefault();
      insertSnippet({
        before: "[",
        placeholder: "link text",
        after: "](https://)",
      });
    }
  };

  // Inject our textarea ref into the rendered AnswerEditor by wrapping its
  // root and walking the DOM. Cleaner approach: directly render a textarea
  // here and forward through the AnswerEditor props. We choose the second:
  // the existing AnswerEditor does not expose a ref, so we render a thin
  // pass-through that mirrors its shape.

  return (
    <div
      className={cn("flex flex-col gap-2")}
      data-rc-rich-editor
      data-mode={mode}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between gap-2">
        <RichTextToolbar onInsert={insertSnippet} size={toolbarSize} />
        {showPreview ? (
          <ModeSwitcher mode={mode} onChange={setMode} />
        ) : null}
      </div>

      <div
        className={cn(
          "grid gap-3",
          mode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
        )}
        data-rc-rich-editor-body
      >
        {mode !== "preview" ? (
          <div data-rc-rich-edit>
            <AnswerEditorWithRef
              {...editorProps}
              value={localValue}
              onChange={handleChange}
              textareaRef={textareaRef}
            />
          </div>
        ) : null}
        {mode !== "edit" ? (
          <div data-rc-rich-preview-pane>
            <MarkdownPreview source={localValue} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: RichAnswerEditorMode;
  onChange: (m: RichAnswerEditorMode) => void;
}) {
  const options: { key: RichAnswerEditorMode; icon: typeof Eye; label: string }[] = [
    { key: "edit", icon: Pencil, label: "Edit" },
    { key: "split", icon: Columns2, label: "Split" },
    { key: "preview", icon: Eye, label: "Preview" },
  ];
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-0.5 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-0.5"
      data-rc-rich-mode
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = opt.key === mode;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            data-mode={opt.key}
            data-active={active ? "true" : "false"}
            className={cn(
              "inline-flex items-center gap-1 rounded-(--radius-rc-sm) px-2 py-1 text-(--text-rc-xs)",
              active
                ? "bg-(--color-rc-icon-accent-soft) text-(--color-rc-icon-accent)"
                : "text-(--color-rc-text-muted) hover:bg-(--color-rc-surface-muted)",
            )}
          >
            <Icon size={12} aria-hidden />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Thin wrapper that exposes a textarea ref. We re-implement the editor body
 * here because the canonical `AnswerEditor` keeps its own textarea internal.
 * All the autosave / sanitize / undo-redo logic still flows through the
 * underlying component — we render a hidden `AnswerEditor` so its effects
 * keep firing and a visible textarea ref'd to it via shared state.
 *
 * NOTE: instead of double-rendering, we delegate to a forwardRef-aware
 * variant. Since `AnswerEditor` does not support a ref today, we simply
 * render it normally inside a wrapping div and capture the textarea via a
 * `ref` that callbacks to the first textarea descendant — this avoids
 * touching `AnswerEditor.tsx`.
 */
function AnswerEditorWithRef({
  textareaRef,
  ...props
}: AnswerEditorProps & {
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
}) {
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const node = wrapperRef.current?.querySelector(
      "textarea",
    ) as HTMLTextAreaElement | null;
    textareaRef.current = node;
  });
  return (
    <div ref={wrapperRef} data-rc-answer-editor-host>
      <AnswerEditor {...props} />
    </div>
  );
}
