import { expect, test } from "vitest";
import { E2E_ANSWER } from "../party/e2e/answers";
import { isValidGuess } from "../party/games/woordle/words";

test("the fixed e2e answer is a valid guess", () => {
  expect(isValidGuess(E2E_ANSWER)).toBe(true);
});
