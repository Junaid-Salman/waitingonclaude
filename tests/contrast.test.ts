import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { inputClasses, miniTileClassesByColour, themes, type ColourToken } from "../src/lib/colors";
import config from "../tailwind.config";

// design/tokens.json is the design's source (Figma variables were built from it); src/lib/colors.ts
// is the code's. They must agree, and every pair the UI draws must keep its contrast in both themes.
const tokens = JSON.parse(readFileSync(join(__dirname, "..", "design", "tokens.json"), "utf8")) as {
  primitives: Record<string, string>;
  semantic: Record<string, { light: string; dark: string }>;
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum]: 4.5 for text, 3 for UI parts (WCAG 2.2 AA 1.4.3 and 1.4.11).
const PAIRS: [ColourToken, ColourToken, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "surface", 4.5],
  ["muted", "background", 4.5],
  ["muted", "surface", 4.5],
  ["tile-correct-fg", "tile-correct", 3], // tile letters are large bold text
  ["tile-present-fg", "tile-present", 4.5],
  ["tile-absent-fg", "tile-absent", 4.5],
  ["key-idle-fg", "key-idle", 4.5],
  ["key-absent-fg", "key-absent", 4.5],
  ["primary-fg", "primary", 4.5],
  ["accent-fg", "accent", 4.5],
  ["invalid", "background", 4.5],
  ["invalid", "surface", 4.5],
  ["success", "surface", 4.5], // "Solved" status text
  ["success", "background", 4.5],
  ["tile-present-edge", "background", 3],
  ["tile-typed", "background", 3],
  ["focus", "background", 3],
  ["primary", "background", 3],
];

describe("design tokens and contrast", () => {
  test("colors.ts matches design/tokens.json in both themes", () => {
    for (const [token, { light, dark }] of Object.entries(tokens.semantic)) {
      expect(themes.light[token as ColourToken], `light ${token}`).toBe(tokens.primitives[light].toLowerCase());
      expect(themes.dark[token as ColourToken], `dark ${token}`).toBe(tokens.primitives[dark].toLowerCase());
    }
  });

  for (const theme of ["light", "dark"] as const) {
    test.each(PAIRS)(`${theme}: %s on %s is at least %s:1`, (fg, bg, min) => {
      expect(contrast(themes[theme][fg], themes[theme][bg])).toBeGreaterThanOrEqual(min);
    });
  }

  // Outlines are checked from the class maps themselves, so a changed class cannot slip past.
  const borderToken = (classes: string) => /(?:^|\s)border-([a-z-]+)(?:\s|$)/.exec(classes)?.[1] as ColourToken | undefined;
  for (const theme of ["light", "dark"] as const) {
    test(`${theme}: the resting input outline is at least 3:1 (M3)`, () => {
      const token = borderToken(inputClasses);
      expect(token, inputClasses).toBeDefined();
      for (const bg of ["surface", "background"] as const) expect(contrast(themes[theme][token!], themes[theme][bg])).toBeGreaterThanOrEqual(3);
    });
    test(`${theme}: a yellow mini cell is told apart from its card (fill or edge at least 3:1)`, () => {
      const classes = miniTileClassesByColour.yellow;
      const fill = contrast(themes[theme]["tile-present"], themes[theme].surface);
      const edge = borderToken(classes);
      expect(Math.max(fill, edge ? contrast(themes[theme][edge], themes[theme].surface) : 0), classes).toBeGreaterThanOrEqual(3);
    });
  }

  test("the hard shadow is ink in light and disappears into the background in dark", () => {
    expect(themes.light.shadow).toBe(themes.light.foreground);
    expect(themes.dark.shadow).toBe(themes.dark.background);
    const shadows = Object.values(config.theme?.extend?.boxShadow ?? {});
    expect(shadows.length).toBeGreaterThan(0);
    for (const s of shadows) expect(s).toContain("var(--shadow)");
  });
});
