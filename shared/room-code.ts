// Four letters, no I, L or O (easy to confuse with 1 and 0). 23^4 = 279,841 codes.
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_PATTERN = /^[A-HJ-KM-NP-Z]{4}$/;

export function isRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value);
}

// Returns a float in [0, 1). Injectable so tests can fix the draw.
export type Rng = () => number;

const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
};

export function generateRoomCode(rng: Rng = cryptoRng): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
