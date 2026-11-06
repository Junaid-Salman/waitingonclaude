import type { Connection } from "partyserver";

// A fake Durable Object state: partyserver reads only the name from it when hibernation is off.
export function fakeCtx(name: string): DurableObjectState {
  return { id: { name } } as unknown as DurableObjectState;
}

export function asConnection(fake: object): Connection {
  return fake as unknown as Connection;
}
