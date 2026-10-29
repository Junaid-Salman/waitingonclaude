import answerData from "../../data/answers.json";
import guessData from "../../data/guesses.json";

export const answers: readonly string[] = answerData;
const guessSet: ReadonlySet<string> = new Set(guessData);

// The server trims and lowercases before every check; clients are never trusted to do it.
export function normalise(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidGuess(word: string): boolean {
  return guessSet.has(word);
}
