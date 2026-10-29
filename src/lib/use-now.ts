"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 250;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, TICK_MS);
  return () => clearInterval(id);
}

// The current time in 250 ms steps, re-rendering the caller on each step. It reads the clock in a
// snapshot instead of render, so prerendering never sees a changing value (the server snapshot is 0).
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => 0,
  );
}
