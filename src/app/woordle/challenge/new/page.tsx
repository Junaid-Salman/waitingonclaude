import type { Metadata } from "next";
import { ChallengeForm } from "@/components/challenge/ChallengeForm";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Make a challenge · WaitingOnClaude" };

export default function Page() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 pt-2 pb-8 sm:px-12 sm:pt-6">
        <ChallengeForm />
      </main>
    </>
  );
}
