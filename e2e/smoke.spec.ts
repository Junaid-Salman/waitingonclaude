import { expect, test } from "@playwright/test";

test("home page shows the title and the disclaimer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WaitingOnClaude" })).toBeVisible();
  await expect(
    page.getByText("Not affiliated with Anthropic or The New York Times."),
  ).toBeVisible();
});
