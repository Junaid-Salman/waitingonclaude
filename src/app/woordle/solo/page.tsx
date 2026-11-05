import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SoloGame } from "@/components/woordle/SoloGame";

export const metadata: Metadata = { title: "Woordle (solo) · WaitingOnClaude" };

export default function SoloPage() {
  return (
    <>
      <SiteHeader />
      <SoloGame />
    </>
  );
}
