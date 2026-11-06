import { beforeEach, describe, expect, test } from "vitest";
import type { RaceSnapshot, TypeRaceServerMessage } from "../shared/type-race-protocol";
import { useRace, stageAt } from "../src/lib/type-race/race-store";

type Msg = Extract<TypeRaceServerMessage, { type: "raceStart" | "raceEnd" | "raceProgress" | "matchEnd" | "progressRejected" }>;
const TEXT = "go to the sea now";
const start: Extract<Msg, { type: "raceStart" }> = {
  type: "raceStart",
  race: 1,
  totalRaces: 3,
  passage: { text: TEXT },
  serverNow: 10_000,
  startAt: 13_000,
  endAt: 73_000,
  players: [{ id: "a", name: "Ali" }, { id: "b", name: "Bo" }],
};
const char = (c: string) => ({ type: "char", char: c }) as const;
const typeText = (text: string, now: number) => [...text].forEach((c) => useRace.getState().input(char(c), now));

beforeEach(() => useRace.getState().reset());

describe("race store", () => {
  test("raceStart sets the passage, the clock and the offset; the stage is countdown", () => {
    useRace.getState().receive(start, 5_000); // the client clock is 5 s behind the server
    const s = useRace.getState();
    expect(s.stage).toBe("countdown");
    expect(s.passage).toBe(TEXT);
    expect(s.offset).toBe(5_000);
    expect(s.roster).toHaveLength(2);
    expect(s.engine?.wordIndex).toBe(0);
  });

  test("the stage turns to racing at startAt on the server clock, adjusted by the offset", () => {
    useRace.getState().receive(start, 5_000);
    const s = useRace.getState();
    expect(stageAt(s, 7_999)).toBe("countdown"); // client 7_999 = server 12_999
    expect(stageAt(s, 8_000)).toBe("racing"); // server time 13_000
  });

  test("keystrokes are ignored until the server start time and after the end", () => {
    useRace.getState().receive(start, 5_000);
    typeText("go ", 7_999);
    expect(useRace.getState().engine?.keystrokes).toBe(0);
    typeText("go ", 8_000);
    expect(useRace.getState().engine?.wordIndex).toBe(1);
    typeText("to ", 68_000); // server time 73_000 = endAt
    expect(useRace.getState().engine?.wordIndex).toBe(1);
  });

  test("input returns the new engine state only when something changed", () => {
    useRace.getState().receive(start, 5_000);
    expect(useRace.getState().input(char("g"), 13_000)).not.toBeNull();
    expect(useRace.getState().input({ type: "backspace" }, 13_000)).not.toBeNull();
    expect(useRace.getState().input({ type: "backspace" }, 13_000)).toBeNull(); // nothing left to delete
  });

  test("own raceProgress is the acknowledgement; other players' are just progress", () => {
    useRace.getState().receive(start, 0);
    useRace.getState().receive({ type: "raceProgress", id: "a", words: 2, wpm: 30, finishedMs: null }, 0, "a");
    useRace.getState().receive({ type: "raceProgress", id: "b", words: 4, wpm: 60, finishedMs: null }, 0, "a");
    const s = useRace.getState();
    expect(s.ackedWords).toBe(2);
    expect(s.progress.b.words).toBe(4);
    useRace.getState().receive({ type: "raceProgress", id: "a", words: 5, wpm: 70, finishedMs: 4000 }, 0, "a");
    expect(useRace.getState().ownFinishedMs).toBe(4000);
  });

  test("progressRejected is counted so the sender can resend", () => {
    useRace.getState().receive({ type: "progressRejected", reason: "rate-limited" }, 0);
    useRace.getState().receive({ type: "progressRejected", reason: "rate-limited" }, 0);
    expect(useRace.getState().rejections).toBe(2);
  });

  test("raceEnd shows the results; matchEnd the standings; the next raceStart starts clean", () => {
    useRace.getState().receive(start, 0);
    useRace.getState().receive({ type: "raceEnd", race: 1, results: [], nextAt: 80_000 }, 0);
    expect(useRace.getState().stage).toBe("results");
    expect(useRace.getState().raceEnd?.nextAt).toBe(80_000);
    useRace.getState().receive({ type: "matchEnd", standings: [] }, 0);
    expect(useRace.getState().stage).toBe("finished");
    useRace.getState().receive({ ...start, race: 2 }, 0);
    expect(useRace.getState().raceEnd).toBeNull();
    expect(useRace.getState().standings).toBeNull();
    expect(useRace.getState().stage).toBe("countdown");
  });
});

describe("snapshot restore", () => {
  const snapshot: RaceSnapshot = {
    type: "raceSnapshot",
    serverNow: 30_000,
    stage: "racing",
    race: 1,
    totalRaces: 3,
    passage: { text: TEXT },
    startAt: 13_000,
    endAt: 73_000,
    players: [{ id: "a", name: "Ali" }, { id: "b", name: "Bo" }],
    own: { words: 3, keystrokes: 14, errors: 2, finishedMs: null },
    progress: [{ id: "a", words: 3, wpm: 25, finishedMs: null }, { id: "b", words: 1, wpm: 10, finishedMs: null }],
    raceEnd: null,
    standings: null,
  };

  test("the engine resumes at the server's word count with an empty current word and the counts", () => {
    useRace.getState().receive(snapshot, 20_000, "a");
    const s = useRace.getState();
    expect(s.engine).toMatchObject({ wordIndex: 3, typed: "", keystrokes: 14, errors: 2, lockedChars: "go to the ".length, finished: false });
    expect(s.offset).toBe(10_000);
    expect(s.progress.b.words).toBe(1);
    expect(s.ackedWords).toBe(3);
    expect(stageAt(s, 20_000)).toBe("racing");
  });

  test("typing continues from the restored word", () => {
    useRace.getState().receive(snapshot, 20_000, "a");
    typeText("sea now", 20_100);
    expect(useRace.getState().engine?.finished).toBe(true);
    expect(useRace.getState().engine?.lockedChars).toBe(TEXT.length);
  });

  test("a finished player comes back finished and cannot type", () => {
    useRace.getState().receive({ ...snapshot, own: { words: 5, keystrokes: 17, errors: 0, finishedMs: 5000 } }, 20_000, "a");
    expect(useRace.getState().engine?.finished).toBe(true);
    expect(useRace.getState().ownFinishedMs).toBe(5000);
    expect(useRace.getState().input(char("x"), 20_100)).toBeNull();
  });

  test("results and standings come back with the snapshot", () => {
    const end = { race: 1, results: [], nextAt: 90_000 };
    useRace.getState().receive({ ...snapshot, stage: "results", raceEnd: end }, 0, "a");
    expect(useRace.getState().stage).toBe("results");
    expect(useRace.getState().raceEnd).toEqual(end);
    useRace.getState().receive({ ...snapshot, stage: "finished", raceEnd: end, standings: [] }, 0, "a");
    expect(useRace.getState().stage).toBe("finished");
    expect(useRace.getState().standings).toEqual([]);
  });
});
