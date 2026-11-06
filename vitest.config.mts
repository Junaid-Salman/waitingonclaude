import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // partyserver imports the Workers runtime module; inline it so the alias below applies.
    server: { deps: { inline: ["partyserver"] } },
  },
  resolve: {
    // Resolved from the repo root, where npm scripts run vitest.
    alias: { "cloudflare:workers": resolve("tests/helpers/cloudflare-workers.ts") },
  },
});
