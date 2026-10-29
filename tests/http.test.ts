import { describe, expect, test } from "vitest";
import { handleRoomRequest } from "../party/room/http";
import { createRoom } from "../party/room/room";

const call = (method: string, roomId: string, room = createRoom()) =>
  handleRoomRequest({ method }, roomId, room);

describe("room creation endpoint", () => {
  test("201 the first time, 409 while the room is alive", async () => {
    const room = createRoom();
    const first = call("POST", "ABCD", room);
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ code: "ABCD" });
    expect(call("POST", "ABCD", room).status).toBe(409);
  });

  test("a created room lets sockets in", () => {
    const room = createRoom();
    expect(room.connect("c1").some((e) => e.kind === "send")).toBe(true); // not found before
    call("POST", "ABCD", room);
    expect(room.connect("c2")).toEqual([]);
  });

  test.each(["abcd", "ABC", "ABCDE", "ABCI", "ABCL", "ABCO", "AB1D", ""])("400 for code %j", (code) => {
    expect(call("POST", code).status).toBe(400);
  });

  test.each(["GET", "PUT", "DELETE", "HEAD"])("405 for %s with an Allow header", (method) => {
    const res = call(method, "ABCD");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST, OPTIONS");
  });

  test("the preflight answers 204 with CORS headers", () => {
    const res = call("OPTIONS", "ABCD");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  test("every response carries CORS headers, errors included", () => {
    const room = createRoom();
    call("POST", "ABCD", room);
    for (const res of [
      call("POST", "WXYZ"),
      call("POST", "ABCD", room),
      call("POST", "nope"),
      call("GET", "ABCD"),
    ]) {
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });

  test("a preflight never creates a room", () => {
    const room = createRoom();
    call("OPTIONS", "ABCD", room);
    expect(call("POST", "ABCD", room).status).toBe(201);
  });
});
