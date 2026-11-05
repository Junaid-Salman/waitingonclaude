import { describe, expect, test } from "vitest";
import { createSession, type KeyValueStorage } from "../src/lib/room/session";

const memoryStorage = (): KeyValueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

const throwing: KeyValueStorage = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
  removeItem() {
    throw new Error("blocked");
  },
};

describe("session", () => {
  test("creates a playerId once and keeps returning it", () => {
    let n = 0;
    const session = createSession(memoryStorage(), () => `id-${++n}`);
    expect(session.playerId()).toBe("id-1");
    expect(session.playerId()).toBe("id-1");
  });

  test("a second session over the same storage sees the same playerId (a refresh)", () => {
    const storage = memoryStorage();
    const first = createSession(storage, () => "stored-id");
    first.playerId();
    expect(createSession(storage, () => "other-id").playerId()).toBe("stored-id");
  });

  test("remembers the room and name", () => {
    const session = createSession(memoryStorage());
    expect(session.name()).toBeNull();
    expect(session.joinedRoom()).toBeNull();
    session.remember("ABCD", "Ali");
    expect(session.name()).toBe("Ali");
    expect(session.joinedRoom()).toBe("ABCD");
  });

  test("keeps working in memory when storage throws", () => {
    let n = 0;
    const session = createSession(throwing, () => `id-${++n}`);
    expect(session.playerId()).toBe("id-1");
    expect(session.playerId()).toBe("id-1");
    session.remember("ABCD", "Ali");
    expect(session.name()).toBe("Ali");
  });

  test("works with no storage at all", () => {
    const session = createSession(null, () => "only-id");
    expect(session.playerId()).toBe("only-id");
    expect(session.name()).toBeNull();
  });

  test("never stores anything outside its own keys", () => {
    const storage = memoryStorage();
    const session = createSession(storage, () => "id");
    session.playerId();
    session.remember("ABCD", "Ali");
    expect([...storage.data.keys()].every((k) => k.startsWith("woc:"))).toBe(true);
  });

  test("forgetRoom stops a refresh from rejoining but keeps the id and the name", () => {
    const storage = memoryStorage();
    const session = createSession(storage, () => "id");
    session.remember("ABCD", "Ali");
    session.forgetRoom();
    expect(session.joinedRoom()).toBeNull();
    expect(session.name()).toBe("Ali");
    expect(session.playerId()).toBe("id");
    // A second session over the same storage (a refresh) sees the same thing.
    expect(createSession(storage).joinedRoom()).toBeNull();
  });

  test("forgetRoom works when storage throws", () => {
    const session = createSession(throwing, () => "id");
    session.remember("ABCD", "Ali");
    session.forgetRoom();
    expect(session.joinedRoom()).toBeNull();
  });
});
