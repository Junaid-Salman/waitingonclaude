// Fixed answers for the e2e suite. Used only by partykit.e2e.json, never by partykit.json.

// Solo: every game's answer.
export const E2E_ANSWER = "crane";

// Rooms: the five answers of every match, in round order. All must be valid guesses and distinct.
export const E2E_ROOM_ANSWERS = ["crane", "slate", "robot", "moist", "light"] as const;

// Round limits shrink to 1% (a 2 min round lasts 1.2 s, 5 min lasts 3 s). The pause between rounds
// is not scaled: it stays long enough for a test to see the round summary.
export const E2E_TIME_SCALE = 0.01;
export const E2E_REVEAL_MS = 1500;
