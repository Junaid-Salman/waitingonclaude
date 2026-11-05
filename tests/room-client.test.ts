import { beforeEach, describe, expect, test, vi } from "vitest";

// A stand-in for partysocket: records frames, and lets a test open, drop and reopen it.
const sockets: FakeSocket[] = [];
class FakeSocket extends EventTarget {
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  closed = false;
  constructor() {
    super();
    sockets.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  drop() {
    this.readyState = 0;
    this.dispatchEvent(new Event("close"));
  }
}
vi.mock("partysocket", () => ({ default: FakeSocket }));

const { connectRoom } = await import("../src/lib/room/room-client");
const { useRoom } = await import("../src/lib/room/store");

beforeEach(() => {
  sockets.length = 0;
  useRoom.getState().reset();
});

const types = (s: FakeSocket) => s.sent.map((f) => JSON.parse(f).type);

describe("room connection", () => {
  test("joins on every open, so a reconnect re-joins by itself", () => {
    connectRoom({ code: "ABCD", playerId: "secret", name: "Ali" });
    const s = sockets[0];
    s.open();
    s.drop();
    s.open();
    expect(types(s)).toEqual(["join", "join"]);
  });

  test("a send while the socket is not open is dropped, not queued behind the re-join", () => {
    const conn = connectRoom({ code: "ABCD", playerId: "secret", name: "Ali" });
    const s = sockets[0];
    conn.send({ type: "start" }); // before the first open
    s.open();
    conn.send({ type: "guess", word: "crane" });
    s.drop();
    conn.send({ type: "guess", word: "slate" }); // during the drop
    s.open();
    expect(s.sent.map((f) => JSON.parse(f))).toEqual([
      { type: "join", playerId: "secret", name: "Ali" },
      { type: "guess", word: "crane" },
      { type: "join", playerId: "secret", name: "Ali" },
    ]);
  });

  test("a drop marks the room as reconnecting, but our own close does not", () => {
    const conn = connectRoom({ code: "ABCD", playerId: "secret", name: "Ali" });
    const s = sockets[0];
    s.open();
    s.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "lobby", players: [], roundSeconds: 180, youId: "a1", phase: "lobby" }) }));
    s.drop();
    expect(useRoom.getState().reconnecting).toBe(true);
    s.open();
    s.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ type: "lobby", players: [], roundSeconds: 180, youId: "a1", phase: "lobby" }) }));
    conn.close();
    s.dispatchEvent(new Event("close"));
    expect(useRoom.getState().reconnecting).toBe(false);
  });
});
