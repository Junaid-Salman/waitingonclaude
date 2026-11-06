import { createStore, type StoreApi } from "zustand/vanilla";
import { charsThrough, LIMIT_SECONDS } from "../../../shared/type-race/passage";
import { accuracy, wpm } from "../../../shared/type-race/stats";
import type { PassageLength, PassageResponse } from "../../../shared/type-race-protocol";
import { apply, correctKeystrokes, createEngine, type EngineAction, type EngineState } from "./engine";
import { fetchPassage, type PassageResult } from "./passage-client";

// Practice: one passage at a time, no room. The clock and the fetch are injected so the flow is
// tested on a fake clock; the UI reads `startAt`/`endAt` against its own tick for the display.

export const COUNTDOWN_MS = 3000;
// The last passages are sent as `exclude`, so "Next passage" is not one you just typed.
export const RECENT_PASSAGES = 10;
export const SIZE_KEY = "woc:tr:size";

export type PracticeStage = "choose" | "loading" | "error" | "countdown" | "running" | "done";
export type PracticeError = "unreachable" | "rate-limited" | "bad-response";

export interface PracticeResult {
  wpm: number;
  accuracy: number;
  timeMs: number;
  // Share of the passage's characters typed in completed words, 0 to 1.
  progress: number;
  timedOut: boolean;
}

export interface PracticeDeps {
  now(): number;
  // Returns a cancel function.
  setTimer(ms: number, fn: () => void): () => void;
  fetchPassage(length: PassageLength, exclude: readonly string[]): Promise<PassageResult>;
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void } | null;
}

export interface PracticeState {
  stage: PracticeStage;
  length: PassageLength;
  passage: PassageResponse | null;
  engine: EngineState | null;
  error: PracticeError | null;
  startAt: number;
  endAt: number;
  result: PracticeResult | null;
  recent: string[];
  // Restores the saved passage length (sessionStorage); call once on the client.
  loadSize(): void;
  setLength(length: PassageLength): void;
  // Fetches a passage and begins the countdown. Also "Next passage" and "Retry".
  start(): Promise<void>;
  // One keystroke, ignored unless the run is live.
  input(action: EngineAction): void;
  // Back to the length picker; cancels everything pending.
  reset(): void;
}

export function createPracticeStore(deps: PracticeDeps): StoreApi<PracticeState> {
  let cancels: (() => void)[] = [];
  // A fetch that returns after reset() or a newer start() must not begin a run.
  let generation = 0;

  const cancelTimers = () => {
    cancels.forEach((cancel) => cancel());
    cancels = [];
  };

  return createStore<PracticeState>((set, get) => {
    const finish = (timedOut: boolean) => {
      const { engine, passage, startAt, endAt } = get();
      if (!engine || !passage) return;
      cancelTimers();
      // A timed-out run is measured to the limit, a finished one to the last keystroke; never longer
      // than the limit, never zero.
      const timeMs = timedOut ? endAt - startAt : Math.max(1, Math.min(deps.now(), endAt) - startAt);
      set({
        stage: "done",
        result: {
          wpm: wpm(engine.lockedChars, timeMs),
          accuracy: accuracy(correctKeystrokes(engine), engine.keystrokes),
          timeMs,
          progress: passage.text.length === 0 ? 0 : charsThrough(engine.words, engine.wordIndex) / passage.text.length,
          timedOut,
        },
      });
    };

    const begin = (passage: PassageResponse) => {
      const startAt = deps.now() + COUNTDOWN_MS;
      const endAt = startAt + LIMIT_SECONDS[passage.length] * 1000;
      set({
        stage: "countdown",
        passage,
        engine: createEngine(passage.text),
        startAt,
        endAt,
        result: null,
        error: null,
        recent: [...get().recent, passage.id].slice(-RECENT_PASSAGES),
      });
      cancels.push(deps.setTimer(COUNTDOWN_MS, () => set({ stage: "running" })));
      cancels.push(deps.setTimer(endAt - deps.now(), () => finish(true)));
    };

    return {
      stage: "choose",
      length: "short",
      passage: null,
      engine: null,
      error: null,
      startAt: 0,
      endAt: 0,
      result: null,
      recent: [],

      loadSize() {
        try {
          const saved = deps.storage?.getItem(SIZE_KEY);
          if (saved === "short" || saved === "medium" || saved === "long") set({ length: saved });
        } catch {
          // Storage can throw in private windows; the default length stays.
        }
      },

      setLength(length) {
        set({ length });
        try {
          deps.storage?.setItem(SIZE_KEY, length);
        } catch {
          // memory-only is fine
        }
      },

      async start() {
        const { stage, length, recent } = get();
        if (stage === "loading" || stage === "countdown" || stage === "running") return;
        cancelTimers();
        const mine = ++generation;
        set({ stage: "loading", error: null, result: null });
        const result = await deps.fetchPassage(length, recent);
        if (mine !== generation) return;
        if (result.ok) begin(result.passage);
        else set({ stage: "error", error: result.reason });
      },

      input(action) {
        const { stage, engine } = get();
        if (stage !== "running" || !engine) return;
        const next = apply(engine, action);
        if (next === engine) return;
        set({ engine: next });
        if (next.finished) finish(false);
      },

      reset() {
        generation++;
        cancelTimers();
        set({ stage: "choose", passage: null, engine: null, error: null, result: null, startAt: 0, endAt: 0 });
      },
    };
  });
}

// The page's store. Nothing here touches the browser until a method runs.
export const practiceStore = createPracticeStore({
  now: () => Date.now(),
  setTimer: (ms, fn) => {
    const handle = setTimeout(fn, ms);
    return () => clearTimeout(handle);
  },
  fetchPassage,
  get storage() {
    try {
      return typeof window === "undefined" ? null : window.sessionStorage;
    } catch {
      return null;
    }
  },
});
