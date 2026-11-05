// A sliding-window limiter: at most `limit` events per key in any `windowMs`. Pure apart from the
// injected clock, so rooms, solo, Challenge and the HTTP routes share it and tests run it on a fake
// clock. It keeps at most `limit` timestamps per key.
//
// Retention (Spec 2.9): every key is swept at most one window after the previous sweep, so a key
// outlives its own last event by at most two windows. With `setTimer` the sweep runs on a timer, so
// that holds even with no further traffic; without it the sweep runs on the next call. The map holds
// at most `maxKeys` keys: once full, new keys share one overflow bucket with the same limit, so a
// flood of distinct keys (per-IP limits) can neither grow memory nor slow every call.

export interface WindowLimiter {
  // Records the event and returns true, or returns false (and records nothing) when over the limit.
  allow(key: string): boolean;
  forget(key: string): void;
  size(): number;
}

export interface WindowLimiterOptions {
  limit: number;
  windowMs: number;
  now: () => number;
  // Schedules the periodic sweep. Optional: callers that forget their keys (one per socket) skip it.
  setTimer?: (ms: number, fn: () => void) => unknown;
  // Hard cap on keys, the overflow bucket included.
  maxKeys?: number;
}

// Cannot collide with a real key: socket ids, player ids and address keys never contain NUL.
export const OVERFLOW_KEY = "\u0000overflow";

export function createWindowLimiter({ limit, windowMs, now, setTimer, maxKeys = 10_000 }: WindowLimiterOptions): WindowLimiter {
  const events = new Map<string, number[]>();
  let lastSweep = now();
  let timerArmed = false;

  const prune = (key: string, at: number): number[] => {
    const kept = (events.get(key) ?? []).filter((t) => t > at - windowMs);
    if (kept.length === 0) events.delete(key);
    else events.set(key, kept);
    return kept;
  };

  const sweep = (at: number) => {
    lastSweep = at;
    for (const k of [...events.keys()]) prune(k, at);
  };

  const armTimer = () => {
    if (!setTimer || timerArmed || events.size === 0) return;
    timerArmed = true;
    setTimer(windowMs, () => {
      timerArmed = false;
      sweep(now());
      armTimer();
    });
  };

  return {
    allow(requested) {
      const at = now();
      if (at - lastSweep >= windowMs) sweep(at);
      // One slot is kept for the overflow bucket, so the map never exceeds maxKeys.
      const key = events.has(requested) || events.size < maxKeys - 1 ? requested : OVERFLOW_KEY;
      const kept = prune(key, at);
      if (kept.length >= limit) return false;
      events.set(key, [...kept, at]);
      armTimer();
      return true;
    },
    forget: (key) => void events.delete(key),
    size: () => events.size,
  };
}

// The Spec's limits (2.9): 2 guesses per second per player, 30 messages per 10 seconds per socket.
export const LIMITS = {
  frames: { limit: 30, windowMs: 10_000 },
  guesses: { limit: 2, windowMs: 1_000 },
} as const;

// Frames reach the rules as text. A binary frame becomes "", which the frame limiter counts and the
// parser then drops, so every socket limit sees every frame (Spec 2.9: junk counts too).
export const frameText = (message: string | ArrayBuffer | ArrayBufferView): string => (typeof message === "string" ? message : "");
