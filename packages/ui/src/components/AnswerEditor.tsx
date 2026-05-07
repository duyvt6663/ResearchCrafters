"use client";

import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * AnswerEditor — textarea-based editor for writing/analysis stages.
 *
 * Behaviors implemented (TODOS/09):
 *  - Draft autosave hook (`onAutoSave`) with debounce (default 800ms).
 *  - Word count display (live).
 *  - Paste sanitization stub: strips HTML markup and zero-width chars.
 *  - Undo / redo via a small reducer — Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or
 *    Ctrl+Y on Windows-style keyboards).
 *
 * We do NOT use contentEditable here. Stage answers are plain text per the
 * rubric flow; richer formatting belongs to a future authoring surface.
 */
export interface AnswerEditorProps {
  /**
   * Controlled value. Optional so the component can self-host state when the
   * page passes `stageRef` and lets the editor manage its own draft.
   */
  value?: string;
  /**
   * Change handler for controlled mode. Optional for the same reason as
   * `value`. When omitted, the component falls back to internal state.
   */
  onChange?: (next: string) => void;
  /** Called after a debounce window with the latest value. */
  onAutoSave?: (next: string) => void | Promise<void>;
  /** Debounce window in ms. Default 800. */
  autoSaveDebounceMs?: number;
  placeholder?: string;
  /** Optional max characters; rendered with the count. */
  maxChars?: number;
  className?: string;
  ariaLabel?: string;
  rows?: number;
  /**
   * Stage ref used by the data-fetching variant. When set the editor will
   * eventually load its draft from the server keyed by this ref.
   *
   * TODO: wire to API.
   */
  stageRef?: string;
  /**
   * Where to POST drafts/submissions. Pairs with `stageRef`.
   *
   * TODO: wire to API.
   */
  submitHref?: string;
  /**
   * Rubric pass-through accepted for layout convenience; the rendered rubric
   * lives in `RubricPanel`. Stored here so the editor can surface short
   * weight hints in the future without an additional API hop.
   */
  rubric?: ReadonlyArray<{ id: string; label?: string; name?: string; weight?: number }>;
}

interface HistoryState {
  past: string[];
  present: string;
  future: string[];
}

type HistoryAction =
  | { type: "set"; value: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: string };

const HISTORY_LIMIT = 100;

function historyReducer(
  state: HistoryState,
  action: HistoryAction,
): HistoryState {
  switch (action.type) {
    case "set": {
      if (action.value === state.present) return state;
      const past = [...state.past, state.present];
      if (past.length > HISTORY_LIMIT) past.shift();
      return { past, present: action.value, future: [] };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1] ?? state.present;
      const past = state.past.slice(0, -1);
      return {
        past,
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0] ?? state.present;
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    case "reset":
      return { past: [], present: action.value, future: [] };
  }
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/u).length;
}

/**
 * Sanitization stub: strip HTML tags and zero-width characters from pasted
 * content. The full authoring app may replace this with a richer sanitizer.
 */
export function sanitizePastedText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\r\n/g, "\n");
}

export function AnswerEditor({
  value,
  onChange,
  onAutoSave,
  autoSaveDebounceMs = 800,
  placeholder = "Write your answer here…",
  maxChars,
  className,
  ariaLabel = "Answer",
  rows = 12,
}: AnswerEditorProps) {
  // When `value` is omitted (self-hosted draft mode), the editor manages its
  // own state. The history reducer still runs so undo/redo continues to work.
  const initialValue = value ?? "";
  const [history, dispatch] = React.useReducer(historyReducer, {
    past: [],
    present: initialValue,
    future: [],
  });

  // Sync external `value` -> internal history when caller updates it.
  React.useEffect(() => {
    if (value !== undefined && value !== history.present) {
      dispatch({ type: "reset", value });
    }
    // We intentionally do not depend on history.present.
  }, [value]);

  // Notify parent on internal changes (history.present is the truth).
  React.useEffect(() => {
    if (onChange && history.present !== value) {
      onChange(history.present);
    }
  }, [history.present]);

  // Debounced autosave.
  React.useEffect(() => {
    if (!onAutoSave) return undefined;
    const handle = setTimeout(() => {
      void onAutoSave(history.present);
    }, autoSaveDebounceMs);
    return () => clearTimeout(handle);
  }, [history.present, onAutoSave, autoSaveDebounceMs]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    dispatch({ type: "set", value: e.target.value });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const raw = e.clipboardData.getData("text/plain");
    const cleaned = sanitizePastedText(raw);
    if (cleaned !== raw) {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      const next =
        target.value.slice(0, start) + cleaned + target.value.slice(end);
      dispatch({ type: "set", value: next });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      dispatch({ type: "undo" });
    } else if ((key === "z" && e.shiftKey) || key === "y") {
      e.preventDefault();
      dispatch({ type: "redo" });
    }
  };

  const charCount = history.present.length;
  const wordCount = countWords(history.present);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <textarea
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={history.present}
        onChange={handleChange}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        rows={rows}
        className={cn(
          "w-full resize-vertical rounded-[--radius-rc-md] border border-[--color-rc-border]",
          "bg-[--color-rc-bg] text-[--color-rc-text] p-3 text-[--text-rc-base] leading-snug",
          "focus:outline-none focus:border-[--color-rc-accent]",
          "placeholder:text-[--color-rc-text-subtle]",
        )}
      />
      <div className="flex items-center justify-between text-[--text-rc-xs] text-[--color-rc-text-muted]">
        <span>{wordCount === 1 ? "1 word" : `${wordCount} words`}</span>
        <span>
          {maxChars !== undefined ? `${charCount} / ${maxChars}` : `${charCount} chars`}
        </span>
      </div>
    </div>
  );
}
