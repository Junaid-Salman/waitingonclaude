import { describe, expect, test } from "vitest";
import { asConnection, fakeCtx } from "./helpers/party-server";
import { createRoomServer } from "../party/main";
import { createSoloServer } from "../party/solo";

// Binary frames must count toward the per-socket frame limit like any other junk (Spec 2.9), so
// these drive the PartyServer adapters themselves, not just the rules behind them.
const binary = new Uint8Array([1, 2, 3]).buffer;

function fakeConn(id: string) {
  const sent: { type: string }[] = [];
  const conn = asConnection({ id, send: (m: string) => sent.push(JSON.parse(m)), close: () => {} });
  return { conn, sent };
}

describe("adapters count every frame", () => {
  test("room: 29 binary frames after the join use up the 30-frame budget", () => {
    const { conn, sent } = fakeConn("c1");
    const Server = createRoomServer();
    const server = new Server(fakeCtx("ABCD"), {});
    server.getConnection = ((id: string) => (id === "c1" ? conn : undefined)) as typeof server.getConnection;
    server.onRequest({ method: "POST" } as Request);
    server.onConnect(conn);
    server.onMessage(conn, JSON.stringify({ type: "join", playerId: "secret-1", name: "Ali" }));
    expect(sent.map((m) => m.type)).toEqual(["lobby"]);
    for (let i = 0; i < 29; i++) server.onMessage(conn, binary);
    server.onMessage(conn, JSON.stringify({ type: "settings", roundSeconds: 300 }));
    expect(sent.map((m) => m.type)).toEqual(["lobby"]); // the settings frame was over the limit
  });

  test("room: without the flood the same settings frame is answered (the test above is not vacuous)", () => {
    const { conn, sent } = fakeConn("c1");
    const Server = createRoomServer();
    const server = new Server(fakeCtx("ABCD"), {});
    server.getConnection = ((id: string) => (id === "c1" ? conn : undefined)) as typeof server.getConnection;
    server.onRequest({ method: "POST" } as Request);
    server.onConnect(conn);
    server.onMessage(conn, JSON.stringify({ type: "join", playerId: "secret-1", name: "Ali" }));
    server.onMessage(conn, JSON.stringify({ type: "settings", roundSeconds: 300 }));
    expect(sent.map((m) => m.type)).toEqual(["lobby", "lobby"]);
  });

  test("solo: 30 binary frames use up the budget", () => {
    const { conn, sent } = fakeConn("c1");
    const Server = createSoloServer({ pickAnswer: () => "crane" });
    const server = new Server(fakeCtx("solo"), {});
    server.onConnect(conn);
    for (let i = 0; i < 30; i++) server.onMessage(conn, binary);
    server.onMessage(conn, JSON.stringify({ type: "guess", word: "slate" }));
    expect(sent.map((m) => m.type)).toEqual(["soloStart"]);
  });

  test("solo: without the flood the same guess is answered (the test above is not vacuous)", () => {
    const { conn, sent } = fakeConn("c1");
    const Server = createSoloServer({ pickAnswer: () => "crane" });
    const server = new Server(fakeCtx("solo"), {});
    server.onConnect(conn);
    server.onMessage(conn, JSON.stringify({ type: "guess", word: "slate" }));
    expect(sent.map((m) => m.type)).toEqual(["soloStart", "guessResult"]);
  });
});
