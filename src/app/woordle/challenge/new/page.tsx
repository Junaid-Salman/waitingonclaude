import type { Metadata } from "next";
import { ChallengeForm } from "@/components/challenge/ChallengeForm";

export const metadata: Metadata = { title: "Make a challenge · WaitingOnClaude" };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center p-8">
      <ChallengeForm />
    </main>
  );
}
