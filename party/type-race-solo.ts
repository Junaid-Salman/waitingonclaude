import { Server } from "partyserver";
import { handlePassageRequest, PASSAGE_LIMIT, type PassagePicker } from "./games/type-race/passage-http";
import { createWindowLimiter } from "./rate-limit";
import { realClock } from "./room/room";

export interface TypeRaceSoloOptions {
  // Test-only knobs, injected by party/e2e/type-race-test.ts. Production uses the defaults.
  pick?: PassagePicker;
  // Every local caller shares one address, so the e2e server raises this.
  passageLimit?: { limit: number; windowMs: number };
}

// Thin PartyServer adapter for party `type-race-solo`. 8.1 serves only the passage route; the
// Challenge seal route and solver sockets come in 8.3. All rules live in games/type-race/.
export function createTypeRaceSoloServer(opts: TypeRaceSoloOptions = {}) {
  return class TypeRaceSoloServer extends Server {
    private passageRequests = createWindowLimiter({ ...(opts.passageLimit ?? PASSAGE_LIMIT), now: realClock.now, setTimer: realClock.setTimer });

    onRequest(req: Request) {
      return handlePassageRequest(req, this.name, this.passageRequests, opts.pick);
    }
  };
}

const TypeRaceSoloServer = createTypeRaceSoloServer();
export default TypeRaceSoloServer;
