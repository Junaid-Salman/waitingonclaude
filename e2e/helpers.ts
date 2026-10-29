import { expect, type Browser, type Page } from "@playwright/test";

export async function newPlayer(browser: Browser): Promise<Page> {
  // A separate context has its own sessionStorage, so it is a separate player.
  return (await browser.newContext()).newPage();
}

export async function enterName(page: Page, name: string) {
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Join" }).click();
}

export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto("/woordle");
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/woordle\/room\/[A-Z]{4}$/);
  const code = page.url().split("/").pop()!;
  await enterName(page, name);
  await expect(page.getByRole("heading", { name: `Room ${code}` })).toBeVisible();
  return code;
}

export async function joinRoom(page: Page, code: string, name: string) {
  await page.goto(`/woordle/room/${code}`);
  await enterName(page, name);
}

export const playerNames = (page: Page) => page.getByTestId("player").locator("span.min-w-0").allTextContents();

// Types a word on the physical keyboard and submits it.
export async function typeGuess(page: Page, word: string) {
  await page.keyboard.type(word);
  await page.keyboard.press("Enter");
}
