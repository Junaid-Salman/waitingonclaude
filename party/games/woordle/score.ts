import type { TileColour } from "../../../shared/protocol";

// Two passes: greens first, then yellows from the remaining letter counts, so a repeated
// letter is coloured only as many times as it appears in the answer.
export function scoreGuess(guess: string, answer: string): TileColour[] {
  const result: TileColour[] = Array.from({ length: 5 }, (): TileColour => "grey");
  const remaining = new Map<string, number>();

  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "green";
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) ?? 0) + 1);
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] === "green") continue;
    const count = remaining.get(guess[i]) ?? 0;
    if (count > 0) {
      result[i] = "yellow";
      remaining.set(guess[i], count - 1);
    }
  }

  return result;
}
