import { defineConfig, devices } from "@playwright/test";

// e2e owns ports 3000 and 1999 and fails fast if they are busy: stop `npm run dev` first.
// PartyKit runs with partykit.e2e.json so the solo answers are fixed (party/e2e/answers.ts).
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx partykit dev -c partykit.e2e.json -p 1999",
      port: 1999,
      reuseExistingServer: false,
    },
    {
      command: "npx next dev",
      url: "http://localhost:3000",
      reuseExistingServer: false,
    },
  ],
});
