// Fonts, text weights and the type scale. Colours come from src/lib/colors.ts, the only place a
// colour value may be written. Loaded by Tailwind 4 through `@config` in src/app/globals.css.
import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";
import { themes, type ColourToken } from "./src/lib/colors";

export const typographyWeights = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  // Bricolage Grotesque ExtraBold, the display face of design C.
  extrabold: "800",
} as const;

// Class names are `<weight>-<scale step>`, for example `semibold-display-sm` or `regular-text-md`.
export const typographyScale = {
  "display-3xl": { fontSize: "5rem", lineHeight: "5.25rem" },
  "display-2xl": { fontSize: "4.5rem", lineHeight: "5.625rem" },
  "display-xl": { fontSize: "3.75rem", lineHeight: "4.5rem" },
  "display-lg": { fontSize: "3rem", lineHeight: "3.75rem" },
  "display-md": { fontSize: "2.25rem", lineHeight: "2.75rem" },
  "display-sm": { fontSize: "1.875rem", lineHeight: "2.375rem" },
  "display-xs": { fontSize: "1.5rem", lineHeight: "2rem" },
  "text-xl": { fontSize: "1.25rem", lineHeight: "1.875rem" },
  "text-lg": { fontSize: "1.125rem", lineHeight: "1.75rem" },
  "text-md": { fontSize: "1rem", lineHeight: "1.5rem" },
  "text-sm": { fontSize: "0.875rem", lineHeight: "1.25rem" },
  "text-xs": { fontSize: "0.75rem", lineHeight: "1.125rem" },
} as const;

export function buildTypographyClasses() {
  const classes: Record<string, { fontWeight: string; fontSize: string; lineHeight: string }> = {};
  for (const [weight, fontWeight] of Object.entries(typographyWeights)) {
    for (const [step, size] of Object.entries(typographyScale)) {
      classes[`.${weight}-${step}`] = { fontWeight, ...size };
    }
  }
  return classes;
}

const toVariables = (theme: Record<string, string>) =>
  Object.fromEntries(Object.entries(theme).map(([token, value]) => [`--${token}`, value]));

const colourUtilities = Object.fromEntries(
  (Object.keys(themes.light) as ColourToken[]).map((token) => [token, `var(--${token})`]),
);

const config: Config = {
  theme: {
    extend: {
      colors: colourUtilities,
      // The font variables are set by next/font in src/app/layout.tsx (self-hosted at build time).
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "sans-serif"],
      },
      // Hard offset shadows of the game pieces. Their colour is the --shadow token, which is the
      // background colour in the dark theme, so they drop away there.
      boxShadow: {
        piece: "3px 3px 0 0 var(--shadow)",
        "piece-key": "0 3px 0 0 var(--shadow)",
        "piece-lg": "6px 6px 0 0 var(--shadow)",
        "piece-pressed": "1px 1px 0 0 var(--shadow)",
      },
    },
  },
  plugins: [
    plugin(function ({ addBase, addComponents }) {
      addBase({
        ":root": toVariables(themes.light),
        "@media (prefers-color-scheme: dark)": { ":root": toVariables(themes.dark) },
      });
      addComponents(buildTypographyClasses());
    }),
  ],
};

export default config;
