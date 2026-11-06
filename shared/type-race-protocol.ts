// Type Race message and HTTP shapes. A separate file from shared/protocol.ts (Woordle) so the
// Woordle wire format stays untouched. Holds no secrets; passages are served by the server, never
// bundled into the client (Phase 8, Q33). Room and Challenge messages arrive in sub-phases 8.2, 8.3.

export const PASSAGE_LENGTHS = ["short", "medium", "long"] as const;
export type PassageLength = (typeof PASSAGE_LENGTHS)[number];

export const isPassageLength = (value: unknown): value is PassageLength =>
  typeof value === "string" && (PASSAGE_LENGTHS as readonly string[]).includes(value);

// GET /parties/type-race-solo/passage?length=short&exclude=s-001,s-002
export interface PassageResponse {
  id: string;
  text: string;
  length: PassageLength;
  source?: string;
}

export interface PassageError {
  error: "invalid" | "rate-limited";
}

// More ids than this in `exclude` is a hostile request. Practice sends the last 10.
export const MAX_EXCLUDE_IDS = 20;
