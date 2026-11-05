// Single source of truth for the colour scheme. Nothing else in the repo may hold a hex value.
// tailwind.config.ts turns `themes` into CSS variables and Tailwind colour utilities, so a token
// added here is usable as `bg-<token>`, `text-<token>`, `border-<token>`, `fill-<token>` and
// `stroke-<token>` straight away.
//
// The values mirror design/tokens.json (Phase 6, design C "Game night"); tests/contrast.test.ts
// fails if the two drift or a pair loses contrast.
//
// Relative imports only: the Tailwind config loads this file outside the `@/` alias.
import type { TileColour } from "../../shared/protocol";

// The owner's brand colours plus warm neutrals tuned to the paper background. Warm steps run from
// light (50) to dark (975).
export const palette = {
  white: "#ffffff",
  brand: {
    paper: "#f0efe6",
    ink: "#23221d",
    green: "#3f6948",
    red: "#e0214d",
    yellow: "#ffb331",
    night: "#1c1b17",
  },
  warm: {
    50: "#faf9f4",
    150: "#e6e4d9",
    200: "#dedbcd",
    300: "#cfccbe",
    350: "#c9c6b8",
    400: "#a9a699",
    500: "#8c8a80",
    550: "#7d7a6f",
    600: "#6e6b60",
    650: "#66635a",
    700: "#4f4d44",
    750: "#4a4840",
    800: "#45433a",
    850: "#3a3830",
    900: "#26251f",
    975: "#14130f",
  },
  green: { 300: "#6fa77a", 400: "#4e8059" },
  red: { 400: "#f0527a", 600: "#c41a40" },
  yellow: { 700: "#a8740c" },
} as const;

const { brand, warm } = palette;

// Semantic tokens. `-fg` is the text colour that sits on the token of the same name.
// Every token needs a value in both themes; tests/colors.test.ts enforces that.
export const themes = {
  light: {
    background: brand.paper,
    surface: warm[50],
    sunken: warm[150],
    border: warm[300],
    foreground: brand.ink,
    muted: warm[650],
    "tile-border": warm[350],
    "tile-typed": warm[550],
    "tile-correct": brand.green,
    "tile-correct-fg": palette.white,
    "tile-present": brand.yellow,
    "tile-present-fg": brand.ink,
    // Yellow on paper is only 1.55:1, so a present tile also gets a darker edge (3.5:1).
    "tile-present-edge": palette.yellow[700],
    "tile-absent": warm[600],
    "tile-absent-fg": palette.white,
    "key-idle": warm[200],
    "key-idle-fg": brand.ink,
    "key-absent": warm[600],
    "key-absent-fg": palette.white,
    primary: brand.green,
    "primary-fg": palette.white,
    accent: brand.red,
    "accent-fg": palette.white,
    // #e0214d is 4.05:1 on paper, too low for small text, so error text uses a deeper red.
    invalid: palette.red[600],
    // Green text ("Solved · 0:48"). Tile green is a fill; as small text in dark it is too dim.
    success: brand.green,
    focus: brand.ink,
    // The hard offset shadow of the game pieces (shadow-piece in tailwind.config.ts).
    shadow: brand.ink,
    // Behind modal dialogs, drawn at 60%.
    scrim: brand.ink,
  },
  dark: {
    background: brand.night,
    surface: warm[900],
    sunken: warm[975],
    border: warm[800],
    foreground: brand.paper,
    muted: warm[400],
    "tile-border": warm[700],
    "tile-typed": warm[500],
    "tile-correct": palette.green[400],
    "tile-correct-fg": palette.white,
    "tile-present": brand.yellow,
    "tile-present-fg": brand.ink,
    "tile-present-edge": brand.yellow,
    "tile-absent": warm[750],
    "tile-absent-fg": brand.paper,
    "key-idle": warm[850],
    "key-idle-fg": brand.paper,
    // Dimmer than an unused key so spent letters read at a glance.
    "key-absent": warm[900],
    "key-absent-fg": warm[400],
    primary: palette.green[400],
    "primary-fg": palette.white,
    accent: brand.red,
    "accent-fg": palette.white,
    invalid: palette.red[400],
    success: palette.green[300],
    focus: brand.paper,
    // Shadows drop away in the dark theme: the shadow is the background colour.
    shadow: brand.night,
    scrim: warm[975],
  },
} as const satisfies Record<"light" | "dark", Record<string, string>>;

export type ColourToken = keyof (typeof themes)["light"];

// ---- Class maps: whole class names, so Tailwind's source scanner can see them ----

// Every game piece (tile, key, button, card) has an ink outline; filled pieces add the hard shadow.
// Pressing moves a piece down 2 px and shrinks its shadow; reduced motion keeps it still.
const press = "active:translate-y-0.5 active:shadow-piece-pressed motion-reduce:active:translate-y-0 disabled:translate-y-0 disabled:shadow-none";
// Pieces without a resting shadow only move; keys press straight down onto their shadow.
const pressFlat = "active:translate-y-0.5 motion-reduce:active:translate-y-0 disabled:translate-y-0";
const pressKey = "active:translate-y-[3px] active:shadow-none motion-reduce:active:translate-y-0 disabled:translate-y-0";

export const tileClassesByColour: Record<TileColour, string> = {
  green: "bg-tile-correct border-foreground text-tile-correct-fg shadow-piece",
  yellow: "bg-tile-present border-foreground text-tile-present-fg shadow-piece",
  grey: "bg-tile-absent border-foreground text-tile-absent-fg shadow-piece",
};

export const keyClassesByColour: Record<TileColour, string> = {
  green: "bg-tile-correct text-tile-correct-fg",
  yellow: "bg-tile-present text-tile-present-fg",
  grey: "bg-key-absent text-key-absent-fg",
};

export const tileClassesUnscored = {
  typed: "bg-surface border-tile-typed text-foreground shadow-piece",
  empty: "bg-surface border-tile-border",
} as const;

export const keyClassesIdle = "bg-key-idle text-key-idle-fg";
export const keyPieceClasses = `border-2 border-foreground shadow-piece-key ${pressKey}`;

export const buttonClasses = `border-[2.5px] border-foreground bg-primary text-primary-fg shadow-piece ${press}`;
export const secondaryButtonClasses = `border-[2.5px] border-foreground bg-surface text-foreground ${pressFlat}`;
export const accentButtonClasses = `border-[2.5px] border-foreground bg-accent text-accent-fg shadow-piece ${press}`;
export const selectedOptionClasses = buttonClasses;

export const hostBadgeClasses = "border-2 border-foreground bg-tile-present text-tile-present-fg";
export const youBadgeClasses = "border-2 border-foreground bg-surface text-foreground";
export const solvedBadgeClasses = "border-2 border-foreground bg-tile-correct text-tile-correct-fg";

export const cardClasses = "rounded-[18px] border-[2.5px] border-foreground bg-surface shadow-piece-lg";
export const rowClasses = "rounded-xl border-2 border-foreground bg-surface";
export const youRowClasses = "rounded-xl border-2 border-foreground bg-tile-present text-tile-present-fg";

// Resting outline in ink like every other piece: 13:1 or more, where the old warm grey was 1.5:1 (M3).
export const inputClasses = "border-foreground bg-surface text-foreground";
// Replaces inputClasses when invalid, so it carries the same fill and text colour.
export const invalidInputClasses = "border-invalid bg-surface text-foreground";
export const invalidTextClasses = "text-invalid";
export const focusClasses = "focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-focus";

// Opponents' boards are shown as small colour-only cells: no letters, ever.
export const miniTileClassesByColour: Record<TileColour, string> = {
  green: "bg-tile-correct",
  // Yellow on the light card is only 1.7:1, so the cell gets the darker present edge.
  yellow: "bg-tile-present border-[1.5px] border-tile-present-edge",
  grey: "bg-tile-absent",
};
export const miniTileEmptyClasses = "border-[1.5px] border-tile-border";
