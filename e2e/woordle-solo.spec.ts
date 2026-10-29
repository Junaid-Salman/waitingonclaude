import { expect, test, type Page } from "@playwright/test";

// partykit.e2e.json fixes every answer to "crane" (party/e2e/answers.ts).
const ANSWER = "crane";
const WRONG = ["slate", "robot", "pious", "moist", "light", "dwarf"];

async function open(page: Page) {
  await page.goto("/woordle/solo");
  await expect(page.getByRole("status")).toHaveText("");
}

const scoredTiles = (page: Page) => page.locator('[data-state="green"], [data-state="yellow"], [data-state="grey"]');

async function guess(page: Page, word: string) {
  await page.keyboard.type(word);
  await page.keyboard.press("Enter");
}

// The client ignores keys while a guess is in flight, so wait for the server's row before the next word.
async function guessAccepted(page: Page, word: string) {
  const before = await scoredTiles(page).count();
  await guess(page, word);
  await expect(scoredTiles(page)).toHaveCount(before + 5);
}

const rowStates = (page: Page, row: number) =>
  page.locator(`[data-row="${row}"] [data-state]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));

test("win: colours come from the server and a win ends the game", async ({ page }) => {
  await open(page);
  await guess(page, "slate");
  await expect.poll(() => rowStates(page, 0)).toEqual(["grey", "grey", "green", "grey", "green"]);
  await guess(page, ANSWER);
  await expect.poll(() => rowStates(page, 1)).toEqual(Array(5).fill("green"));
  await expect(page.getByTestId("end-panel")).toContainText("You got it in 2!");
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.getByTestId("end-panel")).toHaveCount(0);
  await expect(page.locator('[data-row="0"] [data-state="empty"]')).toHaveCount(5);
});

test("lose: six wrong guesses reveal the answer", async ({ page }) => {
  await open(page);
  for (const word of WRONG) await guessAccepted(page, word);
  await expect(page.getByTestId("end-panel")).toContainText("Out of guesses.");
  await expect(page.getByTestId("end-panel")).toContainText(/crane/i);
});

test("invalid word keeps the row editable and consumes no guess", async ({ page }) => {
  await open(page);
  await guess(page, "zzzzz");
  await expect(page.getByRole("status")).toHaveText("Not in word list");
  for (let i = 0; i < 5; i++) await page.keyboard.press("Backspace");
  for (const word of WRONG) await guessAccepted(page, word);
  // All six real guesses were still available, so the loss only happens after the sixth.
  await expect(page.getByTestId("end-panel")).toContainText("Out of guesses.");
  await expect(page.locator('[data-row="5"] [data-state="grey"], [data-row="5"] [data-state="yellow"], [data-row="5"] [data-state="green"]')).toHaveCount(5);
});

test("short guess shows a message and is not sent", async ({ page }) => {
  await open(page);
  await page.keyboard.type("cra");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Not enough letters");
});

test("on-screen keyboard types a guess and key colours update", async ({ page }) => {
  await open(page);
  for (const letter of "slate") await page.locator(`[data-key="${letter}"]`).click();
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.locator('[data-key="a"]')).toHaveAttribute("data-colour", "green");
  await expect(page.locator('[data-key="s"]')).toHaveAttribute("data-colour", "grey");
  await expect(page.locator('[data-key="q"]')).toHaveAttribute("data-colour", "none");
});

test("fairness: no frame before the game ends contains the answer", async ({ page }) => {
  const frames: string[] = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => frames.push(String(f.payload))));
  await open(page);
  for (const word of WRONG.slice(0, 5)) await guessAccepted(page, word);
  await expect.poll(() => frames.filter((f) => f.includes("guessResult")).length).toBe(5);
  expect(frames.join("\n")).not.toContain(ANSWER);
  await guess(page, WRONG[5]);
  await expect.poll(() => frames.some((f) => f.includes("soloEnd") && f.includes(ANSWER))).toBe(true);
});
