"use client";

import { useParams } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { ChallengeGame } from "./ChallengeGame";

// Reads the token from the route on the client; the page itself stays static.
export function ChallengeLoader() {
  const params = useParams<{ token: string }>();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 pt-2 pb-8 sm:px-12 sm:pt-6">
        <ChallengeGame token={params.token ?? ""} />
      </main>
    </>
  );
}
