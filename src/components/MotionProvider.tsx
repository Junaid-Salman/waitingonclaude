"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// "user" follows prefers-reduced-motion: with it on, every transform animation jumps to its end.
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
