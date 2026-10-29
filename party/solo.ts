import type * as Party from "partykit/server";
import { answers } from "./games/woordle/words";
import { pickAnswer } from "./games/woordle/pick";
import { createSoloSession, type SoloSession } from "./games/woordle/solo-session";

// Phase 1 scaffold: one single-player game per connection, before rooms exist.
// Its fate (remove or keep as practice mode) is decided in Phase 3.
export function createSoloServer(opts: { pickAnswer: () => string }) {
  return class SoloServer implements Party.Server {
    // Keyed by connection id so two sockets in one room never share a game.
    private sessions = new Map<string, SoloSession>();

    constructor(readonly room: Party.Room) {}

    onConnect(conn: Party.Connection) {
      const session = createSoloSession(opts);
      this.sessions.set(conn.id, session);
      for (const message of session.start()) conn.send(JSON.stringify(message));
    }

    onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
      if (typeof message !== "string") return;
      const session = this.sessions.get(sender.id);
      if (!session) return;
      for (const reply of session.handle(message)) sender.send(JSON.stringify(reply));
    }

    onClose(conn: Party.Connection) {
      this.sessions.delete(conn.id);
    }
  };
}

const used = new Set<string>();
const SoloServer = createSoloServer({ pickAnswer: () => pickAnswer(answers, used) });
export default SoloServer;

SoloServer satisfies Party.Worker;
