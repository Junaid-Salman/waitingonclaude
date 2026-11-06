import { describe, expect, test } from "vitest";
import { handlePassageRequest, PASSAGE_LIMIT, type PassageRequest } from "../party/games/type-race/passage-http";
import { passageById, passagesByLength, type Passage } from "../party/games/type-race/passages";
import { createWindowLimiter } from "../party/rate-limit";
import { createFakeClock } from "./helpers/fake-clock";
import { createTypeRaceSoloServer } from "../party/type-race-solo";
import { fakeCtx } from "./helpers/party-server";

const req = (query: string, method = "GET", ip?: string): PassageRequest => ({
  method,
  url: `https://x.workers.dev/parties/type-race-solo/passage${query}`,
  headers: { get: (name) => (name.toLowerCase() === "cf-connecting-ip" ? (ip ?? null) : null) },
});

describe("GET /parties/type-race-solo/passage", () => {
  test("200 with a passage of the asked length and CORS headers", async () => {
    const res = handlePassageRequest(req("?length=short"), "passage");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as Passage;
    expect(body.length).toBe("short");
    expect(passageById(body.id)?.text).toBe(body.text);
    expect(Object.keys(body).sort()).toEqual(["id", "length", "text"]); // no source for original text
  });

  test.each(["short", "medium", "long"])("serves the %s bucket", async (length) => {
    const body = (await handlePassageRequest(req(`?length=${length}`), "passage").json()) as Passage;
    expect(body.length).toBe(length);
  });

  test.each(["", "?length=", "?length=huge", "?length=SHORT", "?exclude=s-001"])("400 for query %j", async (query) => {
    const res = handlePassageRequest(req(query), "passage");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid" });
  });

  test("exclude removes ids from the draw", async () => {
    const all = passagesByLength("short");
    const exclude = all.slice(1).map((p) => p.id).join(",");
    for (let i = 0; i < 5; i++) {
      const body = (await handlePassageRequest(req(`?length=short&exclude=${exclude}`), "passage").json()) as Passage;
      expect(body.id).toBe(all[0].id);
    }
  });

  test("exclude is capped at 20 ids: the rest are ignored, the request still works", async () => {
    const seen: ReadonlySet<string>[] = [];
    const ids = Array.from({ length: 30 }, (_, i) => `x-${i}`);
    const res = handlePassageRequest(req(`?length=short&exclude=${ids.join(",")}`), "passage", undefined, (_length, exclude) => {
      seen.push(exclude);
      return passagesByLength("short")[0];
    });
    expect(res.status).toBe(200);
    expect(seen[0].size).toBe(20);
    expect(seen[0].has("x-19")).toBe(true);
    expect(seen[0].has("x-20")).toBe(false);
  });

  test("an exclude list covering the whole bucket still serves a passage", async () => {
    const exclude = passagesByLength("long").map((p) => p.id).join(",");
    const res = handlePassageRequest(req(`?length=long&exclude=${exclude}`), "passage");
    expect(res.status).toBe(200);
  });

  test("a room id other than 'passage' is 404", () => {
    expect(handlePassageRequest(req("?length=short"), "something-else").status).toBe(404);
  });

  test("the preflight answers 204 with GET allowed", () => {
    const res = handlePassageRequest(req("", "OPTIONS"), "passage");
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  test.each(["POST", "PUT", "DELETE"])("405 for %s with an Allow header", (method) => {
    const res = handlePassageRequest(req("?length=short", method), "passage");
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, OPTIONS");
  });
});

describe("per-address limit", () => {
  const limiter = () => {
    const clock = createFakeClock();
    return { clock, limiter: createWindowLimiter({ ...PASSAGE_LIMIT, now: clock.now }) };
  };

  test("the 61st request in 10 s from one address is 429 with Retry-After", async () => {
    const { limiter: l } = limiter();
    for (let i = 0; i < 60; i++) expect(handlePassageRequest(req("?length=short", "GET", "1.2.3.4"), "passage", l).status).toBe(200);
    const res = handlePassageRequest(req("?length=short", "GET", "1.2.3.4"), "passage", l);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("10");
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });

  test("another address has its own budget, and the window slides", () => {
    const { clock, limiter: l } = limiter();
    for (let i = 0; i < 60; i++) handlePassageRequest(req("?length=short", "GET", "1.2.3.4"), "passage", l);
    expect(handlePassageRequest(req("?length=short", "GET", "5.6.7.8"), "passage", l).status).toBe(200);
    clock.advance(10_001);
    expect(handlePassageRequest(req("?length=short", "GET", "1.2.3.4"), "passage", l).status).toBe(200);
  });

  test("a refused request does not use up budget", () => {
    const { clock, limiter: l } = limiter();
    for (let i = 0; i < 80; i++) handlePassageRequest(req("?length=short", "GET", "1.2.3.4"), "passage", l);
    clock.advance(10_001);
    expect(handlePassageRequest(req("?length=short", "GET", "1.2.3.4"), "passage", l).status).toBe(200);
  });
});

describe("no user data in responses", () => {
  test("neither the address nor any header is echoed", async () => {
    const res = handlePassageRequest(req("?length=short", "GET", "203.0.113.77"), "passage");
    const all = JSON.stringify([await res.clone().text(), [...res.headers.entries()]]);
    expect(all).not.toContain("203.0.113.77");
  });
});

describe("adapter", () => {
  test("onRequest routes to the passage handler by room name", async () => {
    const Server = createTypeRaceSoloServer();
    const passage = new Server(fakeCtx("passage"), {});
    const ok = passage.onRequest(new Request("https://x.workers.dev/parties/type-race-solo/passage?length=medium"));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as Passage).length).toBe("medium");

    const other = new Server(fakeCtx("abc"), {});
    expect(other.onRequest(new Request("https://x.workers.dev/parties/type-race-solo/abc?length=short")).status).toBe(404);
  });

  test("an injected picker and limit are used (the e2e factory)", () => {
    const Server = createTypeRaceSoloServer({ pick: () => passagesByLength("long")[0], passageLimit: { limit: 1, windowMs: 10_000 } });
    const server = new Server(fakeCtx("passage"), {});
    const first = server.onRequest(new Request("https://x.workers.dev/p?length=short"));
    expect(first.status).toBe(200);
    expect(server.onRequest(new Request("https://x.workers.dev/p?length=short")).status).toBe(429);
  });
});
