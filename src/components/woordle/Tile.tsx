"use client";

import { motion } from "framer-motion";
import type { TileColour } from "../../../shared/protocol";
import { tileClassesByColour, tileClassesUnscored } from "@/lib/colors";
import { FLIP_S, FLIP_STAGGER_S } from "@/lib/motion/timing";

const labels: Record<TileColour, string> = { green: "correct", yellow: "in the word, wrong place", grey: "not in the word" };

interface Props {
  letter: string;
  colour?: TileColour;
  // Column, for the left-to-right stagger of a row's flip.
  index?: number;
  // The row that solved the round hops once its flip has finished.
  bounce?: boolean;
}

export function Tile({ letter, colour, index = 0, bounce = false }: Props) {
  const label = letter ? `${letter.toUpperCase()}, ${colour ? labels[colour] : "not yet guessed"}` : "empty";
  const classes = `flex aspect-square items-center justify-center rounded border-2 bold-display-xs uppercase sm:bold-display-sm ${
    colour ? tileClassesByColour[colour] : letter ? tileClassesUnscored.typed : tileClassesUnscored.empty
  }`;
  const common = { role: "img", "aria-label": label, "data-state": colour ?? (letter ? "typed" : "empty"), className: classes };

  if (colour) {
    // A new key remounts the tile when it is scored, so the flip plays exactly once.
    const flipDelay = index * FLIP_STAGGER_S;
    return (
      <motion.div
        key="scored"
        {...common}
        initial={{ rotateX: 90 }}
        animate={{ rotateX: 0, y: bounce ? [0, -12, 0] : 0 }}
        transition={{
          rotateX: { delay: flipDelay, duration: FLIP_S, ease: "easeOut" },
          y: { delay: FLIP_STAGGER_S * 4 + FLIP_S + index * 0.08, duration: 0.3 },
        }}
      >
        {letter}
      </motion.div>
    );
  }
  if (letter) {
    // Remounts per letter, so each keystroke pops the tile it lands in.
    return (
      <motion.div key={`typed-${letter}`} {...common} initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ duration: 0.1 }}>
        {letter}
      </motion.div>
    );
  }
  return <div {...common} />;
}
