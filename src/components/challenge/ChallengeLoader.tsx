"use client";

import { useParams } from "next/navigation";
import { ChallengeGame } from "./ChallengeGame";

// Reads the token from the route on the client; the page itself stays static.
export function ChallengeLoader() {
  const params = useParams<{ token: string }>();
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col p-8">
      <ChallengeGame token={params.token ?? ""} />
    </main>
  );
}
