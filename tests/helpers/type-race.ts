import type { TypeRaceServerMessage } from "../../shared/type-race-protocol";
import { createTypeRaceGame, type TypeRaceOptions } from "../../party/games/type-race/game";
import type { Passage } from "../../party/games/type-race/passages";
import type { GameDefinition } from "../../party/games/types";
import { createRoom, type Effect, type Room } from "../../party/room/room";
import { createFakeClock } from "./fake-clock";

// Three tiny fixed passages. "go to the sea now" is 5 words, 17 characters (longest word 4).
export const PASSAGES: Passage[] = [
  { id: "t-1", length: "short", text: "go to the sea now" },
  { id: "t-2", length: "short", text: "red fox runs far away" },
  { id: "t-3", length: "short", text: "one more word set here" },
];
export const WORDS_1 = 5;
export const CHARS_1 = 17;
export const LIMIT = 60_000;
export const COUNTDOWN = 3000;
export const RESULTS = 5000;
export const pid = (n: number) => `player-id-${n}-secret`;

// A room running the real Type Race game on a fake clock. Everything sent (by handlers and timers)
// lands in `log` as [connId, message].
export function setupRace(players = 2, options: TypeRaceOptions = {}, graceMs = 20_000) {
  const clock = createFakeClock(1_000_000);
  const log: { to: string; message: TypeRaceServerMessage }[] = [];
  const collect = (effects: Effect[]) => {
    for (const e of effects) if (e.kind === "send") log.push({ to: e.to, message: e.message as unknown as TypeRaceServerMessage });
    return effects;
  };
  let n = 0;
  const room: Room = createRoom({
    game: createTypeRaceGame({ pickPassages: (_l, count) => PASSAGES.slice(0, count), ...options }) as unknown as GameDefinition<unknown, unknown, unknown>,
    clock,
    emit: (effects) => void collect(effects),
    newPublicId: () => `pub${++n}`,
    graceMs,
  });
  room.create();
  const send = (conn: string, message: unknown) => collect(room.message(conn, JSON.stringify(message)));
  const joinAs = (conn: string, i: number) => {
    collect(room.connect(conn));
    return send(conn, { type: "join", playerId: pid(i), name: `P${i}` });
  };
  for (let i = 1; i <= players; i++) joinAs(`c${i}`, i);

  const of = <T extends TypeRaceServerMessage["type"]>(type: T, to?: string) =>
    log.filter((l) => l.message.type === type && (to === undefined || l.to === to)).map((l) => l.message as Extract<TypeRaceServerMessage, { type: T }>);
  // Sends cumulative progress for `words` words of passage 1 (keystrokes = chars, no errors).
  const progress = (conn: string, words: number, keystrokes = CHARS_1, errors = 0) => send(conn, { type: "progress", words, keystrokes, errors });
  const finish = (conn: string) => progress(conn, WORDS_1);
  return {
    room,
    clock,
    log,
    send,
    joinAs,
    of,
    progress,
    finish,
    collect,
    settings: (s: unknown) => send("c1", { type: "settings", ...(s as object) }),
    start: () => send("c1", { type: "start" }),
    // Advances to `ms` after the current race's startAt (race 1 starts COUNTDOWN after Start).
    advance: (ms: number) => clock.advance(ms),
  };
}
