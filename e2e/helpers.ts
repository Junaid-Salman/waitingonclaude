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

// The server accepts at most 2 guesses per second per player and answers faster ones with
// "Slow down". Tests type far faster than people, so each page spaces the moment it submits: the
// gap is measured between Enter presses (not between typing starts, whose delay varies). 600 ms
// makes any three submits span 1.2 s, so a first frame can be 200 ms late on the way to the server
// before two of three share a server-side second.
const SUBMIT_GAP_MS = 600;
const lastSubmitAt = new WeakMap<Page, number>();
export async function submitPaced(page: Page) {
  const wait = (lastSubmitAt.get(page) ?? 0) + SUBMIT_GAP_MS - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  await page.keyboard.press("Enter");
  lastSubmitAt.set(page, Date.now());
}

// Types a word on the physical keyboard and submits it.
export async function typeGuess(page: Page, word: string) {
  await page.keyboard.type(word);
  await submitPaced(page);
}

// Types text on the physical keyboard at a human-ish pace for Type Race. 70 ms per key is about 170
// WPM, under the 250 WPM cap the race server will enforce in 8.2, and slow enough that the page
// keeps up on a loaded machine.
export async function typePaced(page: Page, text: string, delayMs = 70) {
  await page.keyboard.type(text, { delay: delayMs });
}
