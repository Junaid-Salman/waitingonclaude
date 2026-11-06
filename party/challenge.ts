import { Server, type Connection, type WSMessage } from "partyserver";
import { createRequestLimiter, handleChallengeRequest, REQUEST_LIMITS, type RequestLimits } from "./challenge/seal";
import { createChallengeSession, parseChallengeFrame, type ChallengeSession } from "./challenge/session";
import { isChallengeConfigured, openChallenge } from "./challenge/token";
import { createWindowLimiter, LIMITS } from "./rate-limit";
import { realClock } from "./room/room";

// CHALLENGE_KEY is a Worker secret (`wrangler secret put`); `.dev.vars` or the e2e config locally.
export interface ChallengeEnv {
  CHALLENGE_KEY?: string;
}

export interface ChallengeServerOptions {
  // Test-only knobs, injected by party/e2e/challenge-test.ts. Production uses the defaults.
  timeScale?: number;
  revealMs?: number;
  // Every local caller shares one address, so the e2e server raises these.
  requestLimits?: RequestLimits;
}

// Thin PartyServer adapter. The same party serves the seal/check HTTP routes (fixed room ids) and one
// solver socket per random room id. All rules live in challenge/session.ts and challenge/seal.ts.
export function createChallengeServer(opts: ChallengeServerOptions = {}) {
  return class ChallengeServer extends Server<ChallengeEnv> {
    // Keyed by connection id so two sockets in one room never share a run.
    private runs = new Map<string, ChallengeSession>();
    private frames = createWindowLimiter({ ...LIMITS.frames, now: realClock.now });
    private requests = createRequestLimiter(realClock.now, opts.requestLimits ?? REQUEST_LIMITS, realClock.setTimer);

    onRequest(req: Request) {
      return handleChallengeRequest(req, this.name, this.env, undefined, this.requests);
    }

    onConnect(conn: Connection) {
      const session = createChallengeSession({
        clock: realClock,
        send: (message) => conn.send(JSON.stringify(message)),
        revealMs: opts.revealMs,
        timeScale: opts.timeScale,
      });
      this.runs.set(conn.id, session);
    }

    async onMessage(sender: Connection, message: WSMessage) {
      // Counted before parsing, so junk frames use up the budget too.
      if (!this.frames.allow(sender.id)) return;
      if (typeof message !== "string") return;
      const session = this.runs.get(sender.id);
      const frame = parseChallengeFrame(message);
      if (!session || !frame) return;

      if (frame.type === "guess") {
        session.guess(frame.word);
        return;
      }
      const key = this.env.CHALLENGE_KEY;
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

    onClose(conn: Connection) {
      this.runs.get(conn.id)?.close();
      this.runs.delete(conn.id);
      this.frames.forget(conn.id);
    }
  };
}

const ChallengeServer = createChallengeServer();
export default ChallengeServer;
