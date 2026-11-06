import { expect, test, type Page } from "@playwright/test";
import { createRoom, joinRoom, newPlayer, typeGuess } from "./helpers";

// Production smoke test (Phase 7.4). Runs only via `PROD_URL=https://... npm run test:prod`
// (playwright.prod.config.ts), never in the normal suite. It plays against real answers it cannot
// know, so it checks what is observable: the server scores guesses, the round ends on the timer,
// and no frame carries the answer before roundEnd.
//
// Guesses are real words; one of them being the hidden answer is about a 1-in-1,400 chance per
// word, and would show up as a solved row, not a silent pass.
const WRONG = ["pious", "brick", "fudge", "nymph", "vowel", "jumpy"];
const SCORED = '[data-state="green"], [data-state="yellow"], [data-state="grey"]';

const scoredInRow = (page: Page, row: number) => page.locator(`[data-row="${row}"]`).locator(SCORED);

function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    if (ws.url().includes("/parties/")) ws.on("framereceived", (f) => frames.push(String(f.payload)));
  });
  return frames;
}

test.describe("pages and assets", () => {
  for (const path of ["/", "/woordle", "/woordle/solo", "/woordle/challenge/new"]) {
    test(`${path} shows the logo and disclaimer and does not scroll sideways at 390 px`, async ({ browser }) => {
      const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      // At 390 px the header shows the small mark (aria-hidden); the name is on the home link.
      await expect(page.getByRole("link", { name: "WaitingOnClaude home" })).toBeVisible();
      await expect(page.getByText("Not affiliated with Anthropic or The New York Times.")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }

  test("manifest, icons and the Open Graph image are served with the right types", async ({ request }) => {
    const expected: [string, RegExp][] = [
      ["/manifest.webmanifest", /application\/manifest\+json/],
      ["/icon.svg", /image\/svg\+xml/],
      ["/apple-icon.png", /image\/png/],
      ["/opengraph-image.png", /image\/png/],
    ];
    for (const [path, type] of expected) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-type"], path).toMatch(type);
    }
  });
});

test("solo: a guess is scored by the server", async ({ page }) => {
  await page.goto("/woordle/solo");
  await expect(page.locator('[data-row="0"] [data-state="empty"]')).toHaveCount(5);
  await expect(async () => {
    await page.keyboard.type(WRONG[0]);
    await expect(page.locator('[data-row="0"] [data-state="typed"]')).toHaveCount(5, { timeout: 1000 });
  }).toPass({ timeout: 15_000 }); // keys before hydration are dropped; retry until they land
  await page.keyboard.press("Enter");
  await expect(scoredInRow(page, 0)).toHaveCount(5);
});

test("room: a 2 min match is scored by the server, ends on the timer, and never leaks the answer early", async ({ browser }) => {
  test.setTimeout(240_000);
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const aliFrames = recordFrames(ali);
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect(ali.getByTestId("player")).toHaveCount(2);
  await ali.getByRole("button", { name: "2 min" }).click();
  await expect(ali.getByRole("button", { name: "2 min" })).toHaveAttribute("aria-pressed", "true");
  await ali.getByRole("button", { name: "Start match" }).click();
  await expect(ali.getByTestId("round-label")).toHaveText("Round 1 of 5");
  await expect(bo.getByTestId("round-label")).toHaveText("Round 1 of 5");

  // Bo uses all 6 guesses (done); Ali makes one and stays unfinished, so only the timer can end it.
  await typeGuess(ali, WRONG[0]);
  await expect(scoredInRow(ali, 0)).toHaveCount(5);
  for (let row = 0; row < 6; row++) {
    await typeGuess(bo, WRONG[row]);
    await expect(scoredInRow(bo, row)).toHaveCount(5);
  }
  await expect(bo.getByTestId("round-summary")).toHaveCount(0); // Ali is still playing

  await expect(ali.getByTestId("round-summary")).toBeVisible({ timeout: 150_000 });
  const answer = (await ali.getByTestId("round-answer").textContent())!.trim().toLowerCase();
  expect(answer).toMatch(/^[a-z]{5}$/);

  const endIndex = aliFrames.findIndex((f) => f.includes('"type":"roundEnd"'));
  expect(endIndex).toBeGreaterThan(0);
  expect(aliFrames.slice(0, endIndex).join("\n")).not.toContain(`"${answer}"`);
  expect(aliFrames[endIndex]).toContain(answer); // the scan is not vacuous

  const start = aliFrames.map((f) => JSON.parse(f)).find((m) => m.type === "roundStart");
  const end = JSON.parse(aliFrames[endIndex]);
  expect(end.answer).toBe(answer);
  expect(start.endsAt - start.startedAt).toBeGreaterThan(115_000); // a real 2 min round, not shortened
});

test("challenge: a link is created, opened in another browser, and its guesses are scored", async ({ browser }) => {
  const creator = await newPlayer(browser);
  await creator.goto("/woordle/challenge/new");
  for (const [i, word] of ["crane", "slate", "pious", "brick", "flame"].entries()) {
    await creator.getByTestId(`word-${i}`).fill(word);
    await creator.keyboard.press("Tab");
  }
  await creator.getByRole("button", { name: "1 min" }).click();
  const create = creator.getByRole("button", { name: "Create link" });
  await expect(create).toBeEnabled();
  await create.click();
  const link = await creator.getByTestId("challenge-link").inputValue();
  expect(new URL(link).pathname).toMatch(/^\/woordle\/challenge\/[A-Za-z0-9_-]{40,}$/);

  const solver = await newPlayer(browser);
  await solver.goto(link);
  const enabledStart = solver.getByRole("button", { name: "Start" }).and(solver.locator(":enabled"));
  await expect(async () => {
    await enabledStart.click({ timeout: 1000 });
    await expect(enabledStart).toHaveCount(0, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(solver.getByTestId("round-label")).toHaveText("Word 1 of 5");
  await solver.keyboard.type("crane");
  await solver.keyboard.press("Enter");
  await expect(solver.getByTestId("round-summary")).toBeVisible();
  await expect(solver.getByTestId("round-answer")).toHaveText(/crane/i);
});
