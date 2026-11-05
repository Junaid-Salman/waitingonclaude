import type * as Party from "partykit/server";
import { createChallengeServer } from "../challenge";
import { E2E_REVEAL_MS, E2E_TIME_SCALE } from "./answers";

// Challenge server for the e2e suite only (partykit.e2e.json): the same rules with shrunken round
// limits, injected through the factory so production code has no test branch.
const TestChallengeServer = createChallengeServer({ timeScale: E2E_TIME_SCALE, revealMs: E2E_REVEAL_MS });
export default TestChallengeServer;

TestChallengeServer satisfies Party.Worker;
