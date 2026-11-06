import { defineConfig, devices } from "@playwright/test";

// Production smoke test only: `PROD_URL=https://waitingonclaude.vercel.app npm run test:prod`.
// No web server: it runs against a deployed frontend and the real Worker behind it.
// One worker, so a run is a handful of real rooms, well inside the Workers Free limits.
const baseURL = process.env.PROD_URL;
if (!baseURL) throw new Error("Set PROD_URL to the deployed site, e.g. PROD_URL=https://waitingonclaude.vercel.app");

export default defineConfig({
  testDir: "e2e",
  testMatch: "prod-smoke.spec.ts",
  workers: 1,
  timeout: 60_000,
  use: { baseURL, contextOptions: { reducedMotion: "reduce" } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
