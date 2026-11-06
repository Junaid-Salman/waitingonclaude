import { createRoomServer } from "../main";
import { createWoordleGame } from "../games/woordle/game";
import { E2E_GRACE_MS, E2E_REVEAL_MS, E2E_ROOM_ANSWERS, E2E_ROUND_MS } from "./answers";

// Room server for the e2e suite only (wrangler.e2e.jsonc). Same rules as production with fixed
// answers and shrunken durations, injected through the game factory: no test-only branch exists
// in the room code.
const TestRoomServer = createRoomServer({
  game: createWoordleGame({
    pickAnswers: () => [...E2E_ROOM_ANSWERS],
    limitMs: (seconds) => E2E_ROUND_MS[seconds],
    revealMs: E2E_REVEAL_MS,
  }),
  graceMs: E2E_GRACE_MS,
});
export default TestRoomServer;
