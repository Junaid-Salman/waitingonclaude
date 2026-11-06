import { routePartykitRequest } from "partyserver";
import TestChallengeServer from "./challenge-test";
import TestRoomServer from "./main-test";
import FixedSoloServer from "./solo-fixed";
import TestTypeRaceSoloServer from "./type-race-test";

// The e2e Worker (wrangler.e2e.jsonc): the same class names and routes as party/worker.ts, built
// from the e2e factories (fixed answers, shrunken durations, raised per-IP limits).
export { TestRoomServer as Main, TestChallengeServer as Challenge, FixedSoloServer as Solo, TestTypeRaceSoloServer as TypeRaceSolo };

const worker = {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 });
  },
};
export default worker;
