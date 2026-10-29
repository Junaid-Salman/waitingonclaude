import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

// Colours live in src/lib/colors.ts; type size and weight come from the typography classes in
// tailwind.config.ts. This scans src/ so a stray `text-white`, `#fff` or `text-sm` fails the suite.
const PALETTE_NAMES =
  "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOUR_PREFIXES = "bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|accent|caret|shadow";

// (?<![\w-]) keeps `regular-text-sm` from matching `text-sm`.
const rules: { name: string; pattern: RegExp }[] = [
  { name: "hex colour", pattern: /#[0-9a-fA-F]{3,8}\b/ },
  {
    name: "default-palette colour utility",
    pattern: new RegExp(`(?<![\\w-])(?:${COLOUR_PREFIXES})-(?:${PALETTE_NAMES})(?:-\\d{2,3})?(?:/\\d+)?(?![\\w-])`),
  },
  { name: "raw text size utility", pattern: /(?<![\w-])text-(?:xs|sm|base|lg|xl|[2-9]xl|\[\d)/ },
  {
    name: "raw font weight utility",
    pattern: /(?<![\w-])font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?![\w-])/,
  },
  { name: "inline style typography or colour", pattern: /style=\{\{[^}]*\b(?:color|background|fontFamily|fontWeight|fontSize)\b/ },
  { name: "font-family declaration", pattern: /font-family\s*:/ },
];

export function findViolations(source: string, file: string): string[] {
  // colors.ts is the one file allowed to hold hex values.
  const allowHex = file.endsWith("lib/colors.ts");
  return rules
    .filter((rule) => !(allowHex && rule.name === "hex colour"))
    .flatMap((rule) => {
      const match = rule.pattern.exec(source);
      return match ? [`${file}: ${rule.name} "${match[0]}"`] : [];
    });
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx|css)$/.test(path)) yield path;
  }
}

describe("design tokens", () => {
  test("src/ has no raw colours, sizes, weights or font families", () => {
    const root = join(__dirname, "..");
    const violations = [...walk(join(root, "src"))].flatMap((file) =>
      findViolations(readFileSync(file, "utf8"), relative(root, file)),
    );
    expect(violations).toEqual([]);
  });

  test.each([
    ['className="text-white"', "default-palette colour utility"],
    ['className="bg-zinc-500/40"', "default-palette colour utility"],
    ['className="sm:text-3xl"', "raw text size utility"],
    ['className="text-sm"', "raw text size utility"],
    ['className="font-bold"', "raw font weight utility"],
    ['const c = "#fff"', "hex colour"],
    ["body { font-family: Arial }", "font-family declaration"],
    ["<p style={{ color: 'red' }} />", "inline style typography or colour"],
  ])("the scanner flags %s", (source, rule) => {
    expect(findViolations(source, "src/x.tsx").join("\n")).toContain(rule);
  });

  test.each([
    'className="regular-text-sm text-muted bg-tile-correct text-tile-correct-fg font-sans"',
    'className="semibold-display-xs sm:bold-display-sm border-tile-border/40"',
  ])("the scanner passes token classes: %s", (source) => {
    expect(findViolations(source, "src/x.tsx")).toEqual([]);
  });

  test("only colors.ts may hold hex values", () => {
    expect(findViolations('const c = "#0f766e"', "src/lib/colors.ts")).toEqual([]);
    expect(findViolations('const c = "#0f766e"', "src/lib/other.ts")).not.toEqual([]);
  });
});
