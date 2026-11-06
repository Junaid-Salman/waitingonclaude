import { routePartykitRequest } from "partyserver";
import ChallengeServer from "./challenge";
import RoomServer from "./main";
import SoloServer from "./solo";

// The Cloudflare Worker (wrangler.jsonc). Each export is a Durable Object class; its binding name,
// kebab-cased, is the party in the URL: /parties/main/<code>, /parties/challenge/<id>,
// /parties/solo/<id>. Renaming or adding a class needs a new `migrations` entry in wrangler.jsonc.
export { RoomServer as Main, ChallengeServer as Challenge, SoloServer as Solo };

const worker = {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 });
  },
};
export default worker;
