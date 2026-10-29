import type * as Party from "partykit/server";

// Phase 0 stub. Seal and solver logic arrives in Phase 4.
export default class ChallengeServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    conn.accept();
  }

  onRequest() {
    return new Response("challenge server up", { status: 200 });
  }
}

ChallengeServer satisfies Party.Worker;
