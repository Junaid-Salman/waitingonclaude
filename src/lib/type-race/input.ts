// Maps a `beforeinput` event to an engine action, so the paste/drop/autocorrect blocks can be unit
// tested without a DOM. Anything not listed returns null: the caller cancels the event and the
// engine never hears of it, so only real single keystrokes count (spec 4: no paste or autofill).
import type { EngineAction } from "./engine";

export function inputAction(inputType: string, data: string | null | undefined): EngineAction | null {
  switch (inputType) {
    case "insertText":
      // A multi-character insert is autocomplete or a paste in disguise.
      return typeof data === "string" && data.length === 1 ? { type: "char", char: data } : null;
    case "deleteContentBackward":
      return { type: "backspace" };
    case "deleteWordBackward":
    case "deleteSoftLineBackward":
      // Ctrl+Backspace clears the current word only: completed words can't be edited.
      return { type: "clearWord" };
    default:
      // insertFromPaste, insertFromDrop, insertReplacementText, insertCompositionText, ...
      return null;
  }
}

// Caps Lock state for the warning above the input. Structural type so tests don't need a DOM event.
export function capsLockOn(event: { getModifierState?: (key: string) => boolean }): boolean {
  return event.getModifierState?.("CapsLock") === true;
}
