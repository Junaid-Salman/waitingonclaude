import { expect, test, type Page } from "@playwright/test";
import { E2E_SHORT_PASSAGES } from "../party/e2e/answers";
import { typePaced } from "./helpers";

const [FIRST, SECOND] = E2E_SHORT_PASSAGES;

// Starts a run and waits until typing is unlocked (the 3 s countdown is over).
async function startRun(page: Page) {
  await page.goto("/type-race/practice");
  await page.getByRole("button", { name: "Start typing" }).click();
  await expect(page.getByTestId("passage")).toHaveText(FIRST.text);
  await expect(page.getByTestId("typing-input")).toBeEnabled({ timeout: 8000 });
  await expect(page.getByTestId("typing-input")).toBeFocused();
}

test("type the fixed passage and see WPM, accuracy and time", async ({ page }) => {
  await startRun(page);
  await typePaced(page, FIRST.text);
  await expect(page.getByTestId("practice-results")).toBeVisible();
  await expect(page.getByTestId("result-accuracy")).toHaveText("100%");
  const wpm = Number(await page.getByTestId("result-wpm").textContent());
  expect(wpm).toBeGreaterThan(20);
  expect(wpm).toBeLessThan(250);
  await expect(page.getByTestId("result-time")).toHaveText(/^0:\d\d$/);
});

test("Next passage gives a different one", async ({ page }) => {
  await startRun(page);
  await typePaced(page, FIRST.text);
  await page.getByRole("button", { name: "Next passage" }).click();
  await expect(page.getByTestId("passage")).toHaveText(SECOND.text);
});

test("the input is locked during the countdown", async ({ page }) => {
  await page.goto("/type-race/practice");
  await page.getByRole("button", { name: "Start typing" }).click();
  await expect(page.getByTestId("countdown")).toBeVisible();
  await expect(page.getByTestId("typing-input")).toBeDisabled();
  await page.keyboard.type("The ");
  await expect(page.getByTestId("passage-done")).toHaveText("");
  await expect(page.getByTestId("typing-input")).toBeEnabled({ timeout: 8000 });
  await expect(page.getByTestId("countdown")).toHaveCount(0);
});

test("a typo blocks progress until it is fixed", async ({ page }) => {
  await startRun(page);
  const input = page.getByTestId("typing-input");
  await typePaced(page, "The quic");
  await expect(page.getByTestId("passage-done")).toHaveText("The ");
  await typePaced(page, "zk ");
  // "quick " would be done by now without the typo; the word stays open and shows the error.
  await expect(page.getByTestId("passage-done")).toHaveText("The ");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("passage-wrong")).toHaveText("k");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
  await expect(input).toHaveAttribute("aria-invalid", "false");
  await typePaced(page, "k ");
  await expect(page.getByTestId("passage-done")).toHaveText("The quick ");
});

test("the 6th character after an error is ignored", async ({ page }) => {
  await startRun(page);
  const input = page.getByTestId("typing-input");
  await typePaced(page, "xyyyyy"); // the error plus 5 more
  await expect(input).toHaveValue("xyyyyy");
  await typePaced(page, "zzz");
  await expect(input).toHaveValue("xyyyyy");
  await page.keyboard.press("Backspace");
  await expect(input).toHaveValue("xyyyy");
});

test("paste does nothing", async ({ page }) => {
  await startRun(page);
  const input = page.getByTestId("typing-input");
  // A multi-character insert (what a paste or an autocomplete produces) is cancelled.
  await page.keyboard.insertText("The quick brown ");
  await expect(input).toHaveValue("");
  await expect(page.getByTestId("passage-done")).toHaveText("");
  // A paste event is cancelled too.
  const pasted = await input.evaluate((el) => {
    const data = new DataTransfer();
    data.setData("text/plain", "The quick ");
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(pasted).toBe(true);
  await expect(input).toHaveValue("");
  await expect(page.getByTestId("live-accuracy")).toHaveText("100%");
});

test("focus returns when typing after tabbing away, and that key is not typed", async ({ page }) => {
  await startRun(page);
  const input = page.getByTestId("typing-input");
  await page.keyboard.press("Tab"); // Tab is not blocked
  await expect(input).not.toBeFocused();
  await page.keyboard.press("T");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
  await typePaced(page, FIRST.text);
  await expect(page.getByTestId("practice-results")).toBeVisible();
});

test("Esc does nothing during a run", async ({ page }) => {
  await startRun(page);
  await typePaced(page, "The ");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("typing-input")).toBeFocused();
  await expect(page.getByTestId("passage-done")).toHaveText("The ");
});

test("a server that can't be reached shows Retry", async ({ page }) => {
  await page.route("**/parties/type-race-solo/passage**", (route) => route.abort());
  await page.goto("/type-race/practice");
  await page.getByRole("button", { name: "Start typing" }).click();
  await expect(page.getByText("Can't reach the game server.")).toBeVisible();
  await page.unroute("**/parties/type-race-solo/passage**");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("passage")).toHaveText(FIRST.text);
});

test("the desktop notice is hidden on a computer", async ({ page }) => {
  await page.goto("/type-race/practice");
  await expect(page.getByRole("heading", { name: "Practice", level: 1 })).toBeVisible();
  await expect(page.getByTestId("desktop-notice")).toBeHidden();
});

test("passage length is remembered for the tab", async ({ page }) => {
  await page.goto("/type-race/practice");
  await page.getByRole("button", { name: "Medium" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Medium" })).toHaveAttribute("aria-pressed", "true");
});
