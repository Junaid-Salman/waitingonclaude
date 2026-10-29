import { MAX_NAME_LENGTH } from "../../shared/protocol";

// Control and invisible formatting characters (zero-width, bidi overrides) are stripped so a name
// cannot hide or reorder text in the lobby.
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

// Returns the cleaned name, or null when nothing usable is left.
export function cleanName(raw: string): string | null {
  const collapsed = raw.replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  const name = Array.from(collapsed).slice(0, MAX_NAME_LENGTH).join("").trim();
  // Needs something a person can read: a letter, a digit, or an emoji. "!!!" is not a name.
  return /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(name) ? name : null;
}

// "Ali", then "Ali 2", "Ali 3" in join order. Matching ignores case, and a suffix another player
// already holds (someone literally named "Ali 2") is skipped.
export function uniqueName(existing: readonly string[], name: string): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
