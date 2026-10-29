import type * as Party from "partykit/server";
import { createRoomServer } from "../main";

// Room server for the e2e suite only (partykit.e2e.json). Accepts `{ type: "__setPhase" }` so a test
// can put a room into the match phase before Phase 3 builds real matches.
const TestRoomServer = createRoomServer({ testHooks: true });
export default TestRoomServer;

TestRoomServer satisfies Party.Worker;
