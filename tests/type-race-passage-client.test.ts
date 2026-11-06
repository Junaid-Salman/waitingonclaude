import { describe, expect, test } from "vitest";
import { fetchPassage } from "../src/lib/type-race/passage-client";

const fakeFetch = (respond: () => Response | Promise<Response>) => {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    return respond();
  }) as unknown as typeof fetch;
  return { impl, urls };
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const good = { id: "s-001", text: "Some text.", length: "short" };

describe("fetchPassage", () => {
  test("asks the type-race-solo party for the length", async () => {
    const f = fakeFetch(() => json(good));
    const result = await fetchPassage("short", [], { host: "localhost:1999", fetchImpl: f.impl });
    expect(result).toEqual({ ok: true, passage: good });
    expect(f.urls[0]).toBe("http://localhost:1999/parties/type-race-solo/passage?length=short");
  });

  test("sends the last 20 excluded ids at most, and uses https for a deployed host", async () => {
    const f = fakeFetch(() => json(good));
    const ids = Array.from({ length: 25 }, (_, i) => `s-${String(i).padStart(3, "0")}`);
    await fetchPassage("long", ids, { host: "waitingonclaude.example.workers.dev", fetchImpl: f.impl });
    const url = new URL(f.urls[0]);
    expect(url.protocol).toBe("https:");
    expect(url.searchParams.get("exclude")?.split(",")).toEqual(ids.slice(-20));
  });

  test("a network failure is 'unreachable' (the screen offers Retry)", async () => {
    const f = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await fetchPassage("short", [], { fetchImpl: f.impl })).toEqual({ ok: false, reason: "unreachable" });
  });

  test("429 is 'rate-limited'", async () => {
    const f = fakeFetch(() => json({ error: "rate-limited" }, 429));
    expect(await fetchPassage("short", [], { fetchImpl: f.impl })).toEqual({ ok: false, reason: "rate-limited" });
  });

  test.each([
    ["a server error", () => json({}, 500)],
    ["a body that isn't JSON", () => new Response("<html>", { status: 200 })],
    ["a body missing the text", () => json({ id: "s-001", length: "short" })],
    ["an unknown length", () => json({ ...good, length: "huge" })],
    ["an empty passage", () => json({ ...good, text: "" })],
    ["a non-object body", () => json("hello")],
  ])("%s is 'bad-response'", async (_name, respond) => {
    const f = fakeFetch(respond);
    expect(await fetchPassage("short", [], { fetchImpl: f.impl })).toEqual({ ok: false, reason: "bad-response" });
  });
});
