// Animation timings shared by the board and the keyboard, so the keys change colour when the last
// tile of a row has finished flipping. All motion is visual only: data-state and colour classes
// change at once, so tests and screen readers never wait for an animation.
export const FLIP_S = 0.35;
export const FLIP_STAGGER_S = 0.1;
// From the first tile starting to the last tile landing, for a 5-letter row.
export const ROW_REVEAL_MS = Math.round((FLIP_S + FLIP_STAGGER_S * 4) * 1000);
