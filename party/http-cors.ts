// PartyServer adds no CORS headers, so a browser's cross-origin POST would be blocked without these.
// There are no cookies or credentials, so "*" exposes nothing a direct request could not do.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export function reply(status: number, body: string | null, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...CORS_HEADERS, ...extra } });
}

export function replyJson(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return reply(status, JSON.stringify(body), { "Content-Type": "application/json", ...extra });
}
