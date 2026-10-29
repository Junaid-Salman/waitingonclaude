// Returns a float in [0, 1). Injectable so tests can fix the draw.
export type Rng = () => number;

// A 32-bit crypto draw scaled to [0, 1); the bias against a ~2,000-word pool is below 1e-6.
export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x1_0000_0000;
};

// Picks an answer not in `used`, records it, and resets `used` once every answer has been seen.
export function pickAnswer(answers: readonly string[], used: Set<string>, rng: Rng = cryptoRng): string {
  if (used.size >= answers.length) used.clear();
  const pool = answers.filter((w) => !used.has(w));
  const word = pool[Math.floor(rng() * pool.length)];
  used.add(word);
  return word;
}

// `count` different answers, uniformly at random (partial Fisher-Yates over a copy).
export function pickDistinct(answers: readonly string[], count: number, rng: Rng = cryptoRng): string[] {
  if (count > answers.length) throw new Error("not enough answers");
  const pool = [...answers];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
