// The secret a client generates and keeps in sessionStorage. Never broadcast.
export type PlayerId = string;

// The id the server assigns to a seat. Safe to broadcast.
export type PublicId = string;

export interface RoomPlayer {
  id: PublicId;
  name: string;
  isHost: boolean;
  connected: boolean;
}
