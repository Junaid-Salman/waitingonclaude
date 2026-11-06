import { expect, test, type Page } from "@playwright/test";
import { createRoom } from "./helpers";

// Phone widths. Chromium only (owner decision); iOS Safari is the owner's manual pass.
const PHONES = [
  { name: "320 wide", width: 320, height: 568 },
  { name: "375 wide", width: 375, height: 667 },
  { name: "414 wide", width: 414, height: 896 },
];

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const phone of PHONES) {
  test.describe(phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height }, hasTouch: true, isMobile: true });

    test("no page scrolls sideways", async ({ page }) => {
      for (const path of ["/", "/woordle", "/woordle/solo", "/woordle/challenge/new", "/type-race", "/type-race/practice"]) {
        await page.goto(path);
        expect(await noSideScroll(page), path).toBe(true);
      }
    });

    test("solo: every key is at least 44 px tall and a tap types a letter", async ({ page }) => {
      await page.goto("/woordle/solo");
      await expect(page.getByRole("status")).toHaveText("");
      const heights = await page.locator('[aria-label="Keyboard"] button').evaluateAll((keys) => keys.map((k) => k.getBoundingClientRect().height));
      expect(heights.length).toBe(28);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
      await expect(async () => {
        await page.locator('[data-key="c"]').tap();
        await expect(page.locator('[data-row="0"] [data-state="typed"]')).toHaveCount(1, { timeout: 1000 });
      }).toPass({ timeout: 10_000 });
    });

    test("solo: the board and the keyboard fit on screen without scrolling", async ({ page }) => {
      await page.goto("/woordle/solo");
      await expect(page.getByRole("status")).toHaveText("");
      const bottom = await page.locator('[aria-label="Keyboard"]').evaluate((k) => k.getBoundingClientRect().bottom);
      expect(bottom).toBeLessThanOrEqual(phone.height);
    });

    test("type race practice: the best-on-desktop notice is visible", async ({ page }) => {
      await page.goto("/type-race/practice");
      await expect(page.getByTestId("desktop-notice")).toBeVisible();
      await expect(page.getByTestId("desktop-notice")).toContainText("computer with a keyboard");
      expect(await noSideScroll(page)).toBe(true);
    });

    test("lobby and match fit the width", async ({ page }) => {
      await createRoom(page, "A very long player name");
      expect(await noSideScroll(page)).toBe(true);
      await page.getByRole("button", { name: "Start match" }).click();
      await expect(page.getByTestId("round-label")).toHaveText("Round 1 of 5");
      expect(await noSideScroll(page)).toBe(true);
    });
  });
}

// A phone on its side: about 375 px of height. Below the height cap's floor the board stays at
// 12rem (tiles about 36 px) and the page scrolls down instead of the board vanishing.
test.describe("667 x 375 landscape", () => {
  test.use({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true });

  test("solo: the board keeps a readable size and nothing scrolls sideways", async ({ page }) => {
    await page.goto("/woordle/solo");
    await expect(page.getByRole("status")).toHaveText("");
    const width = await page.getByRole("group", { name: "Guesses" }).evaluate((g) => g.getBoundingClientRect().width);
    const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    expect(width).toBeGreaterThanOrEqual(12 * rem - 0.5);
    expect(await noSideScroll(page)).toBe(true);
  });
});
