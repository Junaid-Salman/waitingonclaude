// Single source of truth for the colour scheme. Nothing else in the repo may hold a hex value.
// tailwind.config.ts turns `themes` into CSS variables and Tailwind colour utilities, so a token
// added here is usable as `bg-<token>`, `text-<token>` and `border-<token>` straight away.
//
// Relative imports only: the Tailwind config loads this file outside the `@/` alias.
import type { TileColour } from "../../shared/protocol";

// Scale values are Tailwind's published steps, so a step name tells you roughly how light it is.
export const palette = {
  white: "#ffffff",
  black: "#000000",
  neutral: {
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#d4d4d4",
    400: "#a3a3a3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
    950: "#0a0a0a",
  },
  slate: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },
  teal: {
    50: "#f0fdfa",
    100: "#ccfbf1",
    200: "#99f6e4",
    300: "#5eead4",
    400: "#2dd4bf",
    500: "#14b8a6",
    600: "#0d9488",
    700: "#0f766e",
    800: "#115e59",
    900: "#134e4a",
    950: "#042f2e",
  },
  amber: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
    950: "#451a03",
  },
} as const;

// Semantic tokens. `-fg` is the text colour that sits on the token of the same name.
// Every token needs a value in both themes; tests/colors.test.ts enforces that.
export const themes = {
  light: {
    background: palette.white,
    foreground: palette.neutral[900],
    muted: palette.neutral[500],
    "tile-border": palette.slate[400],
    "tile-correct": palette.teal[700],
    "tile-correct-fg": palette.white,
    "tile-present": palette.amber[400],
    "tile-present-fg": palette.slate[900],
    "tile-absent": palette.slate[600],
    "tile-absent-fg": palette.white,
    "key-idle": palette.slate[200],
    "key-absent": palette.slate[600],
    "key-absent-fg": palette.white,
  },
  dark: {
    background: palette.neutral[950],
    foreground: palette.neutral[200],
    muted: palette.neutral[400],
    "tile-border": palette.slate[500],
    "tile-correct": palette.teal[700],
    "tile-correct-fg": palette.white,
    "tile-present": palette.amber[400],
    "tile-present-fg": palette.slate[900],
    "tile-absent": palette.slate[600],
    "tile-absent-fg": palette.white,
    "key-idle": palette.slate[700],
    // Dimmer than an unused key so spent letters read at a glance.
    "key-absent": palette.slate[800],
    "key-absent-fg": palette.slate[300],
  },
} as const satisfies Record<"light" | "dark", Record<string, string>>;

export type ColourToken = keyof (typeof themes)["light"];

// Class maps. They hold whole class names so Tailwind's source scanner can see them.
export const tileClassesByColour: Record<TileColour, string> = {
  green: "bg-tile-correct border-tile-correct text-tile-correct-fg",
  yellow: "bg-tile-present border-tile-present text-tile-present-fg",
  grey: "bg-tile-absent border-tile-absent text-tile-absent-fg",
};

export const keyClassesByColour: Record<TileColour, string> = {
  green: "bg-tile-correct text-tile-correct-fg",
  yellow: "bg-tile-present text-tile-present-fg",
  grey: "bg-key-absent text-key-absent-fg",
};

export const tileClassesUnscored = {
  typed: "border-tile-border",
  empty: "border-tile-border/40",
} as const;

export const keyClassesIdle = "bg-key-idle";

export const buttonClasses = "bg-tile-correct text-tile-correct-fg";

export const secondaryButtonClasses = "bg-key-idle text-foreground";
export const selectedOptionClasses = "bg-tile-correct text-tile-correct-fg";
export const hostBadgeClasses = "bg-tile-present text-tile-present-fg";
export const youBadgeClasses = "bg-key-idle text-foreground";
export const inputClasses = "border-tile-border bg-background text-foreground";
export const focusClasses = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tile-correct";

export const solvedBadgeClasses = "bg-tile-correct text-tile-correct-fg";

// Opponents' boards are shown as small colour-only cells: no letters, ever.
export const miniTileClassesByColour: Record<TileColour, string> = {
  green: "bg-tile-correct",
  yellow: "bg-tile-present",
  grey: "bg-tile-absent",
};
export const miniTileEmptyClasses = "border border-tile-border/40";
