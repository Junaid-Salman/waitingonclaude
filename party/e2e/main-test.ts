import type * as Party from "partykit/server";
import { createRoomServer } from "../main";
import { createWoordleGame } from "../games/woordle/game";
import { E2E_REVEAL_MS, E2E_ROOM_ANSWERS, E2E_TIME_SCALE } from "./answers";

// Room server for the e2e suite only (partykit.e2e.json). Same rules as production with fixed
// answers and shrunken durations, injected through the game factory: no test-only branch exists
// in the room code.
const TestRoomServer = createRoomServer({
  game: createWoordleGame({
    pickAnswers: () => [...E2E_ROOM_ANSWERS],
    timeScale: E2E_TIME_SCALE,
    revealMs: E2E_REVEAL_MS,
  }),
});
export default TestRoomServer;

TestRoomServer satisfies Party.Worker;
