import { describe, expect, test, vi } from "vitest";
import { createRoom, CreateRoomError } from "../src/lib/room/create-room";

const res = (status: number) => new Response(null, { status });

describe("createRoom", () => {
  test("returns the code on 201 and posts to the main party", async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(201));
    const code = await createRoom({ host: "localhost:1999", fetchFn, rng: () => 0 });
    expect(code).toBe("AAAA");
    expect(fetchFn).toHaveBeenCalledWith("http://localhost:1999/parties/main/AAAA", { method: "POST" });
  });

  test("retries with a new code on 409", async () => {
    const draws = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const fetchFn = vi.fn().mockResolvedValueOnce(res(409)).mockResolvedValueOnce(res(201));
    const code = await createRoom({ host: "localhost:1999", fetchFn, rng: () => draws[i++ % draws.length] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(code).not.toBe("AAAA");
    expect(fetchFn.mock.calls[1][0]).toContain(code);
  });

  test("gives up after five conflicts with a clear message", async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(409));
    await expect(createRoom({ host: "localhost:1999", fetchFn })).rejects.toThrow(/free room code/);
    expect(fetchFn).toHaveBeenCalledTimes(5);
  });

  test("any other status is an error and is not retried", async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(500));
    await expect(createRoom({ host: "localhost:1999", fetchFn })).rejects.toThrow(/error 500/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("a network failure becomes a friendly error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(createRoom({ host: "localhost:1999", fetchFn })).rejects.toBeInstanceOf(CreateRoomError);
    await expect(createRoom({ host: "localhost:1999", fetchFn })).rejects.toThrow(/Can't reach the game server/);
  });

  test("uses https for a deployed host", async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(201));
    await createRoom({ host: "waitingonclaude.someone.partykit.dev", fetchFn, rng: () => 0 });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waitingonclaude.someone.partykit.dev/parties/main/AAAA");
  });
});
