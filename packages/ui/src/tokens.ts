/**
 * Design tokens for ResearchCrafters UI.
 *
 * Brand decision (2026-05): we picked the **"Lab notebook"** palette — warm
 * coral (`#E76F51`) on a deep navy text and cream/off-white surface. Rationale:
 *
 *  - The coral accent reads as a research-engineering tool (warm, deliberate)
 *    rather than the generic SaaS blue we had before.
 *  - Cream surfaces in light mode echo a printed lab notebook; the dark mode
 *    flips to deep navy (`#0E1320`) so the coral stays the protagonist.
 *  - The paired warm yellow (`#F2B541`) gives "draft" / preview callouts a
 *    distinctive tint without ceding the accent.
 *  - Code surfaces get their own background (`--color-rc-code-bg` /
 *    `--color-rc-code-text`) — code IS the brand surface, so a CodeCrafters
 *    style terminal block (traffic-light dots, prompt prefix) needs its own
 *    surface tokens to live on.
 *
 * Single source of truth for color, typography, spacing, radius, motion,
 * breakpoints, and the canonical status palette. Consumers compose Tailwind
 * with these tokens (also exposed as CSS variables in `styles.css`).
 *
 * Anti-patterns (do not do):
 * - Do NOT duplicate token values inside components.
 * - Do NOT use viewport-scaled font sizes; sizes are pixel-fixed.
 * - Do NOT rely on color alone for branch status (always pair with label/icon).
 * - Do NOT introduce decorative motion outside marketing surfaces (catalog,
 *   package overview, share, login). Workbench surfaces (stage player,
 *   mentor panel, run logs, evidence) keep the original restraint.
 */

export const colors = {
  light: {
    bg: "#ffffff",
    surface: "#FAF6EE",
    surfaceMuted: "#F1ECDF",
    border: "#E2DACB",
    borderStrong: "#C9BFAA",
    text: "#1B2433",
    textMuted: "#4A5468",
    textSubtle: "#7C8597",
    accent: "#E76F51",
    accentHover: "#D85A3A",
    accentSubtle: "#FBE6DD",
    accent50: "#FBE6DD",
    accent200: "#F4B7A1",
    accent400: "#E76F51",
    accent700: "#A23E22",
    accentForeground: "#FFFFFF",
    onAccent: "#FFFFFF",
    success: "#2EA567",
    successSubtle: "#DCF1E5",
    warning: "#B45F00",
    warningSubtle: "#FBEED0",
    danger: "#C0362C",
    dangerSubtle: "#FBE5E3",
    info: "#1A72C6",
    infoSubtle: "#E2F0FB",
    neutral: "#6B7280",
    neutralSubtle: "#ECEEF2",
    locked: "#9AA3B2",
    lockedSubtle: "#ECEFF5",
    codeBg: "#1B2433",
    codeText: "#F1E8DA",
    codeMuted: "#7C8597",
  },
  dark: {
    bg: "#0E1320",
    surface: "#161C2D",
    surfaceMuted: "#1F2638",
    border: "#2B3349",
    borderStrong: "#3D465E",
    text: "#F1E8DA",
    textMuted: "#A8B0C0",
    textSubtle: "#7C8597",
    accent: "#F08A6B",
    accentHover: "#F5A589",
    accentSubtle: "#3A1B12",
    accent50: "#2B130C",
    accent200: "#7A2E1A",
    accent400: "#F08A6B",
    accent700: "#FBC4B0",
    accentForeground: "#0E1320",
    onAccent: "#0E1320",
    success: "#3DD17A",
    successSubtle: "#0F2A1C",
    warning: "#F2B541",
    warningSubtle: "#3A2810",
    danger: "#EF6A60",
    dangerSubtle: "#3A1816",
    info: "#5FB3EE",
    infoSubtle: "#0F2638",
    neutral: "#8A93A3",
    neutralSubtle: "#1C2028",
    locked: "#5B6373",
    lockedSubtle: "#1A1D24",
    codeBg: "#0A0F1C",
    codeText: "#F1E8DA",
    codeMuted: "#7C8597",
  },
} as const;

export type ColorMode = keyof typeof colors;
export type ColorToken = keyof (typeof colors)["light"];

export const typography = {
  family: {
    sans: '"Inter", "Helvetica Neue", Arial, system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "SFMono-Regular", Menlo, Consolas, monospace',
  },
  size: {
    xs: "12px",
    sm: "13px",
    base: "14px",
    md: "15px",
    lg: "17px",
    xl: "20px",
    "2xl": "24px",
    "3xl": "30px",
  },
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
    body: 1.6,
  },
  letterSpacing: {
    none: "0",
    display: "-0.02em",
    eyebrow: "0.1em",
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export type TypographySize = keyof typeof typography.size;

export const spacing = {
  0: "0px",
  1: "1px",
  2: "2px",
  3: "4px",
  4: "6px",
  5: "8px",
  6: "10px",
  7: "12px",
  8: "14px",
  9: "16px",
  10: "20px",
  11: "24px",
  12: "28px",
  13: "32px",
  14: "36px",
  15: "40px",
  16: "48px",
  17: "56px",
  18: "64px",
  19: "72px",
  20: "80px",
  21: "96px",
  22: "112px",
  23: "128px",
  24: "160px",
} as const;

export type SpacingToken = keyof typeof spacing;

export const radius = {
  none: "0px",
  sm: "4px",
  md: "6px",
  lg: "8px",
  xl: "12px",
  pill: "9999px",
} as const;

/**
 * Display typography — additive tokens for marketing surfaces (catalog hero,
 * package overview header, share card). Workbench/UI sizes still live in
 * `typography.size` untouched. Display sizes follow the CodeCrafters cadence:
 * tight tracking, snug line-height, weight 700, generous breathing room
 * around them.
 *
 * Anti-pattern: do NOT use `display.size.xl` / `2xl` for body copy. Restrict
 * to top-of-page H1/H2 on marketing surfaces only.
 */
export const display = {
  size: {
    sm: "32px",
    md: "40px",
    lg: "48px",
    xl: "60px",
    "2xl": "72px",
  },
  lineHeight: {
    display: 1.05,
    tight: 1.05,
    snug: 1.15,
  },
  tracking: {
    display: "-0.02em",
  },
} as const;

export type DisplaySize = keyof typeof display.size;

export type RadiusToken = keyof typeof radius;

/**
 * Motion budget. Workbench surfaces use only `fast`/`base` durations and only
 * for state-change transitions. Marketing surfaces are allowed `slow` and the
 * `entrance` duration for hero entrances and hover-lift cards. All motion
 * must short-circuit on `prefers-reduced-motion: reduce`.
 */
export const motion = {
  duration: {
    instant: "0ms",
    fast: "120ms",
    base: "180ms",
    slow: "260ms",
    entrance: "300ms",
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
    linear: "linear",
  },
} as const;

export const breakpoints = {
  mobile: "0px",
  tablet: "768px",
  desktop: "1100px",
} as const;

export type Breakpoint = keyof typeof breakpoints;

/**
 * Status palette — keys are the canonical statuses produced by the runner,
 * evaluator, and stage state machines. Values reference semantic color tokens
 * in `colors.light` / `colors.dark`.
 *
 * Always pair a status with a label or icon — never color alone.
 */
export type StatusKey =
  | "pass"
  | "fail"
  | "partial"
  | "retry"
  | "timeout"
  | "oom"
  | "crash"
  | "exit_nonzero"
  | "locked"
  | "in_progress"
  | "completed";

export const statusPalette = {
  pass: { fg: "success", bg: "successSubtle", label: "Pass" },
  fail: { fg: "danger", bg: "dangerSubtle", label: "Fail" },
  partial: { fg: "warning", bg: "warningSubtle", label: "Partial" },
  retry: { fg: "warning", bg: "warningSubtle", label: "Retry" },
  timeout: { fg: "warning", bg: "warningSubtle", label: "Timeout" },
  oom: { fg: "danger", bg: "dangerSubtle", label: "Out of memory" },
  crash: { fg: "danger", bg: "dangerSubtle", label: "Crash" },
  exit_nonzero: { fg: "danger", bg: "dangerSubtle", label: "Exit non-zero" },
  locked: { fg: "locked", bg: "lockedSubtle", label: "Locked" },
  in_progress: { fg: "info", bg: "infoSubtle", label: "In progress" },
  completed: { fg: "success", bg: "successSubtle", label: "Completed" },
} as const satisfies Record<
  StatusKey,
  { fg: ColorToken; bg: ColorToken; label: string }
>;

export type StatusPaletteEntry = (typeof statusPalette)[StatusKey];

export const tokens = {
  colors,
  typography,
  display,
  spacing,
  radius,
  motion,
  breakpoints,
  statusPalette,
} as const;

export type Tokens = typeof tokens;
