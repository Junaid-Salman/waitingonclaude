import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { E2E_GRACE_MS } from "../party/e2e/answers";
import { RECONNECT_GRACE_MS } from "../shared/protocol";
import { createRoom, joinRoom, newPlayer, playerNames, typeGuess } from "./helpers";

// Reconnect grace is 5 s in e2e (party/e2e/answers.ts). The default 3 min round lasts 20 s there,
// long enough to refresh a page mid-round; 2 min rounds last 1.2 s.

const roundLabel = (page: Page) => page.getByTestId("round-label");
const rowStates = (page: Page, row: number) =>
  page.locator(`[data-row="${row}"] [data-state]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-state")));
const rowLetters = (page: Page, row: number) =>
  page.locator(`[data-row="${row}"] [data-state]`).evaluateAll((els) => els.map((e) => (e.textContent ?? "").toLowerCase()).join(""));

function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    if (ws.url().includes("/parties/")) ws.on("framereceived", (f) => frames.push(String(f.payload)));
  });
  return frames;
}

async function startedMatch(browser: Parameters<typeof newPlayer>[0], length?: "2 min" | "5 min") {
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect(ali.getByTestId("player")).toHaveCount(2);
  if (length) await ali.getByRole("button", { name: length }).click();
  await ali.getByRole("button", { name: "Start match" }).click();
  await expect(roundLabel(ali)).toHaveText("Round 1 of 5");
  await expect(roundLabel(bo)).toHaveText("Round 1 of 5");
  return { ali, bo, code };
}

test("a refresh mid-round restores own letters and colours, the timer and the opponent's colours, and leaks no answer", async ({ browser }) => {
  const { ali, bo } = await startedMatch(browser);
  await typeGuess(ali, "slate");
  await expect.poll(() => rowStates(ali, 0)).toEqual(["grey", "grey", "green", "grey", "green"]);
  await typeGuess(bo, "robot");
  await expect(ali.getByTestId("opponent").locator('[data-state="grey"]').first()).toBeVisible();

  const frames = recordFrames(ali);
  await ali.reload();
  await expect(roundLabel(ali)).toHaveText("Round 1 of 5");
  await expect.poll(() => rowLetters(ali, 0)).toBe("slate");
  await expect.poll(() => rowStates(ali, 0)).toEqual(["grey", "grey", "green", "grey", "green"]);
  await expect(ali.getByTestId("opponent").locator('[data-state="grey"], [data-state="yellow"], [data-state="green"]')).toHaveCount(5);
  await expect(ali.getByTestId("round-timer")).not.toHaveText("0:00");
  // The board is playable again after the refresh.
  await typeGuess(ali, "crane");
  await expect(ali.getByTestId("round-summary")).toBeHidden(); // Bo is still playing
  await expect.poll(() => rowStates(ali, 1)).toEqual(Array(5).fill("green"));

  const snapshot = frames.find((f) => f.includes('"type":"matchSnapshot"'));
  expect(snapshot).toBeDefined();
  expect(snapshot).not.toContain("crane"); // round 1's answer
  expect(snapshot).not.toContain("robot"); // Bo's letters
});

test("a refresh on the results screen lands back on the results", async ({ browser }) => {
  test.setTimeout(60_000);
  const { ali } = await startedMatch(browser, "2 min");
  await expect(ali.getByTestId("match-summary")).toBeVisible({ timeout: 30_000 });
  await ali.reload();
  await expect(ali.getByTestId("match-summary")).toBeVisible();
  await expect(ali.getByTestId("ranking-row")).toHaveCount(2);
});

test("a player who drops holds the round open for the grace, then is Left and the round ends early", async ({ browser }) => {
  const { ali, bo } = await startedMatch(browser);
  await bo.context().close();
  await expect(ali.getByTestId("opponent")).toContainText("Reconnecting…");
  // Only the colours dim for an away player; the name and the status keep full contrast (M4).
  const card = ali.getByTestId("opponent");
  expect(await card.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  expect(await card.locator('[aria-hidden="true"]').first().evaluate((e) => getComputedStyle(e).opacity)).toBe("0.6");
  // Ali is told of the drop when the server starts Bo's grace: time the check from here, not from
  // the close, so a slow machine cannot eat the margin.
  const graceSeenAt = Date.now();

  await typeGuess(ali, "crane");
  await expect.poll(() => rowStates(ali, 0)).toEqual(Array(5).fill("green"));
  // Bo still counts as playing while their seat is held, so the round does not end yet. Checked
  // 2 s before the grace can run out.
  const wait = graceSeenAt + E2E_GRACE_MS - 2000 - Date.now();
  if (wait > 0) await ali.waitForTimeout(wait);
  await expect(ali.getByTestId("round-summary")).toBeHidden();
  // Once the seat is removed, everyone left is done: the round ends long before its 20 s limit.
  await expect(ali.getByTestId("round-summary")).toBeVisible({ timeout: E2E_GRACE_MS + 5000 });
  await expect(ali.getByTestId("round-winner")).toContainText("You won the round.");
});

test("after the grace runs out, the same tab is turned away until the match ends", async ({ browser }) => {
  const { bo, code } = await startedMatch(browser);
  await bo.goto("about:blank"); // the socket closes; sessionStorage stays with the tab
  await bo.waitForTimeout(E2E_GRACE_MS + 1500);
  await bo.goto(`/woordle/room/${code}`);
  await expect(bo.getByRole("heading", { name: "Match in progress" })).toBeVisible();
});

test("coming back inside the grace keeps the seat: no Left, no new player", async ({ browser }) => {
  const { ali, bo, code } = await startedMatch(browser);
  await bo.goto("about:blank");
  await expect(ali.getByTestId("opponent")).toContainText("Reconnecting…");
  await bo.goto(`/woordle/room/${code}`);
  await expect(roundLabel(bo)).toHaveText("Round 1 of 5");
  await expect(ali.getByTestId("opponent")).not.toContainText("Reconnecting…");
  await expect(ali.getByTestId("opponent")).toHaveCount(1);
});

test("the server limits a player to 2 guesses a second, end to end", async ({ browser }) => {
  const { ali, code } = await startedMatch(browser);
  // A raw socket with Ali's own id takes the seat over and sends 10 guesses at once, faster than
  // the UI ever could (it waits for each answer).
  const replies = await ali.evaluate(async (room) => {
    const playerId = sessionStorage.getItem("woc:playerId")!;
    const ws = new WebSocket(`ws://localhost:1999/parties/main/${room}`);
    const got: { type: string; reason?: string }[] = [];
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));
    ws.addEventListener("message", (e) => got.push(JSON.parse(String(e.data))));
    ws.send(JSON.stringify({ type: "join", playerId, name: "Ali" }));
    await new Promise((r) => setTimeout(r, 300));
    for (const word of ["slate", "robot", "moist", "light", "about", "above", "adore", "after", "again", "agent"]) {
      ws.send(JSON.stringify({ type: "guess", word }));
    }
    await new Promise((r) => setTimeout(r, 500));
    ws.close();
    return got.filter((m) => m.type === "guessResult" || m.type === "guessRejected");
  }, code);
  expect(replies.filter((m) => m.type === "guessResult")).toHaveLength(2);
  expect(replies.filter((m) => m.reason === "rate-limited")).toHaveLength(8);
});

test("with motion on, a guess still flips into the right colours", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "no-preference" })).newPage();
  await page.goto("/woordle/solo");
  await expect(page.getByRole("status")).toHaveText("");
  await page.keyboard.type("slate");
  await page.keyboard.press("Enter");
  await expect.poll(() => rowStates(page, 0)).toEqual(["grey", "grey", "green", "grey", "green"]);
  // The flip ends upright: no tile is left turned on its edge.
  await expect
    .poll(() => page.locator('[data-row="0"] [data-state]').evaluateAll((els) => els.map((e) => getComputedStyle(e).transform)))
    .toEqual(Array(5).fill("none"));
  await page.context().close();
});

test("while reconnecting, host controls are disabled and Leave still leaves; the seat frees at the grace", async ({ browser }) => {
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  // Ali's room socket runs through a proxy the test can cut, as a network drop would. Once cut,
  // every reconnect attempt is refused, so Ali stays in "Reconnecting…".
  let cut = false;
  const links: { page: WebSocketRoute; server: WebSocketRoute }[] = [];
  await ali.routeWebSocket(/\/parties\/main\//, (ws) => {
    if (cut) return void ws.close();
    links.push({ page: ws, server: ws.connectToServer() });
  });
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect.poll(() => playerNames(ali)).toEqual(["Ali", "Bo"]);

  cut = true;
  for (const link of links) {
    await link.server.close();
    await link.page.close();
  }
  await expect(ali.getByTestId("connection-status")).toContainText("Reconnecting…");
  // Checked at once: the e2e grace is only 5 s, so the held seat must be seen before Ali's steps.
  await expect(bo.getByTestId("player").filter({ hasText: "Ali" })).toContainText("Reconnecting…");
  await expect(ali.getByRole("button", { name: "Start match" })).toBeDisabled();
  await expect(ali.getByRole("button", { name: "5 min" })).toBeDisabled();
  await expect(ali.getByTestId("leave-hint")).toHaveText(`Your seat frees about ${RECONNECT_GRACE_MS / 1000} s after the drop.`);

  await ali.getByRole("button", { name: "Leave room" }).click();
  await ali.waitForURL(/\/woordle$/);
  // The leave never reached the server, so the seat frees only at the end of the grace.
  await expect.poll(() => playerNames(bo), { timeout: E2E_GRACE_MS + 10_000 }).toEqual(["Bo"]);
  await expect(bo.getByTestId("player")).toContainText("Host");
  // And the tab forgot the room: going back asks for a name again instead of walking in.
  await ali.goto(`/woordle/room/${code}`);
  await expect(ali.getByLabel("Your name")).toBeVisible();
});

test("mid-match, leaving asks first: Stay and Escape keep the seat, Leave match frees it at once (Q13)", async ({ browser }) => {
  const { ali, bo } = await startedMatch(browser); // the default round lasts 20 s in e2e
  const dialog = bo.getByRole("dialog", { name: "Leave the match?" });

  // Enter on the focused button opens the dialog: the board does not swallow it (M1).
  await bo.getByRole("button", { name: "Leave room" }).focus();
  await bo.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Stay" })).toBeFocused();
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(dialog).toBeHidden();
  await expect(roundLabel(bo)).toHaveText("Round 1 of 5");
  // Focus is back on Leave room, and typing still reaches the board (N1).
  await bo.keyboard.type("cr");
  await expect(bo.locator('[data-row="0"] [data-state="typed"]')).toHaveCount(2);

  await bo.getByRole("button", { name: "Leave room" }).click();
  await expect(dialog).toBeVisible();
  // Keys pressed while the dialog is open never reach the board behind it, even with focus off
  // its buttons (N2).
  await dialog.getByText("You'll lose your seat").click();
  // Some browsers drop focus to <body> on such a click; force that case, the one the guard is for.
  await bo.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await bo.keyboard.type("an");
  await bo.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(bo.locator('[data-row="0"] [data-state="typed"]')).toHaveCount(2);
  await bo.getByRole("button", { name: "Leave room" }).click();
  await expect(dialog).toBeVisible();
  await bo.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(ali.getByTestId("opponent")).not.toContainText("Left");

  // The logo is a way out too, so it asks the same question.
  await bo.getByRole("link", { name: "WaitingOnClaude home" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Leave match" }).click();
  await bo.waitForURL(/\/$/);
  // Freed at once: well inside the 5 s grace a plain drop would hold the seat for.
  await expect(ali.getByTestId("opponent")).toContainText("Left", { timeout: 3000 });
});

for (const width of [320, 375]) test(`on a ${width} px phone, the Leave hint and the reconnecting line never overlap, and nothing scrolls sideways (M2, N4)`, async ({ browser }) => {
  const ali = await (await browser.newContext({ viewport: { width, height: 667 }, hasTouch: true, isMobile: true })).newPage();
  const bo = await newPlayer(browser);
  let cut = false;
  const links: { page: WebSocketRoute; server: WebSocketRoute }[] = [];
  await ali.routeWebSocket(/\/parties\/main\//, (ws) => {
    if (cut) return void ws.close();
    links.push({ page: ws, server: ws.connectToServer() });
  });
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect.poll(() => playerNames(ali)).toEqual(["Ali", "Bo"]);
  cut = true;
  for (const link of links) {
    await link.server.close();
    await link.page.close();
  }
  const hint = ali.getByTestId("leave-hint"), status = ali.getByTestId("connection-status");
  await expect(status).toContainText("Reconnecting…");
  await expect(hint).toBeVisible();
  const [a, b] = [await hint.boundingBox(), await status.boundingBox()];
  const overlap = a!.x < b!.x + b!.width && b!.x < a!.x + a!.width && a!.y < b!.y + b!.height && b!.y < a!.y + a!.height;
  expect(overlap).toBe(false);
  expect(await ali.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


// Next keeps pages you navigate away from mounted but hidden (cacheComponents / React Activity),
// so leaving and Back must not leave state behind.
test("Back while Leave the match? is open leaves no dialog behind: the next board still types", async ({ browser }) => {
  const { bo } = await startedMatch(browser);
  await bo.getByRole("button", { name: "Leave room" }).click();
  await expect(bo.getByRole("dialog", { name: "Leave the match?" })).toBeVisible();
  await bo.goBack();
  await bo.waitForURL(/\/woordle$/);
  await bo.getByRole("link", { name: "Play solo" }).click();
  await bo.waitForURL(/\/woordle\/solo$/);
  await expect(bo.getByRole("status")).toHaveText("");
  await bo.keyboard.type("cr");
  await expect(bo.locator('[data-row="0"] [data-state="typed"]')).toHaveCount(2);
});

test("after leaving, Back asks for a name instead of walking back in, and Leave works again", async ({ browser }) => {
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const code = await createRoom(ali, "Ali");
  await bo.goto("/woordle");
  await bo.goto(`/woordle/room/${code}`);
  await bo.getByLabel("Your name").fill("Bo");
  await bo.getByRole("button", { name: "Join" }).click();
  await expect.poll(() => playerNames(ali)).toEqual(["Ali", "Bo"]);
  await bo.getByRole("button", { name: "Leave room" }).click(); // lobby: no dialog
  await bo.waitForURL(/\/woordle$/);
  await expect.poll(() => playerNames(ali)).toEqual(["Ali"]);
  await bo.goBack();
  await bo.waitForURL(new RegExp(`/woordle/room/${code}$`));
  await expect(bo.getByLabel("Your name")).toHaveValue("Bo"); // asked, prefilled, not rejoined
  expect(await playerNames(ali)).toEqual(["Ali"]);
  await bo.getByRole("button", { name: "Join" }).click();
  await expect.poll(() => playerNames(ali)).toEqual(["Ali", "Bo"]);
  await bo.getByRole("button", { name: "Leave room" }).click();
  await bo.waitForURL(/\/woordle$/);
  await expect.poll(() => playerNames(ali)).toEqual(["Ali"]);
});
