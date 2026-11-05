import { defineConfig, devices } from "@playwright/test";

// e2e owns ports 3000 and 1999 and fails fast if they are busy: stop `npm run dev` first.
// PartyKit runs with partykit.e2e.json so the solo answers are fixed (party/e2e/answers.ts).
//
// The app runs as a production build, not `next dev`: on-demand route compiles under parallel
// workers made first runs time out at random (Phase 4), and hydration timing is closer to what
// players get. Motion is reduced by default so tests never wait on an animation; one test in
// e2e/resilience.spec.ts turns it back on.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3000", contextOptions: { reducedMotion: "reduce" } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx partykit dev -c partykit.e2e.json -p 1999",
      port: 1999,
      reuseExistingServer: false,
    },
    {
      command: "npx next build && npx next start -p 3000",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
