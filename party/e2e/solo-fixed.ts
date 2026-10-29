import type * as Party from "partykit/server";
import { createSoloServer } from "../solo";
import { E2E_ANSWER } from "./answers";

// Every game's answer is the same, so tests do not depend on how many games ran before them.
const FixedSoloServer = createSoloServer({ pickAnswer: () => E2E_ANSWER });
export default FixedSoloServer;

FixedSoloServer satisfies Party.Worker;
