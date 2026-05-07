/**
 * Design tokens for ResearchCrafters UI.
 *
 * Single source of truth for color, typography, spacing, radius, motion,
 * breakpoints, and the canonical status palette. Consumers compose Tailwind
 * with these tokens (also exposed as CSS variables in `styles.css`).
 *
 * Anti-patterns (do not do):
 * - Do NOT duplicate token values inside components.
 * - Do NOT use viewport-scaled font sizes; sizes are pixel-fixed.
 * - Do NOT rely on color alone for branch status (always pair with label/icon).
 * - Do NOT introduce decorative motion; motion may only communicate state change.
 */

export const colors = {
  light: {
    bg: "#ffffff",
    surface: "#f7f8fa",
    surfaceMuted: "#eef0f4",
    border: "#dcdfe6",
    borderStrong: "#c2c7d1",
    text: "#0f1115",
    textMuted: "#5b6473",
    textSubtle: "#828b99",
    accent: "#1f5fff",
    accentHover: "#1a4fd6",
    accentSubtle: "#e7eeff",
    onAccent: "#ffffff",
    success: "#1f9d55",
    successSubtle: "#e3f5ea",
    warning: "#b45f00",
    warningSubtle: "#fbeed0",
    danger: "#c0362c",
    dangerSubtle: "#fbe5e3",
    info: "#1a72c6",
    infoSubtle: "#e2f0fb",
    neutral: "#6b7280",
    neutralSubtle: "#eceef2",
    locked: "#9aa3b2",
    lockedSubtle: "#eceff5",
  },
  dark: {
    bg: "#0b0d11",
    surface: "#13161c",
    surfaceMuted: "#1a1e26",
    border: "#262b35",
    borderStrong: "#3a414f",
    text: "#f3f5f8",
    textMuted: "#a8b0bd",
    textSubtle: "#7c8492",
    accent: "#5b8bff",
    accentHover: "#7aa1ff",
    accentSubtle: "#1a2440",
    onAccent: "#0b0d11",
    success: "#3dd17a",
    successSubtle: "#0f2a1c",
    warning: "#e8a64a",
    warningSubtle: "#3a2810",
    danger: "#ef6a60",
    dangerSubtle: "#3a1816",
    info: "#5fb3ee",
    infoSubtle: "#0f2638",
    neutral: "#8a93a3",
    neutralSubtle: "#1c2028",
    locked: "#5b6373",
    lockedSubtle: "#1a1d24",
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
  },
  letterSpacing: {
    none: "0",
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
  pill: "9999px",
} as const;

/**
 * Display typography — additive tokens for marketing surface (catalog hero,
 * package overview header). Keeps body/UI sizes in `typography.size` untouched
 * while giving hero/heading text room to breathe at workbench-precise weights.
 *
 * Anti-pattern: do NOT use these for body copy. Restrict to top-of-page H1/H2.
 */
export const display = {
  size: {
    sm: "32px",
    md: "40px",
    lg: "48px",
  },
  lineHeight: {
    tight: 1.05,
    snug: 1.15,
  },
} as const;

export type DisplaySize = keyof typeof display.size;

export type RadiusToken = keyof typeof radius;

/**
 * Motion budget: short, subtle, state-driven only.
 * Never use motion for decoration.
 */
export const motion = {
  duration: {
    instant: "0ms",
    fast: "120ms",
    base: "180ms",
    slow: "260ms",
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
