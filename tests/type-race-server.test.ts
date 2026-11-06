import { describe, expect, test } from "vitest";
import { getGame } from "../party/games";
import { createRoomServer } from "../party/main";
import { asConnection, fakeCtx } from "./helpers/party-server";

// The Type Race room DO is createRoomServer({ game }): no adapter of its own, so this drives the
// real adapter with the registered game, the way party/worker.ts builds it.
function fakeConn(id: string) {
  const sent: Record<string, unknown>[] = [];
  const conn = asConnection({ id, send: (m: string) => sent.push(JSON.parse(m)), close: () => {} });
  return { conn, sent };
}

const build = () => {
  const Server = createRoomServer({ game: getGame("type-race") });
  return new Server(fakeCtx("ABCD"), {});
};

describe("party type-race (room adapter)", () => {
  test("POST creates the room once: 201 then 409", async () => {
    const server = build();
    expect(server.onRequest(new Request("https://x/parties/type-race/ABCD", { method: "POST" })).status).toBe(201);
    expect(server.onRequest(new Request("https://x/parties/type-race/ABCD", { method: "POST" })).status).toBe(409);
  });

  test("a socket joins and gets a lobby with races and length, not roundSeconds", () => {
    const server = build();
    server.onRequest(new Request("https://x/parties/type-race/ABCD", { method: "POST" }));
    const { conn, sent } = fakeConn("c1");
    server.getConnection = ((id: string) => (id === "c1" ? conn : undefined)) as typeof server.getConnection;
    server.onConnect(conn);
    server.onMessage(conn, JSON.stringify({ type: "join", playerId: "secret-player-1", name: "Ali" }));
    expect(sent[0]).toMatchObject({ type: "lobby", races: 5, length: "short", phase: "lobby" });
    expect(sent[0]).not.toHaveProperty("roundSeconds");
    server.onMessage(conn, JSON.stringify({ type: "settings", races: 3, length: "long" }));
    expect(sent[1]).toMatchObject({ races: 3, length: "long" });
    expect(JSON.stringify(sent)).not.toContain("secret-player-1");
  });

  test("a socket to a room that was never created gets room-not-found", () => {
    const server = build();
    const { conn, sent } = fakeConn("c1");
    server.getConnection = ((id: string) => (id === "c1" ? conn : undefined)) as typeof server.getConnection;
    server.onConnect(conn);
    expect(sent).toEqual([{ type: "error", code: "room-not-found" }]);
  });
});
