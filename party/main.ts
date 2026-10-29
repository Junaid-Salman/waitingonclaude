import type * as Party from "partykit/server";
import { handleRoomRequest } from "./room/http";
import { applyEffects } from "./room/apply";
import { createRoom, type Effect } from "./room/room";

// Thin PartyKit adapter. All rules live in party/room/room.ts.
export function createRoomServer(opts: { testHooks?: boolean } = {}) {
  return class RoomServer implements Party.Server {
    private room = createRoom({ testHooks: opts.testHooks });

    constructor(readonly party: Party.Room) {}

    onRequest(req: Party.Request) {
      return handleRoomRequest(req, this.party.id, this.room);
    }

    onConnect(conn: Party.Connection) {
      this.apply(this.room.connect(conn.id));
    }

    onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
      if (typeof message !== "string") return;
      this.apply(this.room.message(sender.id, message));
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
