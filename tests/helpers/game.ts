import { createWoordleGame, type WoordleOptions } from "../../party/games/woordle/game";

// Five distinct answers, in round order, for tests that play a whole match.
export const MATCH_ANSWERS = ["crane", "slate", "robot", "moist", "light"];

export const testGame = (options: WoordleOptions = {}) =>
  createWoordleGame({ pickAnswers: () => [...MATCH_ANSWERS], ...options });
