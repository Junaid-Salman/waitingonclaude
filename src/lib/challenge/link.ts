import { MAX_TOKEN_CHARS } from "../../../shared/protocol";

// The link is built from the page origin, so it is right on localhost, previews and production.
export const challengePath = (token: string): string => `/woordle/challenge/${token}`;

export const challengeLink = (origin: string, token: string): string => `${origin}${challengePath(token)}`;

// A token the server could possibly accept: URL-safe base64 within the length cap. Checked before
// any socket opens, so a mangled link says "expired" at once instead of waiting on a reply.
export const isPlausibleToken = (token: string): boolean =>
  token.length > 0 && token.length <= MAX_TOKEN_CHARS && /^[A-Za-z0-9_-]+$/.test(token);
