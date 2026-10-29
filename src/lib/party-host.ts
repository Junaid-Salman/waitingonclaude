// Where the PartyKit server lives: localhost:1999 in dev, the deployed host in production.
export function partyHost(): string {
  return process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";
}

// PartyKit serves plain http locally and https once deployed.
export function partyHttpUrl(host: string): string {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}
