import type * as Party from "partykit/server";

// Phase 0 stub. Real room logic arrives in Phase 2.
export default class RoomServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    conn.accept();
  }

  onRequest() {
    return new Response("room server up", { status: 200 });
  }
}

RoomServer satisfies Party.Worker;
