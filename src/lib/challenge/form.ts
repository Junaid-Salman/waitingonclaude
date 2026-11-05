import { WORD_LENGTH, type WordProblem } from "../../../shared/protocol";

// The dictionary lives on the server, so a word is "unknown" until its check comes back.
export type FormVerdict = "unknown" | "checking" | "ok" | WordProblem;

export const normaliseWord = (raw: string): string => raw.trim().toLowerCase();

const WORD_PATTERN = new RegExp(`^[a-z]{${WORD_LENGTH}}$`);
export const isWellFormedWord = (word: string): boolean => WORD_PATTERN.test(word);

interface VerdictInput {
  words: string[];
  index: number;
  // Server verdicts by word, so editing back to a checked word needs no second request.
  verdicts: Record<string, "ok" | "not-a-word">;
  // Reasons the last seal call gave for a field, cleared when that field is edited.
  serverProblems: Record<number, WordProblem>;
  checking: number | null;
}

export function wordVerdict({ words, index, verdicts, serverProblems, checking }: VerdictInput): FormVerdict {
  const word = normaliseWord(words[index]);
  if (!word) return "unknown";
  if (!isWellFormedWord(word)) return "bad-format";
  if (words.findIndex((w, i) => i !== index && normaliseWord(w) === word) !== -1) return "duplicate";
  if (serverProblems[index]) return serverProblems[index];
  if (checking === index) return "checking";
  return verdicts[word] ?? "unknown";
}

// "Create link" is blocked only by a problem we know about: an empty word, or a verdict that names
// a defect. A word that is still unchecked, or whose check failed, is sent anyway: the seal call
// re-validates every word and says which are wrong, so the client's own pre-check is never the gate.
export function canCreate(words: string[], verdicts: FormVerdict[]): boolean {
  return words.every((w) => normaliseWord(w) !== "") && verdicts.every((v) => v === "ok" || v === "unknown" || v === "checking");
}
