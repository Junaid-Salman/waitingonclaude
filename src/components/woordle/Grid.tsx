import { WORD_LENGTH } from "../../../shared/protocol";
import type { Row } from "@/lib/woordle/store";
import { Tile } from "./Tile";

export function Grid({ rows, input, maxGuesses }: { rows: Row[]; input: string; maxGuesses: number }) {
  return (
    <div role="group" aria-label="Guesses" className="mx-auto grid w-full max-w-[20rem] gap-1.5">
      {Array.from({ length: maxGuesses }, (_, r) => {
        const row = rows[r];
        const typing = !row && r === rows.length;
        return (
          <div key={r} className="grid grid-cols-5 gap-1.5" data-row={r}>
            {Array.from({ length: WORD_LENGTH }, (_, c) => (
              <Tile
                key={c}
                letter={row ? row.word[c] : typing ? (input[c] ?? "") : ""}
                colour={row?.colours[c]}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
