import { routePartykitRequest } from "partyserver";
import ChallengeServer from "./challenge";
import { getGame } from "./games";
import RoomServer, { createRoomServer } from "./main";
import SoloServer from "./solo";
import TypeRaceSoloServer from "./type-race-solo";

// The Cloudflare Worker (wrangler.jsonc). Each export is a Durable Object class; its binding name,
// kebab-cased, is the party in the URL: /parties/main/<code>, /parties/challenge/<id>,
// /parties/solo/<id>, /parties/type-race/<code>, /parties/type-race-solo/passage. Renaming or adding a class needs a new `migrations` entry in wrangler.jsonc.
// The Type Race room: the same room layer as Main with the Type Race game (party `type-race`).
const TypeRaceRoomServer = createRoomServer({ game: getGame("type-race") });

export { RoomServer as Main, ChallengeServer as Challenge, SoloServer as Solo, TypeRaceSoloServer as TypeRaceSolo, TypeRaceRoomServer as TypeRace };

const worker = {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 });
  },
};
export default worker;
