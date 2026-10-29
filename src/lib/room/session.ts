// The player's secret id and last name live in sessionStorage, so they die with the tab (no cookies,
// no server-side accounts). Every access is guarded: storage can throw in private windows or when
// site data is blocked, and the app must still work then, with a memory-only session.

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEYS = { playerId: "woc:playerId", name: "woc:name", room: "woc:room" } as const;

export interface Session {
  playerId(): string;
  name(): string | null;
  // The room this tab last joined, so a refresh re-joins without asking for the name again.
  joinedRoom(): string | null;
  remember(room: string, name: string): void;
}

export function createSession(storage: KeyValueStorage | null, newId: () => string = () => crypto.randomUUID()): Session {
  const memory = new Map<string, string>();

  const read = (key: string): string | null => {
    try {
      const value = storage?.getItem(key) ?? null;
      if (value !== null) return value;
    } catch {
      // fall through to memory
    }
    return memory.get(key) ?? null;
  };
  const write = (key: string, value: string) => {
    memory.set(key, value);
    try {
      storage?.setItem(key, value);
    } catch {
      // memory copy above keeps this tab working
    }
  };

  return {
    playerId() {
      const existing = read(KEYS.playerId);
      if (existing) return existing;
      const id = newId();
      write(KEYS.playerId, id);
      return id;
    },
    name: () => read(KEYS.name),
    joinedRoom: () => read(KEYS.room),
    remember(room, name) {
      write(KEYS.room, room);
      write(KEYS.name, name);
    },
  };
}

let shared: Session | null = null;

// Call from effects or event handlers only: sessionStorage does not exist during prerender.
export function browserSession(): Session {
  if (!shared) {
    let storage: KeyValueStorage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    shared = createSession(storage);
  }
  return shared;
}
