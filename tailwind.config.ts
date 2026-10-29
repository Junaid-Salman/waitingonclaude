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
} as const;

// Class names are `<weight>-<scale step>`, for example `semibold-display-sm` or `regular-text-md`.
export const typographyScale = {
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
      // The Geist variables are set by next/font in src/app/layout.tsx.
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
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
