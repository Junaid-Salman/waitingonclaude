import {
  COUNTDOWN_MS,
  DEFAULT_LENGTH,
  DEFAULT_RACES,
  RACES_OPTIONS,
  RESULTS_MS,
  TYPE_RACE_ACTION_LIMIT,
  isPassageLength,
  type PassageLength,
  type RaceEnd,
  type RaceProgressEntry,
  type RaceSnapshot,
  type Races,
  type Standing,
  type TypeRaceServerMessage,
} from "../../../shared/type-race-protocol";
import { LIMIT_SECONDS, charsThrough, splitWords } from "../../../shared/type-race/passage";
import { accuracy, wpm } from "../../../shared/type-race/stats";
import type { PublicId, RoomPlayer } from "../../room/types";
import { SYSTEM, type GameContext, type GameDefinition, type Sender } from "../types";
import { cryptoRng } from "../woordle/pick";
import { passageById, pickPassageIds, type Passage } from "./passages";
import { placeRace } from "./placement";
import { acceptProgress, type ProgressEntry } from "./progress";
import { rankStandings } from "./standings";

export interface TypeRaceSettings {
  races: Races;
  length: PassageLength;
}

export type TypeRaceAction =
  | { type: "progress"; words: number; keystrokes: number; errors: number }
  // Scheduled by the game itself. parseAction never produces these from client input.
  | { type: "go"; race: number }
  | { type: "endRace"; race: number }
  | { type: "nextRace"; race: number }
  | { type: "finish" };

type Ctx = GameContext<TypeRaceAction, TypeRaceServerMessage>;

interface PlayerState {
  id: PublicId;
  name: string;
  points: number;
  // The race number during which the seat was removed; absent from every later race.
  leftIn: number | null;
  // One entry per finished race, in order.
  history: { wpm: number; accuracy: number }[];
}

interface RaceState {
  n: number;
  passage: Passage;
  words: string[];
  totalChars: number;
  startAt: number;
  endAt: number;
  stage: "countdown" | "racing" | "results";
  entries: Map<PublicId, ProgressEntry>;
  end: RaceEnd | null;
}

interface TypeRaceState {
  settings: TypeRaceSettings;
  limitMs: number;
  passages: Passage[];
  players: PlayerState[];
  race: RaceState | null;
  status: "running" | "finished";
  standings: Standing[] | null;
  cancelTimers: (() => void)[];
}

export interface TypeRaceOptions {
  // Tests and e2e only: fixed passages, shrunken durations.
  pickPassages?: (length: PassageLength, count: number) => Passage[];
  limitMs?: (length: PassageLength) => number;
  timeScale?: number;
  resultsMs?: number;
  countdownMs?: number;
}

const MAX_COUNT = 1_000_000;
const isRaces = (v: unknown): v is Races => RACES_OPTIONS.includes(v as Races);

function defaultPick(length: PassageLength, count: number): Passage[] {
  return pickPassageIds(length, count, cryptoRng).map((id) => passageById(id)!);
}

export function createTypeRaceGame(options: TypeRaceOptions = {}): GameDefinition<TypeRaceState, TypeRaceSettings, TypeRaceAction, TypeRaceServerMessage> {
  const scale = options.timeScale ?? 1;
  const resultsMs = options.resultsMs ?? RESULTS_MS;
  const countdownMs = options.countdownMs ?? COUNTDOWN_MS;
  const pick = options.pickPassages ?? defaultPick;

  const present = (state: TypeRaceState, n: number) => state.players.filter((p) => p.leftIn === null || p.leftIn >= n);
  const roster = (state: TypeRaceState, n: number) => present(state, n).map((p) => ({ id: p.id, name: p.name }));

  function liveEntry(state: TypeRaceState, race: RaceState, id: PublicId, now: number): RaceProgressEntry {
    const e = race.entries.get(id)!;
    const elapsed = e.finishedMs ?? Math.max(0, now - race.startAt);
    return { id, words: e.words, wpm: wpm(charsThrough(race.words, e.words), elapsed), finishedMs: e.finishedMs };
  }

  function beginRace(state: TypeRaceState, n: number, ctx: Ctx) {
    const passage = state.passages[n - 1];
    const startAt = ctx.now() + countdownMs;
    const race: RaceState = {
      n,
      passage,
      words: splitWords(passage.text),
      totalChars: passage.text.length,
      startAt,
      endAt: startAt + state.limitMs,
      stage: "countdown",
      entries: new Map(),
      end: null,
    };
    for (const p of present(state, n)) race.entries.set(p.id, { words: 0, keystrokes: 0, errors: 0, finishedMs: null });
    state.race = race;
    state.cancelTimers = [ctx.schedule(countdownMs, { type: "go", race: n }), ctx.schedule(countdownMs + state.limitMs, { type: "endRace", race: n })];
    // Only this race's passage is ever sent, and only now: the next one stays on the server.
    ctx.broadcast({
      type: "raceStart",
      race: n,
      totalRaces: state.settings.races,
      passage: { text: passage.text, ...(passage.source ? { source: passage.source } : {}) },
      serverNow: ctx.now(),
      startAt,
      endAt: race.endAt,
      players: roster(state, n),
    });
  }

  function endRace(state: TypeRaceState, ctx: Ctx) {
    const race = state.race;
    if (!race || race.stage === "results") return;
    race.stage = "results";
    state.cancelTimers.forEach((c) => c());
    state.cancelTimers = [];

    const inRace = present(state, race.n);
    const inputs = inRace.map((p) => {
      const e = race.entries.get(p.id)!;
      const finished = e.finishedMs !== null;
      // An unfinished race is measured to the limit, so a slow DNF can't look fast.
      const elapsed = finished ? e.finishedMs! : state.limitMs;
      const chars = charsThrough(race.words, e.words);
      return {
        id: p.id,
        finishedMs: e.finishedMs,
        progress: race.totalChars === 0 ? 0 : chars / race.totalChars,
        wpm: wpm(chars, elapsed),
        accuracy: accuracy(e.keystrokes - e.errors, e.keystrokes),
      };
    });
    const results = placeRace(inputs);
    for (const r of results) {
      const player = state.players.find((p) => p.id === r.id)!;
      player.points += r.points;
      player.history.push({ wpm: r.wpm, accuracy: r.accuracy });
    }
    // Races after a player left count 0 WPM and 0 accuracy in their averages.
    for (const p of state.players) if (p.leftIn !== null && p.leftIn < race.n) p.history.push({ wpm: 0, accuracy: 0 });

    race.end = { race: race.n, results, nextAt: ctx.now() + resultsMs };
    ctx.broadcast({ type: "raceEnd", ...race.end });
    state.cancelTimers = [
      ctx.schedule(resultsMs, race.n < state.settings.races ? { type: "nextRace", race: race.n } : { type: "finish" }),
    ];
  }

  // Ends the race once every player still in the match has finished. A player in their reconnect
  // grace is still in the match (the room only reports a leave once the seat is gone), so the race
  // waits for them until the time limit.
  function endEarlyIfDone(state: TypeRaceState, ctx: Ctx) {
    const race = state.race;
    if (!race || race.stage !== "racing") return;
    const waiting = present(state, race.n).filter((p) => p.leftIn === null);
    if (waiting.length === 0) return;
    if (waiting.every((p) => race.entries.get(p.id)?.finishedMs !== null)) endRace(state, ctx);
  }

  function progress(state: TypeRaceState, id: PublicId, msg: { words: number; keystrokes: number; errors: number }, ctx: Ctx) {
    const race = state.race;
    const entry = race?.entries.get(id);
    if (!race || !entry || race.stage === "results") return;
    const player = state.players.find((p) => p.id === id);
    if (!player || player.leftIn !== null) return;
    // The clock decides, not the stage: a message can beat the `go` timer by a few ms.
    const decision = acceptProgress(entry, msg, ctx.now(), race.startAt, race.endAt, race.words);
    if (!decision.ok) return;
    race.entries.set(id, decision.entry);
    ctx.broadcast({ type: "raceProgress", ...liveEntry(state, race, id, ctx.now()) });
    endEarlyIfDone(state, ctx);
  }

  function finish(state: TypeRaceState, ctx: Ctx) {
    if (state.status === "finished") return;
    state.status = "finished";
    state.cancelTimers = [];
    state.standings = rankStandings(state.players.map((p) => ({ id: p.id, name: p.name, points: p.points, races: p.history })));
    ctx.broadcast({ type: "matchEnd", standings: state.standings });
  }

  // The fairness boundary and the only source of a snapshot: the current race's passage, the
  // player's own counts, everyone's progress (words and WPM, never text).
  function view(state: TypeRaceState, id: PublicId, now: number): Omit<RaceSnapshot, "type" | "serverNow"> | null {
    const race = state.race;
    const own = race?.entries.get(id);
    if (!race || !own) return null;
    return {
      stage: state.status === "finished" ? "finished" : race.stage,
      race: race.n,
      totalRaces: state.settings.races,
      passage: { text: race.passage.text, ...(race.passage.source ? { source: race.passage.source } : {}) },
      startAt: race.startAt,
      endAt: race.endAt,
      players: roster(state, race.n),
      own: { words: own.words, keystrokes: own.keystrokes, errors: own.errors, finishedMs: own.finishedMs },
      progress: [...race.entries.keys()].map((pid) => liveEntry(state, race, pid, now)),
      raceEnd: race.end,
      standings: state.standings,
    };
  }

  return {
    id: "type-race",
    defaultSettings: { races: DEFAULT_RACES, length: DEFAULT_LENGTH },
    actionLimit: TYPE_RACE_ACTION_LIMIT,

    validateSettings(input) {
      const { races, length } = (input ?? {}) as { races?: unknown; length?: unknown };
      if (!isRaces(races) || !isPassageLength(length)) throw new Error("invalid settings");
      return { races, length };
    },

    // The host may send either field or both; anything invalid, or nothing valid, drops the message.
    settingsUpdate(current, msg) {
      const hasRaces = "races" in msg;
      const hasLength = "length" in msg;
      if (!hasRaces && !hasLength) return null;
      if (hasRaces && !isRaces(msg.races)) return null;
      if (hasLength && !isPassageLength(msg.length)) return null;
      return { races: hasRaces ? (msg.races as Races) : current.races, length: hasLength ? (msg.length as PassageLength) : current.length };
    },

    lobbyFields: ({ races, length }) => ({ races, length }),

    parseAction(input) {
      if (typeof input !== "object" || input === null) return null;
      const { type, words, keystrokes, errors } = input as Record<string, unknown>;
      if (type !== "progress") return null;
      for (const n of [words, keystrokes, errors]) {
        if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_COUNT) return null;
      }
      return { type, words: words as number, keystrokes: keystrokes as number, errors: errors as number };
    },

    createState(players: RoomPlayer[], settings, ctx) {
      const state: TypeRaceState = {
        settings,
        limitMs: options.limitMs?.(settings.length) ?? LIMIT_SECONDS[settings.length] * 1000 * scale,
        passages: pick(settings.length, settings.races),
        players: players.map((p) => ({ id: p.id, name: p.name, points: 0, leftIn: null, history: [] })),
        race: null,
        status: "running",
        standings: null,
        cancelTimers: [],
      };
      beginRace(state, 1, ctx);
      return state;
    },

    onAction(state, sender: Sender, action, ctx) {
      switch (action.type) {
        case "progress":
          if (sender !== SYSTEM) progress(state, sender, action, ctx);
          break;
        case "go":
          if (sender === SYSTEM && state.race?.n === action.race && state.race.stage === "countdown") state.race.stage = "racing";
          break;
        case "endRace":
          if (sender === SYSTEM && state.race?.n === action.race) endRace(state, ctx);
          break;
        case "nextRace":
          if (sender === SYSTEM && state.race?.n === action.race && state.race.stage === "results") beginRace(state, action.race + 1, ctx);
          break;
        case "finish":
          if (sender === SYSTEM) finish(state, ctx);
          break;
      }
      return state;
    },

    // The seat is gone for good: this race is a DNF for them and they are absent from later ones.
    onPlayerLeave(state, id, ctx) {
      const player = state.players.find((p) => p.id === id);
      if (player && player.leftIn === null) player.leftIn = state.race?.n ?? 1;
      endEarlyIfDone(state, ctx);
      return state;
    },

    onPlayerReturn(state, id, ctx) {
      const snapshot = view(state, id, ctx.now());
      if (snapshot) ctx.sendTo(id, { type: "raceSnapshot", serverNow: ctx.now(), ...snapshot });
      return state;
    },

    rateLimitedReply: (action) => (action.type === "progress" ? { type: "progressRejected", reason: "rate-limited" } : null),

    viewFor: (state, id) => view(state, id, Date.now()),

    isFinished: (state) => state.status === "finished",
  };
}
