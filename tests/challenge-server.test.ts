import { describe, expect, test } from "vitest";
import type * as Party from "partykit/server";
import { createChallengeServer } from "../party/challenge";
import { handleChallengeRequest } from "../party/challenge/seal";
import { sealChallenge } from "../party/challenge/token";
import { TEST_KEY, flipBit, payload } from "./helpers/challenge";

// A fake PartyKit room and connection: enough to drive the adapter without a runtime.
function setup(env: Record<string, unknown>, roomId = "session-1") {
  const Server = createChallengeServer({ revealMs: 10 });
  const server = new Server({ id: roomId, env } as unknown as Party.Room);
  const sent: { type: string; code?: string }[] = [];
  const conn = { id: "c1", send: (m: string) => sent.push(JSON.parse(m)) } as unknown as Party.Connection;
  server.onConnect(conn);
  const send = (frame: unknown) => server.onMessage(typeof frame === "string" ? frame : JSON.stringify(frame), conn);
  return { server, conn, sent, send };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("challenge server adapter", () => {
  test("begin with a good token starts the run", async () => {
    const { sent, send } = setup({ CHALLENGE_KEY: TEST_KEY });
    await send({ type: "begin", token: await sealChallenge(payload(), TEST_KEY) });
    expect(sent.map((m) => m.type)).toEqual(["challengeStart", "roundStart"]);
  });

  test("a tampered or made-up token says invalid-token", async () => {
    const { sent, send } = setup({ CHALLENGE_KEY: TEST_KEY });
    const token = (await sealChallenge(payload(), TEST_KEY)) as string;
    await send({ type: "begin", token: flipBit(token, 20) });
    await send({ type: "begin", token: "nonsense" });
    expect(sent).toEqual([
      { type: "error", code: "invalid-token" },
      { type: "error", code: "invalid-token" },
    ]);
  });

  test("a missing key says unavailable, not expired", async () => {
    const { sent, send } = setup({});
    await send({ type: "begin", token: await sealChallenge(payload(), TEST_KEY) });
    expect(sent).toEqual([{ type: "error", code: "unavailable" }]);
  });

  test("two begins decrypting in parallel still start one run (the session ignores the second)", async () => {
    const { sent, send } = setup({ CHALLENGE_KEY: TEST_KEY });
    const token = await sealChallenge(payload(), TEST_KEY);
    await Promise.all([send({ type: "begin", token }), send({ type: "begin", token })]);
    expect(sent.filter((m) => m.type === "challengeStart")).toHaveLength(1);
  });

  test("an over-long token that still fits a frame is answered, not dropped", async () => {
    const { sent, send } = setup({ CHALLENGE_KEY: TEST_KEY });
    await send({ type: "begin", token: "A".repeat(520) });
    expect(sent).toEqual([{ type: "error", code: "invalid-token" }]);
  });

  test("guesses before begin, binary frames and junk are dropped", async () => {
    const { sent, send, server, conn } = setup({ CHALLENGE_KEY: TEST_KEY });
    await send({ type: "guess", word: "crane" });
    await send("not json");
    await send({ type: "begin", token: "x".repeat(600) });
    await server.onMessage(new ArrayBuffer(8), conn);
    expect(sent).toEqual([]);
  });

  test("a guess after begin is scored by the session", async () => {
    const { sent, send } = setup({ CHALLENGE_KEY: TEST_KEY });
    await send({ type: "begin", token: await sealChallenge(payload(), TEST_KEY) });
    await send({ type: "guess", word: "crane" });
    expect(sent.some((m) => m.type === "guessResult")).toBe(true);
    expect(sent.some((m) => m.type === "roundEnd")).toBe(true);
  });

  test("closing mid-decrypt starts nothing and closing cancels the timers", async () => {
    const { sent, send, server, conn } = setup({ CHALLENGE_KEY: TEST_KEY });
    const pending = send({ type: "begin", token: await sealChallenge(payload(), TEST_KEY) });
    server.onClose(conn);
    await pending;
    await tick();
    expect(sent).toEqual([]);
  });

  test("two connections never share a run", async () => {
    const { server, sent, send } = setup({ CHALLENGE_KEY: TEST_KEY });
    const other: typeof sent = [];
    const conn2 = { id: "c2", send: (m: string) => other.push(JSON.parse(m)) } as unknown as Party.Connection;
    server.onConnect(conn2);
    await send({ type: "begin", token: await sealChallenge(payload(), TEST_KEY) });
    await server.onMessage(JSON.stringify({ type: "guess", word: "crane" }), conn2);
    expect(other).toEqual([]);
    expect(sent.length).toBeGreaterThan(0);
  });

  test("onRequest serves the seal route from the room id and reads the key from env", async () => {
    const { server } = setup({ CHALLENGE_KEY: TEST_KEY }, "seal");
    const res = await server.onRequest({
      method: "POST",
      text: async () => JSON.stringify({ words: ["crane", "slate", "robot", "moist", "light"], limitSec: 60 }),
    } as unknown as Party.Request);
    expect(res.status).toBe(200);
    const noKey = setup({}, "seal");
    const res2 = await noKey.server.onRequest({ method: "POST", text: async () => "{}" } as unknown as Party.Request);
    expect(res2.status).toBe(500);
  });
});

describe("challenge socket frame limit", () => {
  test("the 31st frame from one connection is dropped, junk included", async () => {
    const { sent, send } = setup({ CHALLENGE_KEY: TEST_KEY });
    for (let i = 0; i < 30; i++) await send("junk");
    await send({ type: "begin", token: "nonsense" });
    expect(sent).toEqual([]);
  });
});

describe("seal body size", () => {
  test("a declared oversize body is refused without being read", async () => {
    let read = false;
    const res = await handleChallengeRequest(
      { method: "POST", headers: { get: () => "100000" }, text: async () => ((read = true), "{}") },
      "seal",
      { CHALLENGE_KEY: TEST_KEY },
    );
    expect(res.status).toBe(400);
    expect(read).toBe(false);
  });
});
