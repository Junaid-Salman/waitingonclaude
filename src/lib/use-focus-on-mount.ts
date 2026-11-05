"use client";

import { useEffect, useRef } from "react";

// Moves focus to a screen's heading when it appears (round over, match over), so keyboard and
// screen-reader users land on the new content instead of a key that is no longer there. The
// heading needs tabIndex={-1}. Window-level key listeners keep working while it has focus.
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
