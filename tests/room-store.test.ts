import { beforeEach, describe, expect, test } from "vitest";
import { useRoom } from "../src/lib/room/store";

const lobby = {
  type: "lobby",
  players: [
    { id: "a1", name: "Ali", isHost: true, connected: true },
    { id: "b2", name: "Bo", isHost: false, connected: true },
  ],
  roundSeconds: 300,
  youId: "b2",
} as const;

beforeEach(() => useRoom.getState().reset());

describe("room store", () => {
  test("starts idle", () => {
    expect(useRoom.getState().status).toBe("idle");
  });

  test("connecting clears old state", () => {
    useRoom.getState().receive({ ...lobby, players: [...lobby.players] });
    useRoom.getState().connecting();
    expect(useRoom.getState()).toMatchObject({ status: "connecting", players: [], youId: null });
  });

  test("a lobby message sets players, round length and youId", () => {
    useRoom.getState().receive({ ...lobby, players: [...lobby.players] });
    expect(useRoom.getState()).toMatchObject({ status: "joined", roundSeconds: 300, youId: "b2" });
    expect(useRoom.getState().players.map((p) => p.name)).toEqual(["Ali", "Bo"]);
  });

  test("each lobby replaces the last instead of merging", () => {
    useRoom.getState().receive({ ...lobby, players: [...lobby.players] });
    useRoom.getState().receive({ ...lobby, players: [lobby.players[1]] });
    expect(useRoom.getState().players.map((p) => p.name)).toEqual(["Bo"]);
  });

  test.each(["room-full", "room-not-found", "match-in-progress", "replaced", "invalid-name"] as const)(
    "error %s is recorded",
    (code) => {
      useRoom.getState().receive({ type: "error", code });
      expect(useRoom.getState()).toMatchObject({ status: "error", error: code });
    },
  );

  test("a lobby after an error clears the error", () => {
    useRoom.getState().receive({ type: "error", code: "replaced" });
    useRoom.getState().receive({ ...lobby, players: [...lobby.players] });
    expect(useRoom.getState()).toMatchObject({ status: "joined", error: null });
  });
});
