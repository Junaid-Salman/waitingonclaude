"use client";

import { motion } from "framer-motion";
import { WORD_LENGTH } from "../../../shared/protocol";
import type { Row } from "@/lib/woordle/store";
import { Tile } from "./Tile";

interface Props {
  rows: Row[];
  input: string;
  maxGuesses: number;
  // Bumped on every refused guess; each new value shakes the row being typed.
  shake?: number;
  // The row that solved the board, if any.
  solvedRow?: number | null;
}

export function Grid({ rows, input, maxGuesses, shake = 0, solvedRow = null }: Props) {
  // Six rows of square tiles: on a short phone the grid shrinks with the screen height too, so the
  // keyboard (about 21rem with the title and status line) stays on screen. It never goes below
  // 12rem (tiles about 36 px): on a shorter screen, such as a phone on its side, the page scrolls.
  return (
    <div role="group" aria-label="Guesses" className="mx-auto grid w-full max-w-[clamp(12rem,calc((100dvh_-_21rem)*5/6),20rem)] gap-1.5">
      {Array.from({ length: maxGuesses }, (_, r) => {
        const row = rows[r];
        const typing = !row && r === rows.length;
        const tiles = Array.from({ length: WORD_LENGTH }, (_, c) => (
          <Tile key={c} index={c} letter={row ? row.word[c] : typing ? (input[c] ?? "") : ""} colour={row?.colours[c]} bounce={r === solvedRow} />
        ));
        if (typing && shake > 0) {
          // A new key per refusal replays the shake.
          return (
            <motion.div
              key={`shake-${shake}`}
              className="grid grid-cols-5 gap-1.5"
              data-row={r}
              animate={{ x: [0, -8, 8, -6, 6, -3, 0] }}
              transition={{ duration: 0.4 }}
            >
              {tiles}
            </motion.div>
          );
        }
        return (
          <div key={r} className="grid grid-cols-5 gap-1.5" data-row={r}>
            {tiles}
          </div>
        );
      })}
    </div>
  );
}
