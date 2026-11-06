import { Server, type Connection, type WSMessage } from "partyserver";
import { answers } from "./games/woordle/words";
import { pickAnswer } from "./games/woordle/pick";
import { createSoloSession, type SoloSession } from "./games/woordle/solo-session";
import { frameText } from "./rate-limit";

// Phase 1 scaffold: one single-player game per connection, before rooms exist.
// Its fate (remove or keep as practice mode) is decided in Phase 3.
export function createSoloServer(opts: { pickAnswer: () => string }) {
  return class SoloServer extends Server {
    // Keyed by connection id so two sockets in one room never share a game.
    private sessions = new Map<string, SoloSession>();

    onConnect(conn: Connection) {
      const session = createSoloSession(opts);
      this.sessions.set(conn.id, session);
      for (const message of session.start()) conn.send(JSON.stringify(message));
    }

    onMessage(sender: Connection, message: WSMessage) {
      const session = this.sessions.get(sender.id);
      if (!session) return;
      for (const reply of session.handle(frameText(message))) sender.send(JSON.stringify(reply));
    }

    onClose(conn: Connection) {
      this.sessions.delete(conn.id);
    }
  };
}

const used = new Set<string>();
const SoloServer = createSoloServer({ pickAnswer: () => pickAnswer(answers, used) });
export default SoloServer;
