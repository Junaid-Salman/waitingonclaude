import { describe, expect, test } from "vitest";
import { createProgressSender, type ProgressMessage } from "../src/lib/type-race/progress-sender";
import { createFakeClock } from "./helpers/fake-clock";

function setup() {
  const clock = createFakeClock(0);
  const sent: { at: number; msg: ProgressMessage }[] = [];
  const sender = createProgressSender({ now: clock.now, setTimer: clock.setTimer, send: (msg) => sent.push({ at: clock.now(), msg }) });
  return { clock, sent, sender };
}
const counts = (words: number) => ({ words, keystrokes: words * 5, errors: 0 });

describe("progress sender", () => {
  test("the first word goes out at once", () => {
    const { sender, sent } = setup();
    sender.update(counts(1), false);
    expect(sent).toHaveLength(1);
    expect(sent[0].msg).toEqual({ type: "progress", words: 1, keystrokes: 5, errors: 0 });
  });

  test("words locked inside the gap are coalesced into one trailing send of the newest state", () => {
    const { sender, sent, clock } = setup();
    sender.update(counts(1), false);
    clock.advance(100);
    sender.update(counts(2), false);
    clock.advance(100);
    sender.update(counts(3), false);
    expect(sent).toHaveLength(1);
    clock.advance(200); // 400 ms after the first send
    expect(sent).toHaveLength(2);
    expect(sent[1].msg.words).toBe(3);
    expect(sent[1].at).toBe(400);
  });

  test("the last word is never delayed by the gap", () => {
    const { sender, sent, clock } = setup();
    sender.update(counts(1), false);
    clock.advance(50);
    sender.update(counts(2), true);
    expect(sent).toHaveLength(2);
    expect(sent[1].at).toBe(50);
    expect(sent[1].msg.words).toBe(2);
  });

  test("the final send replaces a queued trailing one (no duplicate, no stale state after it)", () => {
    const { sender, sent, clock } = setup();
    sender.update(counts(1), false);
    clock.advance(100);
    sender.update(counts(2), false); // queued
    clock.advance(100);
    sender.update(counts(3), true);
    clock.advance(1000);
    expect(sent.map((s) => s.msg.words).slice(0, 2)).toEqual([1, 3]);
  });

  test("never more than 5 messages in any 1 s window, even typing every 30 ms (the server limit is 5/s)", () => {
    const { sender, sent, clock } = setup();
    for (let i = 1; i <= 200; i++) {
      sender.update(counts(i), false);
      clock.advance(30 + (i % 7) * 11); // jittery pace
    }
    for (let i = 0; i < sent.length; i++) {
      const inWindow = sent.filter((s) => s.at >= sent[i].at && s.at < sent[i].at + 1000);
      expect(inWindow.length).toBeLessThanOrEqual(5);
    }
    expect(sent.length).toBeGreaterThan(10);
  });

  test("after a refusal the cumulative state is sent again after 500 ms", () => {
    const { sender, sent, clock } = setup();
    sender.update(counts(1), false);
    clock.advance(400);
    sender.update(counts(2), false);
    sender.rejected();
    clock.advance(499);
    expect(sent).toHaveLength(2);
    clock.advance(1);
    expect(sent).toHaveLength(3);
    expect(sent[2].msg.words).toBe(2);
  });

  test("a finish the server does not acknowledge within 1 s is sent again, until it is", () => {
    const { sender, sent, clock } = setup();
    sender.update(counts(5), true);
    expect(sent).toHaveLength(1);
    clock.advance(1000);
    expect(sent).toHaveLength(2);
    clock.advance(1000);
    expect(sent).toHaveLength(3);
    sender.ack(5);
    clock.advance(5000);
    expect(sent).toHaveLength(3);
  });

  test("an acknowledgement of the finish stops the wait immediately", () => {
    const { sender, sent, clock } = setup();
    sender.update(counts(5), true);
    clock.advance(300);
    sender.ack(5);
    clock.advance(5000);
    expect(sent).toHaveLength(1);
    expect(clock.pending()).toBe(0);
  });

  test("stop cancels everything pending", () => {
    const { sender, sent, clock } = setup();
    sender.update(counts(1), false);
    sender.update(counts(2), false);
    sender.stop();
    clock.advance(5000);
    expect(sent).toHaveLength(1);
    expect(clock.pending()).toBe(0);
  });
});
