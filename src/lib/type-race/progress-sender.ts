import type { TypeRaceClientMessage } from "../../../shared/type-race-protocol";
import { PROGRESS_MIN_GAP_MS } from "../../../shared/type-race-protocol";

export type ProgressMessage = Extract<TypeRaceClientMessage, { type: "progress" }>;

export interface ProgressCounts {
  words: number;
  keystrokes: number;
  errors: number;
}

export interface SenderDeps {
  now(): number;
  setTimer(ms: number, fn: () => void): () => void;
  send(message: ProgressMessage): void;
  minGapMs?: number;
  // After a refusal, how long to wait before sending the cumulative state again.
  resendMs?: number;
  // After the last word, how long to wait for the server's acknowledgement before sending again.
  ackWaitMs?: number;
}

// Sends cumulative progress to the server without flooding it (Q29): at most one message per
// `minGapMs` (the newest state wins, trailing), the last word at once, and a resend when the server
// refused ("rate-limited") or never acknowledged the finish. The server limit is 5 per second; this
// sends at most 3.
export function createProgressSender(deps: SenderDeps) {
  const gap = deps.minGapMs ?? PROGRESS_MIN_GAP_MS;
  const resendMs = deps.resendMs ?? 500;
  const ackWaitMs = deps.ackWaitMs ?? 1000;

  let latest: ProgressCounts | null = null;
  let lastSentAt = -Infinity;
  let sentWords = -1;
  let finalWords: number | null = null;
  let acked = -1;
  let cancelPending: (() => void) | null = null;
  let cancelAckWait: (() => void) | null = null;

  const clearPending = () => {
    cancelPending?.();
    cancelPending = null;
  };

  function flush() {
    clearPending();
    if (!latest) return;
    deps.send({ type: "progress", ...latest });
    lastSentAt = deps.now();
    sentWords = latest.words;
    // Once the last word is out, keep asking until the server acknowledges it.
    if (finalWords !== null && latest.words === finalWords) armAckWait();
  }

  function armAckWait() {
    cancelAckWait?.();
    cancelAckWait = deps.setTimer(ackWaitMs, () => {
      cancelAckWait = null;
      if (finalWords !== null && acked < finalWords) schedule(0);
    });
  }

  // Sends now if the gap allows, else at the earliest moment it does (or `minDelay`, if later).
  function schedule(minDelay: number) {
    if (cancelPending) return; // a trailing send is already queued and will carry the newest state
    const wait = Math.max(minDelay, lastSentAt + gap - deps.now());
    if (wait <= 0) flush();
    else cancelPending = deps.setTimer(wait, flush);
  }

  return {
    // Call at every word lock with the cumulative counts. `final` is true when the passage is done.
    update(counts: ProgressCounts, final: boolean) {
      latest = counts;
      if (final) {
        finalWords = counts.words;
        flush(); // never delayed by the gap
        return;
      }
      schedule(0);
    },
    // The server's copy of our own progress arrived.
    ack(words: number) {
      acked = Math.max(acked, words);
      if (finalWords !== null && acked >= finalWords) {
        cancelAckWait?.();
        cancelAckWait = null;
      }
    },
    // The server refused a message as too fast: send the cumulative state again after a pause.
    rejected() {
      if (!latest) return;
      clearPending();
      cancelPending = deps.setTimer(Math.max(resendMs, lastSentAt + gap - deps.now()), flush);
    },
    stop() {
      clearPending();
      cancelAckWait?.();
      cancelAckWait = null;
      latest = null;
    },
    // Visible for tests.
    get sentWords() {
      return sentWords;
    },
  };
}
