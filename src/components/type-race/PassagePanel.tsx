import type { EngineState } from "@/lib/type-race/engine";

// The passage as the player sees it: completed words muted, the current word underlined, a wrong
// character in red with a wavy underline (colour is never the only cue), then the rest. The panel
// is select-none so the text can't be copied out; paste is blocked at the input anyway.
export function PassagePanel({ engine }: { engine: EngineState }) {
  const { words, wordIndex, typed, firstError } = engine;
  const word = words[wordIndex] ?? "";
  const wrongEnd = Math.min(typed.length, word.length);
  const correctEnd = firstError ?? typed.length;
  const done = words.slice(0, wordIndex).join("");
  const rest = words.slice(wordIndex + 1).join("");

  return (
    <div
      role="group"
      aria-label="Passage to type"
      data-testid="passage"
      className="regular-text-xl select-none break-words text-foreground"
    >
      <span className="text-muted" data-testid="passage-done">
        {done}
      </span>
      {/* Underline is set per piece: a wavy error line can't be drawn inside a straight one. */}
      <span data-testid="passage-current">
        <span className="underline decoration-2 underline-offset-4" data-testid="passage-correct">
          {word.slice(0, correctEnd)}
        </span>
        {firstError !== null && (
          <span className="text-invalid underline decoration-wavy decoration-invalid underline-offset-4" data-testid="passage-wrong">
            {word.slice(firstError, wrongEnd)}
          </span>
        )}
        <span className="underline decoration-2 underline-offset-4">{word.slice(firstError === null ? correctEnd : wrongEnd)}</span>
      </span>
      <span>{rest}</span>
    </div>
  );
}
