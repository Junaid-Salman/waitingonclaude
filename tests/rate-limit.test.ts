import { describe, expect, test } from "vitest";
import { createWindowLimiter, OVERFLOW_KEY } from "../party/rate-limit";
import { createFakeClock } from "./helpers/fake-clock";

function setup(limit = 3, windowMs = 1000, maxKeys?: number) {
  let t = 0;
  const limiter = createWindowLimiter({ limit, windowMs, now: () => t, maxKeys });
  return { limiter, at: (ms: number) => void (t = ms) };
}

describe("sliding-window limiter", () => {
  test("allows exactly the limit inside a window, then refuses", () => {
    const { limiter } = setup(3);
    expect([1, 2, 3, 4].map(() => limiter.allow("k"))).toEqual([true, true, true, false]);
  });

  test("a refused event is not recorded, so it does not extend the block", () => {
    const { limiter, at } = setup(1, 1000);
    limiter.allow("k");
    at(500);
    expect(limiter.allow("k")).toBe(false);
    at(1000);
    expect(limiter.allow("k")).toBe(true);
  });

  test("the window slides: old events stop counting one by one", () => {
    const { limiter, at } = setup(2, 1000);
    at(0);
    limiter.allow("k");
    at(600);
    limiter.allow("k");
    at(999);
    expect(limiter.allow("k")).toBe(false);
    at(1000);
    expect(limiter.allow("k")).toBe(true); // the event at 0 left the window
    expect(limiter.allow("k")).toBe(false);
  });

  test("keys are independent", () => {
    const { limiter } = setup(1);
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("b")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
  });

  test("forget clears a key", () => {
    const { limiter } = setup(1);
    limiter.allow("a");
    limiter.forget("a");
    expect(limiter.allow("a")).toBe(true);
  });

  test("expired keys are swept on the next call a window later, so many distinct keys do not pile up", () => {
    const { limiter, at } = setup(1, 1000);
    for (let i = 0; i < 50; i++) limiter.allow(`ip-${i}`);
    expect(limiter.size()).toBe(50);
    at(5000);
    limiter.allow("fresh");
    expect(limiter.size()).toBe(1);
  });

  test("a key with few neighbours is swept within two windows, without the key returning", () => {
    const { limiter, at } = setup(5, 1000);
    at(100);
    limiter.allow("once"); // never seen again
    at(1150);
    limiter.allow("other");
    expect(limiter.size()).toBe(1); // "once" expired at 1100 and the sweep at 1150 removed it
  });

  test("the sweep runs at most once per window, so an expired key can wait up to one more window", () => {
    const { limiter, at } = setup(5, 1000);
    at(1000);
    limiter.allow("a"); // the first sweep (nothing to remove)
    at(1001);
    limiter.allow("x"); // expires at 2001
    at(2000);
    limiter.allow("b"); // the second sweep: "a" goes, "x" is still inside its window
    expect(limiter.size()).toBe(2);
    at(2999);
    limiter.allow("c"); // "x" has expired, but the next sweep is not due until 3000
    expect(limiter.size()).toBe(3);
    at(3000);
    limiter.allow("d"); // swept: "x" (1001) and "b" (2000) are out; "c" and "d" remain
    expect(limiter.size()).toBe(2);
  });

  test("with a timer, an address is gone within two windows even with no further traffic", () => {
    const clock = createFakeClock(0);
    const limiter = createWindowLimiter({ limit: 5, windowMs: 1000, now: clock.now, setTimer: clock.setTimer });
    limiter.allow("first"); // arms the sweep for t=1000
    clock.advance(999);
    limiter.allow("203.0.113.7"); // the worst case: just before a sweep
    clock.advance(1); // t=1000: the sweep keeps it (still inside its window) and re-arms for 2000
    expect(limiter.size()).toBe(1);
    clock.advance(999); // t=1999: no sweep yet
    expect(limiter.size()).toBe(1);
    clock.advance(1); // t=2000, under two windows after the address was seen
    expect(limiter.size()).toBe(0);
    expect(clock.pending()).toBe(0); // nothing left to sweep, so no timer keeps running
  });

  test("the timer re-arms when a new key arrives after it stopped", () => {
    const clock = createFakeClock(0);
    const limiter = createWindowLimiter({ limit: 5, windowMs: 1000, now: clock.now, setTimer: clock.setTimer });
    limiter.allow("a");
    clock.advance(5000);
    expect(limiter.size()).toBe(0);
    limiter.allow("b");
    expect(clock.pending()).toBe(1);
    clock.advance(2000);
    expect(limiter.size()).toBe(0);
  });

  test("the map never exceeds maxKeys: once full, new keys share one overflow bucket", () => {
    const { limiter } = setup(2, 1000, 10);
    for (let i = 0; i < 9; i++) expect(limiter.allow(`ip-${i}`)).toBe(true);
    expect(limiter.size()).toBe(9);
    // Full: newcomers are limited together, existing keys keep their own budget.
    expect(limiter.allow("new-1")).toBe(true);
    expect(limiter.allow("new-2")).toBe(true);
    expect(limiter.allow("new-3")).toBe(false);
    expect(limiter.allow("ip-0")).toBe(true);
    expect(limiter.size()).toBe(10);
    for (let i = 0; i < 100; i++) limiter.allow(`flood-${i}`);
    expect(limiter.size()).toBe(10);
  });

  test("the overflow key cannot be named by a caller's key", () => {
    expect(OVERFLOW_KEY).toContain("\u0000");
  });

  test("after a sweep frees room, new keys get their own bucket again", () => {
    const { limiter, at } = setup(1, 1000, 3);
    limiter.allow("a");
    limiter.allow("b");
    expect(limiter.allow("c")).toBe(true); // overflow
    expect(limiter.allow("d")).toBe(false); // overflow is spent
    at(1000);
    expect(limiter.allow("d")).toBe(true);
    expect(limiter.allow("e")).toBe(true); // its own key, not the overflow
    expect(limiter.allow("e")).toBe(false);
    expect(limiter.allow("f")).toBe(true); // full again: overflow
  });
});
