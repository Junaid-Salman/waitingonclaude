import type * as Party from "partykit/server";
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

// Thin PartyKit adapter. All rules live in party/room/room.ts.
export function createRoomServer(opts: RoomServerOptions = {}) {
  const found = opts.game ?? getGame("woordle");
  if (!found) throw new Error("woordle game is not registered");
  const game: GameDefinition<unknown, unknown, unknown> = found;

  return class RoomServer implements Party.Server {
    private room = createRoom({
      game,
      clock: realClock,
      graceMs: opts.graceMs,
      // Timers fire outside any message handler, so their effects are applied here.
      emit: (effects) => this.apply(effects),
    });

    constructor(readonly party: Party.Room) {}

    onRequest(req: Party.Request) {
      return handleRoomRequest(req, this.party.id, this.room);
    }

    onConnect(conn: Party.Connection) {
      this.apply(this.room.connect(conn.id));
    }

    onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
      this.apply(this.room.message(sender.id, frameText(message)));
    }

    onClose(conn: Party.Connection) {
      this.apply(this.room.disconnect(conn.id));
    }

    private apply(effects: Effect[]) {
      applyEffects(effects, (id) => this.party.getConnection(id));
    }
  };
}

const RoomServer = createRoomServer();
export default RoomServer;

RoomServer satisfies Party.Worker;
