import { describe, expect, test } from "vitest";
import { createRoom, type Effect } from "../party/room/room";
import { createFakeClock } from "./helpers/fake-clock";
import { testGame } from "./helpers/game";

// Woordle's wire format must not change when the room layer is generalised (Phase 8.2.1). This plays
// a fixed script and compares the exact JSON text of every frame, key order included. EXPECTED was
// recorded from the room layer BEFORE the settings/limit hooks were introduced.
const frames = (effects: Effect[]) => effects.map((e) => (e.kind === "send" ? `${e.to} ${JSON.stringify(e.message)}` : `close ${e.connId} ${e.code}`));

function script(): string[] {
  const clock = createFakeClock(1_000_000);
  let n = 0;
  const room = createRoom({ game: testGame(), clock, newPublicId: () => `pub${++n}` });
  room.create();
  const out: string[] = [];
  const say = (conn: string, msg: unknown) => out.push(...frames(room.message(conn, JSON.stringify(msg))));
  for (const [conn, i, name] of [["c1", 1, "Ali"], ["c2", 2, "Bo"]] as const) {
    room.connect(conn);
    say(conn, { type: "join", playerId: `player-id-${i}-secret`, name });
  }
  say("c1", { type: "settings", roundSeconds: 300 });
  say("c1", { type: "settings", roundSeconds: 60 }); // dropped
  say("c2", { type: "settings", roundSeconds: 120 }); // not host: dropped
  say("c1", { type: "start" });
  say("c1", { type: "settings", roundSeconds: 120 }); // in a match: dropped
  say("c1", { type: "guess", word: "slate" });
  say("c1", { type: "guess", word: "crane" });
  say("c1", { type: "guess", word: "robot" }); // third in 1 s: rate-limited reply
  return out;
}

describe("Woordle frames are byte-identical across the room-layer change", () => {
  test("lobby, settings and match frames", () => {
    expect(script()).toEqual(EXPECTED);
  });
});

const EXPECTED: string[] = [
  "c1 {\"type\":\"lobby\",\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\",\"isHost\":true,\"connected\":true}],\"roundSeconds\":180,\"youId\":\"pub1\",\"phase\":\"lobby\"}",
  "c1 {\"type\":\"lobby\",\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\",\"isHost\":true,\"connected\":true},{\"id\":\"pub2\",\"name\":\"Bo\",\"isHost\":false,\"connected\":true}],\"roundSeconds\":180,\"youId\":\"pub1\",\"phase\":\"lobby\"}",
  "c2 {\"type\":\"lobby\",\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\",\"isHost\":true,\"connected\":true},{\"id\":\"pub2\",\"name\":\"Bo\",\"isHost\":false,\"connected\":true}],\"roundSeconds\":180,\"youId\":\"pub2\",\"phase\":\"lobby\"}",
  "c1 {\"type\":\"lobby\",\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\",\"isHost\":true,\"connected\":true},{\"id\":\"pub2\",\"name\":\"Bo\",\"isHost\":false,\"connected\":true}],\"roundSeconds\":300,\"youId\":\"pub1\",\"phase\":\"lobby\"}",
  "c2 {\"type\":\"lobby\",\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\",\"isHost\":true,\"connected\":true},{\"id\":\"pub2\",\"name\":\"Bo\",\"isHost\":false,\"connected\":true}],\"roundSeconds\":300,\"youId\":\"pub2\",\"phase\":\"lobby\"}",
  "c1 {\"type\":\"lobby\",\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\",\"isHost\":true,\"connected\":true},{\"id\":\"pub2\",\"name\":\"Bo\",\"isHost\":false,\"connected\":true}],\"roundSeconds\":300,\"youId\":\"pub1\",\"phase\":\"match\"}",
  "c2 {\"type\":\"lobby\",\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\",\"isHost\":true,\"connected\":true},{\"id\":\"pub2\",\"name\":\"Bo\",\"isHost\":false,\"connected\":true}],\"roundSeconds\":300,\"youId\":\"pub2\",\"phase\":\"match\"}",
  "c1 {\"type\":\"roundStart\",\"round\":1,\"totalRounds\":5,\"startedAt\":1000000,\"endsAt\":1300000,\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\"},{\"id\":\"pub2\",\"name\":\"Bo\"}]}",
  "c2 {\"type\":\"roundStart\",\"round\":1,\"totalRounds\":5,\"startedAt\":1000000,\"endsAt\":1300000,\"players\":[{\"id\":\"pub1\",\"name\":\"Ali\"},{\"id\":\"pub2\",\"name\":\"Bo\"}]}",
  "c1 {\"type\":\"guessResult\",\"word\":\"slate\",\"colours\":[\"grey\",\"grey\",\"green\",\"grey\",\"green\"],\"solvedMs\":null}",
  "c2 {\"type\":\"opponentProgress\",\"id\":\"pub1\",\"rows\":[[\"grey\",\"grey\",\"green\",\"grey\",\"green\"]],\"solvedMs\":null}",
  "c1 {\"type\":\"guessResult\",\"word\":\"crane\",\"colours\":[\"green\",\"green\",\"green\",\"green\",\"green\"],\"solvedMs\":0}",
  "c2 {\"type\":\"opponentProgress\",\"id\":\"pub1\",\"rows\":[[\"grey\",\"grey\",\"green\",\"grey\",\"green\"],[\"green\",\"green\",\"green\",\"green\",\"green\"]],\"solvedMs\":0}",
  "c1 {\"type\":\"guessRejected\",\"reason\":\"rate-limited\"}",
];
