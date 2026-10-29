import { describe, expect, test, vi } from "vitest";
import { applyEffects, type EffectTarget } from "../party/room/apply";
import type { RoomServerMessage } from "../shared/protocol";
import type { Effect } from "../party/room/room";

const lobby: RoomServerMessage = { type: "lobby", players: [], roundSeconds: 180, youId: "x", phase: "lobby" };

describe("applyEffects", () => {
  test("sends JSON to the right connection and closes with the code", () => {
    const a = { send: vi.fn(), close: vi.fn() };
    const b = { send: vi.fn(), close: vi.fn() };
    const targets: Record<string, EffectTarget> = { a, b };
    const effects: Effect[] = [
      { kind: "send", to: "a", message: lobby },
      { kind: "close", connId: "b", code: 4001 },
    ];
    applyEffects(effects, (id) => targets[id]);
    expect(a.send).toHaveBeenCalledWith(JSON.stringify(lobby));
    expect(b.close).toHaveBeenCalledWith(4001);
    expect(a.close).not.toHaveBeenCalled();
  });

  test("a connection that throws does not stop the rest of the batch", () => {
    const dead = {
      send: vi.fn(() => {
        throw new Error("Network connection lost");
      }),
      close: vi.fn(),
    };
    const alive = { send: vi.fn(), close: vi.fn() };
    const targets: Record<string, EffectTarget> = { dead, alive };
    const effects: Effect[] = [
      { kind: "send", to: "dead", message: lobby },
      { kind: "send", to: "alive", message: lobby },
    ];
    expect(() => applyEffects(effects, (id) => targets[id])).not.toThrow();
    expect(alive.send).toHaveBeenCalledTimes(1);
  });

  test("an unknown connection is skipped", () => {
    const alive = { send: vi.fn(), close: vi.fn() };
    applyEffects(
      [
        { kind: "send", to: "gone", message: lobby },
        { kind: "send", to: "alive", message: lobby },
      ],
      (id) => (id === "alive" ? alive : undefined),
    );
    expect(alive.send).toHaveBeenCalledTimes(1);
  });
});
