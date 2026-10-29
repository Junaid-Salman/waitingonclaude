import { describe, expect, test } from "vitest";
import {
  buttonClasses,
  keyClassesByColour,
  keyClassesIdle,
  palette,
  themes,
  tileClassesByColour,
  tileClassesUnscored,
} from "../src/lib/colors";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("colour tokens", () => {
  test("light and dark define exactly the same tokens", () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });

  test("every value is a 6-digit hex", () => {
    for (const theme of [themes.light, themes.dark]) {
      for (const [token, value] of Object.entries(theme)) expect(value, token).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test("every token value comes from the palette", () => {
    const values = new Set<string>();
    const walk = (node: unknown) => {
      if (typeof node === "string") values.add(node);
      else if (node && typeof node === "object") Object.values(node).forEach(walk);
    };
    walk(palette);
    for (const theme of [themes.light, themes.dark]) {
      for (const [token, value] of Object.entries(theme)) expect(values.has(value), token).toBe(true);
    }
  });

  const pairs: [fg: keyof typeof themes.light, bg: keyof typeof themes.light][] = [
    ["tile-correct-fg", "tile-correct"],
    ["tile-present-fg", "tile-present"],
    ["tile-absent-fg", "tile-absent"],
    ["key-absent-fg", "key-absent"],
    ["foreground", "background"],
    ["foreground", "key-idle"],
    ["muted", "background"],
  ];
  for (const themeName of ["light", "dark"] as const) {
    test.each(pairs)(`${themeName}: %s on %s is at least 4.5:1`, (fg, bg) => {
      const theme = themes[themeName];
      expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }

  test("class maps only use defined tokens", () => {
    const tokens = new Set(Object.keys(themes.light));
    const classes = [
      ...Object.values(tileClassesByColour),
      ...Object.values(keyClassesByColour),
      ...Object.values(tileClassesUnscored),
      keyClassesIdle,
      buttonClasses,
    ].flatMap((s) => s.split(/\s+/));
    for (const cls of classes) {
      const token = cls.replace(/^(bg|text|border)-/, "").replace(/\/\d+$/, "");
      expect(tokens.has(token), cls).toBe(true);
    }
  });
});
