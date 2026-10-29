import { generateRoomCode, type Rng } from "../../../shared/room-code";
import { partyHost, partyHttpUrl } from "../party-host";

const MAX_ATTEMPTS = 5;

export class CreateRoomError extends Error {}

// POST /parties/main/<CODE>: 201 means the code is ours, 409 means a live room holds it, so retry
// with a new code.
export async function createRoom(
  options: { host?: string; fetchFn?: typeof fetch; rng?: Rng } = {},
): Promise<string> {
  const base = partyHttpUrl(options.host ?? partyHost());
  const fetchFn = options.fetchFn ?? fetch;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = generateRoomCode(options.rng);
    let res: Response;
    try {
      res = await fetchFn(`${base}/parties/main/${code}`, { method: "POST" });
    } catch {
      throw new CreateRoomError("Can't reach the game server. Check your connection and try again.");
    }
    if (res.status === 201) return code;
    if (res.status !== 409) throw new CreateRoomError(`Could not create a room (error ${res.status}).`);
  }
  throw new CreateRoomError("Could not find a free room code. Try again.");
}
