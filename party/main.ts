import { Server, type Connection, type WSMessage } from "partyserver";
import { getGame } from "./games";
import type { GameDefinition } from "./games/types";
import { applyEffects } from "./room/apply";
import { frameText } from "./rate-limit";
import { handleRoomRequest } from "./room/http";
import { createRoom, realClock, type Effect } from "./room/room";

export interface RoomServerOptions {
  // Defaults to the registered Woordle game. The e2e server passes one with fixed answers and a
  // time scale.
  game?: GameDefinition<unknown, unknown, unknown>;
  // Reconnect grace; defaults to 60 s. The e2e server shrinks it so expiry is testable.
  graceMs?: number;
}

// Thin PartyServer adapter (a Durable Object per room). All rules live in party/room/room.ts.
// Hibernation stays off (the default): rooms and their timers live in memory.
export function createRoomServer(opts: RoomServerOptions = {}) {
  const found = opts.game ?? getGame("woordle");
  if (!found) throw new Error("woordle game is not registered");
  const game: GameDefinition<unknown, unknown, unknown> = found;

  return class RoomServer extends Server {
    private room = createRoom({
      game,
      clock: realClock,
      graceMs: opts.graceMs,
      // Timers fire outside any message handler, so their effects are applied here.
      emit: (effects) => this.apply(effects),
    });

    onRequest(req: Request) {
      return handleRoomRequest(req, this.name, this.room);
    }

    onConnect(conn: Connection) {
      this.apply(this.room.connect(conn.id));
    }

    onMessage(sender: Connection, message: WSMessage) {
      this.apply(this.room.message(sender.id, frameText(message)));
    }

    onClose(conn: Connection) {
      this.apply(this.room.disconnect(conn.id));
    }

    private apply(effects: Effect[]) {
      applyEffects(effects, (id) => this.getConnection(id));
    }
  };
}

const RoomServer = createRoomServer();
export default RoomServer;
