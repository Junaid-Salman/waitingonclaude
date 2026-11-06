import { defineConfig, devices } from "@playwright/test";

// e2e owns ports 3000 and 1999 and fails fast if they are busy: stop `npm run dev` first.
// The Worker runs with wrangler.e2e.jsonc so the answers are fixed (party/e2e/answers.ts).
// `--env-file /dev/null` stops wrangler loading the local .env, so the config's public test key is
// used instead of the developer's own CHALLENGE_KEY.
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
      command: "npx wrangler dev -c wrangler.e2e.jsonc --port 1999 --env-file /dev/null",
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
