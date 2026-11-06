// Stand-in for the `cloudflare:workers` runtime module, aliased in vitest.config.ts so the
// PartyServer adapters can be driven in Node. Only what partyserver's Server touches at
// construction is provided; sockets and storage are faked per test.
export class DurableObject<Env = unknown> {
  constructor(
    readonly ctx: unknown,
    readonly env: Env,
  ) {}
}

export const env = {};
