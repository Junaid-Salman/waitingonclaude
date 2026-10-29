import type { Effect } from "./room";

export interface EffectTarget {
  send(data: string): void;
  close(code: number): void;
}

// Runs room effects against real connections. A connection that died between the room's decision
// and the send must not stop the remaining effects, or one dead socket would freeze everyone
// else's lobby.
export function applyEffects(effects: Effect[], find: (connId: string) => EffectTarget | undefined): void {
  for (const effect of effects) {
    const target = find(effect.kind === "send" ? effect.to : effect.connId);
    if (!target) continue;
    try {
      if (effect.kind === "send") target.send(JSON.stringify(effect.message));
      else target.close(effect.code);
    } catch {
      // Already closed; its onClose will update the room.
    }
  }
}
