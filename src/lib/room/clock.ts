// The client clock is display-only: the server decides every start, end and solve time. The offset
// is the server clock minus the client clock, estimated when a round starts (the message carries
// the server time it was sent), so it is off by one network trip at most.

export const offsetFrom = (serverTime: number, clientNow: number): number => serverTime - clientNow;

export const toServerTime = (clientNow: number, offset: number): number => clientNow + offset;

export const remainingMs = (endsAt: number, clientNow: number, offset: number): number =>
  Math.max(0, endsAt - toServerTime(clientNow, offset));

const minutesSeconds = (totalSeconds: number) =>
  `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;

// A countdown rounds up, so it reads 0:01 until the moment it is really over.
export const formatCountdown = (ms: number): string => minutesSeconds(Math.ceil(Math.max(0, ms) / 1000));

// A finished duration (a solve time) rounds down.
export const formatDuration = (ms: number): string => minutesSeconds(Math.floor(Math.max(0, ms) / 1000));
