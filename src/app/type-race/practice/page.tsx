import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { PracticeGame } from "@/components/type-race/PracticeGame";

export const metadata: Metadata = { title: "Type Race practice · WaitingOnClaude" };

export default function PracticePage() {
  return (
    <>
      {/* The header's Create room makes a Woordle room, so it stays out of Type Race pages. */}
      <SiteHeader createRoom={false} />
      <PracticeGame />
    </>
  );
}
