import type * as Party from "partykit/server";
import { handleChallengeRequest } from "./challenge/seal";
import { createChallengeSession, parseChallengeFrame, type ChallengeSession } from "./challenge/session";
import { isChallengeConfigured, openChallenge } from "./challenge/token";
import { realClock } from "./room/room";

export interface ChallengeServerOptions {
  // Test-only knobs, injected by party/e2e/challenge-test.ts. Production uses the defaults.
  timeScale?: number;
  revealMs?: number;
}

// Thin PartyKit adapter. The same party serves the seal/check HTTP routes (fixed room ids) and one
// solver socket per random room id. All rules live in challenge/session.ts and challenge/seal.ts.
export function createChallengeServer(opts: ChallengeServerOptions = {}) {
  return class ChallengeServer implements Party.Server {
    // Keyed by connection id so two sockets in one room never share a run.
    private runs = new Map<string, ChallengeSession>();

    constructor(readonly room: Party.Room) {}

    onRequest(req: Party.Request) {
      return handleChallengeRequest(req, this.room.id, this.room.env);
    }

    onConnect(conn: Party.Connection) {
      const session = createChallengeSession({
        clock: realClock,
        send: (message) => conn.send(JSON.stringify(message)),
        revealMs: opts.revealMs,
        timeScale: opts.timeScale,
      });
      this.runs.set(conn.id, session);
    }

    async onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
      if (typeof message !== "string") return;
      const session = this.runs.get(sender.id);
      const frame = parseChallengeFrame(message);
      if (!session || !frame) return;

      if (frame.type === "guess") {
        session.guess(frame.word);
        return;
      }
      const key = this.room.env.CHALLENGE_KEY;
      // A missing key is our fault, not a bad link: say so instead of "expired".
      if (!(await isChallengeConfigured(key))) {
        sender.send(JSON.stringify({ type: "error", code: "unavailable" }));
        return;
      }
      const opened = await openChallenge(frame.token, key);
      if (!this.runs.has(sender.id)) return; // closed while decrypting
      // A second begin that was decrypting in parallel is ignored by the session while a run is live.
      if (opened.ok) session.start(opened.payload);
      else sender.send(JSON.stringify({ type: "error", code: "invalid-token" }));
    }

    onClose(conn: Party.Connection) {
      this.runs.get(conn.id)?.close();
      this.runs.delete(conn.id);
    }
  };
}

const ChallengeServer = createChallengeServer();
export default ChallengeServer;

ChallengeServer satisfies Party.Worker;
