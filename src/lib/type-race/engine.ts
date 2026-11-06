// The typing engine (spec 4, 8.4): pure, no DOM, no clock. The UI feeds it one action per keystroke
// and renders the state it returns. Rules:
//  - exact match: case, spaces and punctuation all count;
//  - a word locks when what is typed equals the word plus its trailing space (the last word: exactly);
//  - after the first wrong character up to ERROR_BUFFER more are accepted, then keys are ignored
//    until Backspace gets back to the error (an ignored key is not a keystroke);
//  - Backspace works inside the current word only;
//  - a keystroke is correct only if it matches and no error comes before it in the word; `errors`
//    counts every incorrect keystroke, even after it is fixed.
import { splitWords } from "../../../shared/type-race/passage";

// Characters accepted past the first error ("5 chars after the first wrong one", spec 4).
export const ERROR_BUFFER = 5;

export type EngineAction =
  | { type: "char"; char: string }
  | { type: "backspace" }
  | { type: "clearWord" };

export interface EngineState {
  readonly words: readonly string[];
  readonly wordIndex: number;
  // What has been typed of the current word, wrong characters included.
  readonly typed: string;
  // Index in `typed` of the first wrong character, or null.
  readonly firstError: number | null;
  readonly keystrokes: number;
  readonly errors: number;
  // Characters of completed words: the number WPM is computed from.
  readonly lockedChars: number;
  readonly finished: boolean;
}

export function createEngine(text: string): EngineState {
  const words = splitWords(text);
  return {
    words,
    wordIndex: 0,
    typed: "",
    firstError: null,
    keystrokes: 0,
    errors: 0,
    lockedChars: 0,
    finished: words.length === 0,
  };
}

export const currentWord = (state: EngineState): string => state.words[state.wordIndex] ?? "";

export const correctKeystrokes = (state: EngineState): number => state.keystrokes - state.errors;

// The correct prefix of the current word (what the panel paints as typed), and the wrong tail.
export function typedSplit(state: EngineState): { correct: string; wrong: string } {
  const at = state.firstError ?? state.typed.length;
  return { correct: state.typed.slice(0, at), wrong: state.typed.slice(at) };
}

function press(state: EngineState, char: string): EngineState {
  const word = currentWord(state);
  if (state.firstError !== null && state.typed.length - state.firstError - 1 >= ERROR_BUFFER) return state;

  const correct = state.firstError === null && char === word[state.typed.length];
  const typed = state.typed + char;
  const counted = { keystrokes: state.keystrokes + 1, errors: state.errors + (correct ? 0 : 1) };

  if (!correct) {
    return { ...state, ...counted, typed, firstError: state.firstError ?? state.typed.length };
  }
  if (typed === word) {
    const wordIndex = state.wordIndex + 1;
    return {
      ...state,
      ...counted,
      typed: "",
      wordIndex,
      lockedChars: state.lockedChars + word.length,
      finished: wordIndex >= state.words.length,
    };
  }
  return { ...state, ...counted, typed };
}

function backspace(state: EngineState): EngineState {
  // Empty current word: the previous word is locked and cannot be edited.
  if (state.typed === "") return state;
  const typed = state.typed.slice(0, -1);
  const firstError = state.firstError !== null && typed.length <= state.firstError ? null : state.firstError;
  return { ...state, typed, firstError };
}

export function apply(state: EngineState, action: EngineAction): EngineState {
  if (state.finished) return state;
  switch (action.type) {
    case "char":
      // One character per keystroke; the input layer already refuses anything longer.
      return action.char.length === 1 ? press(state, action.char) : state;
    case "backspace":
      return backspace(state);
    case "clearWord":
      return state.typed === "" ? state : { ...state, typed: "", firstError: null };
  }
}
