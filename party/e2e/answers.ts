// Fixed answers for the e2e suite. Used only by wrangler.e2e.jsonc, never by wrangler.jsonc.

// Solo: every game's answer.
export const E2E_ANSWER = "crane";

// Rooms: the five answers of every match, in round order. All must be valid guesses and distinct.
export const E2E_ROOM_ANSWERS = ["crane", "slate", "robot", "moist", "light"] as const;

// Round limits shrink to 1% (a 2 min round lasts 1.2 s, 5 min lasts 3 s). The pause between rounds
// is not scaled: it stays long enough for a test to see the round summary.
export const E2E_TIME_SCALE = 0.01;
export const E2E_REVEAL_MS = 1500;

// Reconnect grace for rooms: long enough for a refresh to come back, short enough to test expiry.
export const E2E_GRACE_MS = 5000;

// Room round limits in e2e: 2 min and 5 min stay fast (1.2 s and 3 s, as E2E_TIME_SCALE gives);
// 3 min, the default, lasts 20 s so a test can refresh a page mid-round and see it restored.
export const E2E_ROUND_MS = { 120: 1200, 180: 20_000, 300: 3000 } as const;

// Type Race Practice: the short passages the e2e server hands out, in this order (a request skips the
// ids it is told to exclude). Plain data so Playwright specs can import it without the Worker code.
export const E2E_SHORT_PASSAGES = [
  { id: "e-001", length: "short", text: "The quick brown fox, said the clerk, jumps over lazy dogs; it then rests by the quiet river for an hour." },
  { id: "e-002", length: "short", text: "Seven small boats left the harbour at dawn, and by the time the fog lifted they had all found the bay." },
] as const;

// Type Race rooms: the passages of a match in race order (about 40 characters, so a test types one in
// a few seconds), and the race limits. A short race lasts 20 s so a page can be refreshed mid-race;
// medium and long last 3 s so a timeout is quick to reach. The countdown stays 3 s and the pause
// between races is E2E_REVEAL_MS.
export const E2E_RACE_PASSAGES = [
  { id: "r-001", length: "short", text: "The red fox ran far away from the barn." },
  { id: "r-002", length: "short", text: "Seven boats left the harbour at dawn." },
  { id: "r-003", length: "short", text: "A quiet river runs past the old mill." },
] as const;
export const E2E_RACE_LIMIT_MS = { short: 20_000, medium: 3000, long: 3000 } as const;
