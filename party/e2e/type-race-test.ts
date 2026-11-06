import { createTypeRaceSoloServer } from "../type-race-solo";
import type { PassagePicker } from "../games/type-race/passage-http";
import { pickPassage } from "../games/type-race/passages";
import { createTypeRaceGame } from "../games/type-race/game";
import type { GameDefinition } from "../games/types";
import { createRoomServer } from "../main";
import { E2E_GRACE_MS, E2E_RACE_LIMIT_MS, E2E_RACE_PASSAGES, E2E_REVEAL_MS, E2E_SHORT_PASSAGES } from "./answers";

// Fixed Practice passages (party/e2e/answers.ts) so a test knows exactly what to type. Medium and long
// come from the real pool.
// Gives the first fixed passage not excluded, in order, so the sequence is the same every run.
const pick: PassagePicker = (length, exclude) => {
  if (length !== "short") return pickPassage(length, exclude, () => 0);
  return E2E_SHORT_PASSAGES.find((p) => !exclude.has(p.id)) ?? E2E_SHORT_PASSAGES[0];
};

// The whole suite calls from one address, so the per-IP limit is raised; the limit itself is covered
// by unit tests.
const TestTypeRaceSoloServer = createTypeRaceSoloServer({ pick, passageLimit: { limit: 10_000, windowMs: 10_000 } });
export default TestTypeRaceSoloServer;

// Room server for Type Race e2e: fixed passages, shrunken limits, 5 s grace. Same rules as production
// (the injected options are the only difference).
export const TestTypeRaceRoomServer = createRoomServer({
  game: createTypeRaceGame({
    pickPassages: (_length, count) => E2E_RACE_PASSAGES.slice(0, count).map((p) => ({ ...p })),
    limitMs: (length) => E2E_RACE_LIMIT_MS[length],
    resultsMs: E2E_REVEAL_MS,
  }) as unknown as GameDefinition<unknown, unknown, unknown>,
  graceMs: E2E_GRACE_MS,
});
