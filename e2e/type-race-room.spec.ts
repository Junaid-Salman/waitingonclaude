import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_RACE_PASSAGES } from "../party/e2e/answers";
import { createTypeRaceRoom, enterName, joinTypeRaceRoom, newPlayer, typePaced } from "./helpers";

const [P1, P2, P3] = E2E_RACE_PASSAGES;

// Records every frame a page receives from the Type Race party (not Next's dev socket).
function recordFrames(page: Page) {
  const frames: Record<string, unknown>[] = [];
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/parties/type-race/")) return;
    ws.on("framereceived", (f) => {
      try {
        frames.push(JSON.parse(String(f.payload)));
      } catch {
        // not JSON
      }
    });
  });
  return frames;
}

const input = (page: Page) => page.getByTestId("typing-input");

// Waits for the countdown to end: typing is unlocked and focused.
async function untilRacing(page: Page) {
  await expect(input(page)).toBeEnabled({ timeout: 10_000 });
  await expect(input(page)).toBeFocused();
}

async function twoPlayers(browser: Browser, settings: { races?: string; length?: string } = {}) {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const hostFrames = recordFrames(host);
  const guestFrames = recordFrames(guest);
  const code = await createTypeRaceRoom(host, "Ali");
  await joinTypeRaceRoom(guest, code, "Bo");
  await expect(host.getByTestId("player")).toHaveCount(2);
  await host.getByRole("button", { name: settings.races ?? "3 races" }).click();
  if (settings.length) await host.getByRole("button", { name: settings.length }).click();
  await expect(guest.getByTestId("races-setting")).toHaveText(settings.races ?? "3 races");
  return { host, guest, code, hostFrames, guestFrames };
}

const startMatch = async (host: Page) => host.getByRole("button", { name: "Start match" }).click();
const rows = (page: Page) => page.getByTestId("result-row");
const rowFor = (page: Page, name: string) => page.locator(`[data-testid="result-row"][data-player="${name}"]`);

test("two players race: finish order, points, one shared start time, and no playerId on the wire", async ({ browser }) => {
  const { host, guest, hostFrames, guestFrames } = await twoPlayers(browser);
  const hostSecret = await host.evaluate(() => sessionStorage.getItem("woc:playerId"));
  const guestSecret = await guest.evaluate(() => sessionStorage.getItem("woc:playerId"));
  await startMatch(host);
  await expect(host.getByTestId("race-label")).toHaveText("Race 1 of 3");
  await expect(guest.getByTestId("race-label")).toHaveText("Race 1 of 3");
  await expect(host.getByTestId("passage")).toHaveText(P1.text);
  await expect(input(host)).toBeDisabled(); // locked during the countdown

  await untilRacing(host);
  await untilRacing(guest);
  await typePaced(host, P1.text);
  await expect(host.getByTestId("finished-note")).toBeVisible();
  // Bo is still typing: Ali's lane shows the #1 badge on both screens.
  await expect(guest.locator('[data-testid="race-lane"][data-player="Ali"] [data-testid="finish-badge"]')).toHaveText("#1");
  await typePaced(guest, P1.text);

  for (const page of [host, guest]) {
    await expect(page.getByTestId("race-results")).toBeVisible();
    await expect(rows(page)).toHaveCount(2);
    await expect(rowFor(page, "Ali")).toHaveAttribute("data-points", "5");
    await expect(rowFor(page, "Ali")).toHaveAttribute("data-place", "1");
    await expect(rowFor(page, "Bo")).toHaveAttribute("data-points", "4");
    await expect(rowFor(page, "Bo")).toHaveAttribute("data-place", "2");
  }

  // Both clients were told the same start moment.
  const startAts = (frames: Record<string, unknown>[]) => frames.filter((f) => f.type === "raceStart").map((f) => f.startAt);
  expect(startAts(hostFrames)[0]).toBeDefined();
  expect(startAts(hostFrames)[0]).toBe(startAts(guestFrames)[0]);

  // Nothing on the wire carries a player's secret id.
  const wire = JSON.stringify([hostFrames, guestFrames]);
  expect(hostSecret).toBeTruthy();
  expect(wire).not.toContain(hostSecret!);
  expect(wire).not.toContain(guestSecret!);
  // And the next race's passage was not sent before its countdown.
  expect(wire).not.toContain(P2.text);
});

test("one player finishes and the other times out: 0 points, ranked below", async ({ browser }) => {
  const { host, guest } = await twoPlayers(browser, { length: "Medium" }); // medium races last 3 s in e2e
  await startMatch(host);
  await untilRacing(host);
  await typePaced(host, P1.text, 45);
  for (const page of [host, guest]) {
    await expect(page.getByTestId("race-results")).toBeVisible({ timeout: 10_000 });
    await expect(rowFor(page, "Ali")).toHaveAttribute("data-points", "5");
    await expect(rowFor(page, "Bo")).toHaveAttribute("data-points", "0");
    await expect(rowFor(page, "Bo")).toHaveAttribute("data-place", "none");
    await expect(rowFor(page, "Bo")).toContainText("DNF");
    expect(await rows(page).first().getAttribute("data-player")).toBe("Ali");
  }
});

test("refresh mid-race restores the word index and the lane", async ({ browser }) => {
  const { host } = await twoPlayers(browser);
  await startMatch(host);
  await untilRacing(host);
  await typePaced(host, "The red ");
  await expect(host.getByTestId("passage-done")).toHaveText("The red ");
  await host.waitForTimeout(1200); // the 400 ms progress sender has flushed
  await host.reload();
  await expect(host.getByTestId("race-label")).toHaveText("Race 1 of 3");
  await expect(host.getByTestId("passage-done")).toHaveText("The red ");
  await expect(host.locator('[data-testid="race-lane"][data-player="Ali"]')).not.toHaveAttribute("data-share", "0");
  await untilRacing(host);
  await typePaced(host, P1.text.slice("The red ".length));
  await expect(host.getByTestId("finished-note")).toBeVisible();
});

test("leaving mid-race is a DNF for the leaver and the race goes on", async ({ browser }) => {
  const { host, guest } = await twoPlayers(browser);
  await startMatch(host);
  await untilRacing(host);
  await untilRacing(guest);
  await typePaced(guest, "The red ");
  await guest.getByRole("button", { name: "Leave room" }).click();
  await guest.getByRole("button", { name: "Leave match" }).click(); // mid-race asks first
  await expect(guest).toHaveURL(/\/type-race$/);
  await typePaced(host, P1.text);
  await expect(host.getByTestId("race-results")).toBeVisible();
  await expect(rowFor(host, "Bo")).toContainText("DNF");
  await expect(rowFor(host, "Bo")).toHaveAttribute("data-points", "0");
  await expect(rowFor(host, "Ali")).toHaveAttribute("data-points", "5");
});

test("a late joiner is told the match is running", async ({ browser }) => {
  const { host, code } = await twoPlayers(browser);
  await startMatch(host);
  await expect(host.getByTestId("race-label")).toBeVisible();
  const late = await newPlayer(browser);
  await joinTypeRaceRoom(late, code, "Cy");
  await expect(late.getByRole("heading", { name: "Match in progress" })).toBeVisible();
});

test("match end: standings, then Play again returns to the lobby", async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await newPlayer(browser);
  await createTypeRaceRoom(host, "Ali");
  await host.getByRole("button", { name: "3 races" }).click();
  await startMatch(host);
  for (const passage of [P1, P2, P3]) {
    await expect(host.getByTestId("passage")).toHaveText(passage.text);
    await untilRacing(host);
    await typePaced(host, passage.text);
    await expect(host.getByTestId("race-results")).toBeVisible();
  }
  await expect(host.getByTestId("match-standings")).toBeVisible({ timeout: 15_000 });
  const row = host.getByTestId("standing-row");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-points", "15");
  await expect(row).toHaveAttribute("data-rank", "1");
  await host.getByRole("button", { name: "Play again" }).click();
  await expect(host.getByRole("heading", { name: /^Room [A-Z]{4}$/ })).toBeVisible();
  await expect(host.getByRole("button", { name: "3 races" })).toHaveAttribute("aria-pressed", "true"); // settings kept
});

test("leave, Back, leave again works (the page is kept alive, DI-1)", async ({ browser }) => {
  const { host, guest, code } = await twoPlayers(browser);
  await guest.getByRole("button", { name: "Leave room" }).click();
  await expect(guest).toHaveURL(/\/type-race$/);
  await expect(host.getByTestId("player")).toHaveCount(1);
  await guest.goBack();
  // Back asks for a name instead of walking back in.
  await expect(guest.getByRole("heading", { name: `Join room ${code}` })).toBeVisible();
  await expect(guest.getByLabel("Your name")).toHaveValue("Bo");
  await expect(host.getByTestId("player")).toHaveCount(1);
  await enterName(guest, "Bo");
  await expect(host.getByTestId("player")).toHaveCount(2);
  await guest.getByRole("button", { name: "Leave room" }).click();
  await expect(guest).toHaveURL(/\/type-race$/);
  await expect(host.getByTestId("player")).toHaveCount(1);
});

test("Create room on a Type Race page makes a Type Race room, and a Woordle code is unknown there", async ({ page }) => {
  await page.goto("/type-race/room/ZZZZ");
  await expect(page.getByLabel("Your name")).toBeVisible();
  await enterName(page, "Ali");
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/type-race\/room\/[A-Z]{4}$/);
});
