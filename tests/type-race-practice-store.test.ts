import { describe, expect, test } from "vitest";
import { accuracy, wpm } from "../shared/type-race/stats";
import type { PassageLength } from "../shared/type-race-protocol";
import { COUNTDOWN_MS, createPracticeStore, SIZE_KEY, type PracticeDeps } from "../src/lib/type-race/practice-store";
import type { EngineAction } from "../src/lib/type-race/engine";
import type { PassageResult } from "../src/lib/type-race/passage-client";
import { createFakeClock } from "./helpers/fake-clock";

const TEXT = "the quick brown fox jumps over the lazy dog and keeps running";
const passage = (id = "p-1", length: PassageLength = "short") => ({ id, text: TEXT, length });

function setup(results: PassageResult[] = [{ ok: true, passage: passage() }]) {
  const clock = createFakeClock();
  const calls: { length: PassageLength; exclude: readonly string[] }[] = [];
  const saved = new Map<string, string>();
  const queue = [...results];
  const deps: PracticeDeps = {
    now: clock.now,
    setTimer: clock.setTimer,
    fetchPassage: async (length, exclude) => {
      calls.push({ length, exclude });
      return queue.shift() ?? { ok: true, passage: passage("p-x") };
    },
    storage: { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => void saved.set(k, v) },
  };
  const store = createPracticeStore(deps);
  const chars = (text: string): EngineAction[] => [...text].map((char) => ({ type: "char", char }));
  const typeText = (text: string) => chars(text).forEach((a) => store.getState().input(a));
  return { clock, store, calls, saved, typeText };
}

describe("practice flow", () => {
  test("choose -> loading -> countdown with startAt three seconds out", async () => {
    const { store, clock } = setup();
    expect(store.getState().stage).toBe("choose");
    const started = store.getState().start();
    expect(store.getState().stage).toBe("loading");
    await started;
    const s = store.getState();
    expect(s.stage).toBe("countdown");
    expect(s.startAt).toBe(clock.now() + COUNTDOWN_MS);
    expect(s.endAt).toBe(s.startAt + 60_000); // short = 60 s
  });

  test("the time limit follows the length", async () => {
    for (const [length, seconds] of [["medium", 90], ["long", 120]] as const) {
      const { store } = setup([{ ok: true, passage: passage("p", length) }]);
      store.getState().setLength(length);
      await store.getState().start();
      expect(store.getState().endAt - store.getState().startAt).toBe(seconds * 1000);
    }
  });

  test("input is locked until the countdown reaches zero", async () => {
    const { store, clock, typeText } = setup();
    await store.getState().start();
    typeText("the ");
    expect(store.getState().engine?.keystrokes).toBe(0);
    clock.advance(COUNTDOWN_MS - 1);
    typeText("the ");
    expect(store.getState().engine?.keystrokes).toBe(0);
    clock.advance(1);
    expect(store.getState().stage).toBe("running");
    typeText("the ");
    expect(store.getState().engine?.wordIndex).toBe(1);
  });

  test("finishing the passage ends the run with results from stats.ts", async () => {
    const { store, clock, typeText } = setup();
    await store.getState().start();
    clock.advance(COUNTDOWN_MS);
    clock.advance(1000);
    typeText("the quick brown fox jumps over the lazy dog and keeps running");
    const s = store.getState();
    expect(s.stage).toBe("done");
    expect(s.result?.timedOut).toBe(false);
    expect(s.result?.timeMs).toBe(1000);
    expect(s.result?.wpm).toBe(wpm(TEXT.length, 1000));
    expect(s.result?.accuracy).toBe(1);
    expect(s.result?.progress).toBe(1);
  });

  test("typos lower accuracy but not the characters counted for WPM", async () => {
    const { store, clock, typeText } = setup();
    await store.getState().start();
    clock.advance(COUNTDOWN_MS + 30_000);
    store.getState().input({ type: "char", char: "x" });
    store.getState().input({ type: "backspace" });
    typeText(TEXT);
    const r = store.getState().result!;
    expect(r.accuracy).toBe(accuracy(TEXT.length, TEXT.length + 1));
    expect(r.wpm).toBe(wpm(TEXT.length, 30_000));
  });

  test("the time limit ends the run, measured to the limit, with partial progress", async () => {
    const { store, clock, typeText } = setup();
    await store.getState().start();
    clock.advance(COUNTDOWN_MS);
    typeText("the quick ");
    clock.advance(60_000);
    const s = store.getState();
    expect(s.stage).toBe("done");
    expect(s.result?.timedOut).toBe(true);
    expect(s.result?.timeMs).toBe(60_000);
    expect(s.result?.wpm).toBe(wpm("the quick ".length, 60_000));
    expect(s.result?.progress).toBeCloseTo("the quick ".length / TEXT.length, 10);
  });

  test("keystrokes after the run ended are ignored", async () => {
    const { store, clock, typeText } = setup();
    await store.getState().start();
    clock.advance(COUNTDOWN_MS + 60_000);
    const before = store.getState().engine;
    typeText("the ");
    expect(store.getState().engine).toBe(before);
  });

  test("a run finished early has no timer left to end it twice", async () => {
    const { store, clock, typeText } = setup();
    await store.getState().start();
    clock.advance(COUNTDOWN_MS);
    typeText(TEXT);
    const result = store.getState().result;
    expect(clock.pending()).toBe(0);
    clock.advance(120_000);
    expect(store.getState().result).toBe(result);
  });
});

describe("next passage and errors", () => {
  test("Next passage excludes the passages already typed (last 10)", async () => {
    const results: PassageResult[] = Array.from({ length: 13 }, (_, i) => ({ ok: true as const, passage: passage(`p-${i}`) }));
    const { store, clock, calls, typeText } = setup(results);
    for (let i = 0; i < 12; i++) {
      await store.getState().start();
      clock.advance(COUNTDOWN_MS);
      typeText(TEXT);
      expect(store.getState().stage).toBe("done");
    }
    await store.getState().start();
    expect(calls[0].exclude).toEqual([]);
    expect(calls[1].exclude).toEqual(["p-0"]);
    expect(calls[12].exclude).toEqual(Array.from({ length: 10 }, (_, i) => `p-${i + 2}`));
  });

  test("an unreachable server shows an error, and Retry fetches again", async () => {
    const { store, calls } = setup([{ ok: false, reason: "unreachable" }, { ok: true, passage: passage() }]);
    await store.getState().start();
    expect(store.getState().stage).toBe("error");
    expect(store.getState().error).toBe("unreachable");
    await store.getState().start();
    expect(store.getState().stage).toBe("countdown");
    expect(store.getState().error).toBeNull();
    expect(calls).toHaveLength(2);
  });

  test("start while loading or running is ignored (no double fetch)", async () => {
    const { store, calls, clock } = setup();
    const first = store.getState().start();
    void store.getState().start();
    await first;
    expect(calls).toHaveLength(1);
    clock.advance(COUNTDOWN_MS);
    await store.getState().start();
    expect(calls).toHaveLength(1);
  });

  test("a fetch that returns after reset does not begin a run", async () => {
    let release!: (r: PassageResult) => void;
    const clock = createFakeClock();
    const store = createPracticeStore({
      now: clock.now,
      setTimer: clock.setTimer,
      fetchPassage: () => new Promise((resolve) => (release = resolve)),
      storage: null,
    });
    const started = store.getState().start();
    store.getState().reset();
    release({ ok: true, passage: passage() });
    await started;
    expect(store.getState().stage).toBe("choose");
    expect(clock.pending()).toBe(0);
  });

  test("reset cancels the timers of a live run", async () => {
    const { store, clock } = setup();
    await store.getState().start();
    expect(clock.pending()).toBeGreaterThan(0);
    store.getState().reset();
    expect(clock.pending()).toBe(0);
    expect(store.getState().stage).toBe("choose");
  });
});

describe("passage size preference", () => {
  test("is saved to storage and restored", () => {
    const { store, saved } = setup();
    store.getState().setLength("long");
    expect(saved.get(SIZE_KEY)).toBe("long");
    const fresh = createPracticeStore({ now: () => 0, setTimer: () => () => {}, fetchPassage: async () => ({ ok: false, reason: "unreachable" }), storage: { getItem: (k) => saved.get(k) ?? null, setItem: () => {} } });
    expect(fresh.getState().length).toBe("short");
    fresh.getState().loadSize();
    expect(fresh.getState().length).toBe("long");
  });

  test("a junk stored value or a throwing storage keeps the default", () => {
    const junk = createPracticeStore({ now: () => 0, setTimer: () => () => {}, fetchPassage: async () => ({ ok: false, reason: "unreachable" }), storage: { getItem: () => "gigantic", setItem: () => {} } });
    junk.getState().loadSize();
    expect(junk.getState().length).toBe("short");
    const throwing = createPracticeStore({
      now: () => 0,
      setTimer: () => () => {},
      fetchPassage: async () => ({ ok: false, reason: "unreachable" }),
      storage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
    });
    throwing.getState().loadSize();
    throwing.getState().setLength("medium");
    expect(throwing.getState().length).toBe("medium");
  });
});
