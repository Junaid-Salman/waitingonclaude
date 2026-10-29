import type { Clock } from "../../party/room/room";

export interface FakeClock extends Clock {
  // Moves time forward, firing due timers in order (a timer may schedule another one).
  advance(ms: number): void;
  pending(): number;
}

export function createFakeClock(start = 1_000_000): FakeClock {
  let time = start;
  let nextId = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();

  return {
    now: () => time,
    setTimer(ms, fn) {
      const id = ++nextId;
      timers.set(id, { at: time + ms, fn });
      return () => void timers.delete(id);
    },
    advance(ms) {
      const target = time + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        time = due[1].at;
        due[1].fn();
      }
      time = target;
    },
    pending: () => timers.size,
  };
}
