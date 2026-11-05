import { describe, expect, test } from "vitest";
import config, { buildTypographyClasses, typographyScale, typographyWeights } from "../tailwind.config";
import { themes } from "../src/lib/colors";

describe("tailwind config", () => {
  const classes = buildTypographyClasses();

  test("generates every weight at every step", () => {
    expect(Object.keys(classes)).toHaveLength(Object.keys(typographyWeights).length * Object.keys(typographyScale).length);
    expect(Object.keys(classes)).toHaveLength(60); // 5 weights x 12 steps
  });

  test.each([
    [".regular-display-2xl", "400", "4.5rem", "5.625rem"],
    [".bold-display-xs", "700", "1.5rem", "2rem"],
    [".semibold-display-sm", "600", "1.875rem", "2.375rem"],
    [".medium-text-lg", "500", "1.125rem", "1.75rem"],
    [".regular-text-md", "400", "1rem", "1.5rem"],
    [".semibold-text-xs", "600", "0.75rem", "1.125rem"],
    [".extrabold-display-3xl", "800", "5rem", "5.25rem"],
  ])("%s", (name, fontWeight, fontSize, lineHeight) => {
    expect(classes[name]).toEqual({ fontWeight, fontSize, lineHeight });
  });

  test("no value has stray whitespace", () => {
    for (const rule of Object.values(classes)) {
      for (const value of Object.values(rule)) expect(value).toBe(value.trim());
    }
  });

  test("every colour token becomes a CSS-variable utility", () => {
    const colours = config.theme?.extend?.colors as Record<string, string>;
    expect(Object.keys(colours).sort()).toEqual(Object.keys(themes.light).sort());
    for (const [token, value] of Object.entries(colours)) expect(value).toBe(`var(--${token})`);
  });

  test("fonts use the variables set by next/font (Figtree for text, Bricolage Grotesque for display)", () => {
    const fonts = config.theme?.extend?.fontFamily as Record<string, string[]>;
    expect(fonts.sans[0]).toBe("var(--font-sans)");
    expect(fonts.display[0]).toBe("var(--font-display)");
  });
});
