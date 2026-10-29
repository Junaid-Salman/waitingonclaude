import { expect, test } from "@playwright/test";
import { createRoom, enterName, joinRoom, newPlayer, playerNames } from "./helpers";

// Runs against partykit.e2e.json: the production room rules with fixed answers and short rounds.
const PARTY_WS = "ws://localhost:1999/parties/main";

test("create a room: the host lands in the lobby with a code and a Host badge", async ({ page }) => {
  const code = await createRoom(page, "Ali");
  await expect(page.getByRole("textbox", { name: "Room link" })).toHaveValue(new RegExp(`/woordle/room/${code}$`));
  await expect(page.getByTestId("player")).toHaveCount(1);
  await expect(page.getByTestId("player")).toContainText("Ali");
  await expect(page.getByTestId("player")).toContainText("Host");
  await expect(page.getByTestId("player")).toContainText("You");
});

test("two browsers join one room by link and see each other live", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createRoom(host, "Ali");

  await joinRoom(guest, code, "Bo");
  await expect(guest.getByRole("heading", { name: `Room ${code}` })).toBeVisible();

  // Neither page reloads: both lists update by themselves.
  await expect.poll(() => playerNames(host)).toEqual(["Ali", "Bo"]);
  await expect.poll(() => playerNames(guest)).toEqual(["Ali", "Bo"]);
  await expect(guest.getByTestId("player").nth(1)).toContainText("You");
  await expect(host.getByTestId("player").nth(1)).not.toContainText("You");
});

test("duplicate names are suffixed in join order", async ({ browser }) => {
  const host = await newPlayer(browser);
  const second = await newPlayer(browser);
  const third = await newPlayer(browser);
  const code = await createRoom(host, "Ali");
  await joinRoom(second, code, "Ali");
  await expect.poll(() => playerNames(host)).toEqual(["Ali", "Ali 2"]);
  await joinRoom(third, code, "ali");
  await expect.poll(() => playerNames(third)).toEqual(["Ali", "Ali 2", "ali 3"]);
});

test("the sixth player is rejected and does not keep reconnecting", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await createRoom(host, "P1");
  for (let i = 2; i <= 5; i++) {
    const player = await newPlayer(browser);
    await joinRoom(player, code, `P${i}`);
    await expect(player.getByRole("heading", { name: `Room ${code}` })).toBeVisible();
  }
  await expect(host.getByTestId("player")).toHaveCount(5);

  const sixth = await newPlayer(browser);
  const opened: number[] = [];
  const start = Date.now();
  sixth.on("websocket", () => opened.push(Date.now() - start));
  await joinRoom(sixth, code, "P6");
  await expect(sixth.getByRole("heading", { name: "Room is full" })).toBeVisible();
  await expect(sixth.getByText("This room already has 5 players.")).toBeVisible();

  // `next dev` mounts effects twice (Strict Mode), so up to two sockets open during the first
  // second. After the error is on screen the count must not grow: partysocket retries within about
  // five seconds if the client forgot to close it.
  const afterError = opened.length;
  expect(afterError).toBeLessThanOrEqual(2);
  await sixth.waitForTimeout(7000);
  expect(opened.length, `socket open times (ms): ${opened.join(", ")}`).toBe(afterError);
  await expect(host.getByTestId("player")).toHaveCount(5);
});

test("an unknown room shows not-found with a working Create room", async ({ page }) => {
  await page.goto("/woordle/room/WXYZ");
  await enterName(page, "Ali");
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
  await page.getByRole("button", { name: "Create room" }).click();
  await page.waitForURL(/\/woordle\/room\/[A-Z]{4}$/);
  await expect(page.getByLabel("Your name")).toBeVisible();
});

test("a malformed code is not-found straight away", async ({ page }) => {
  await page.goto("/woordle/room/ABC");
  await expect(page.getByRole("heading", { name: "Room not found" })).toBeVisible();
});

test("a lowercase link works", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createRoom(host, "Ali");
  await joinRoom(guest, code.toLowerCase(), "Bo");
  await expect.poll(() => playerNames(host)).toEqual(["Ali", "Bo"]);
});

test("a newcomer is turned away while a match is running", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await createRoom(host, "Ali");
  await host.getByRole("button", { name: "Start match" }).click();
  await expect(host.getByTestId("round-label")).toHaveText("Round 1 of 5");

  const late = await newPlayer(browser);
  await joinRoom(late, code, "Bo");
  await expect(late.getByRole("heading", { name: "Match in progress" })).toBeVisible();
  await expect(late.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("when the host leaves, host passes to the next player", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createRoom(host, "Ali");
  await joinRoom(guest, code, "Bo");
  await expect.poll(() => playerNames(guest)).toEqual(["Ali", "Bo"]);
  await expect(guest.getByRole("group", { name: "Round length" })).toHaveCount(0); // not host yet

  await host.context().close();
  await expect.poll(() => playerNames(guest)).toEqual(["Bo"]);
  await expect(guest.getByTestId("player")).toContainText("Host");
  await expect(guest.getByRole("group", { name: "Round length" })).toBeVisible();
});

test("the host's round length shows live to everyone else, read-only", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createRoom(host, "Ali");
  await joinRoom(guest, code, "Bo");
  await expect(guest.getByTestId("round-length")).toHaveText("3 min");

  await host.getByRole("button", { name: "5 min" }).click();
  await expect(host.getByRole("button", { name: "5 min" })).toHaveAttribute("aria-pressed", "true");
  await expect(guest.getByTestId("round-length")).toHaveText("5 min");
  await expect(guest.getByRole("button", { name: "5 min" })).toHaveCount(0);
});

test("a refresh keeps the player in the room without a duplicate seat or a name prompt", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const code = await createRoom(host, "Ali");
  await joinRoom(guest, code, "Bo");
  await expect.poll(() => playerNames(host)).toEqual(["Ali", "Bo"]);

  await guest.reload();
  await expect(guest.getByRole("heading", { name: `Room ${code}` })).toBeVisible();
  await expect(guest.getByLabel("Your name")).toHaveCount(0);
  await expect.poll(async () => (await playerNames(host)).sort()).toEqual(["Ali", "Bo"]);
  await expect.poll(async () => (await playerNames(guest)).sort()).toEqual(["Ali", "Bo"]);
});

test("the same player joining from a second connection takes the seat over", async ({ browser }) => {
  const host = await newPlayer(browser);
  const code = await createRoom(host, "Ali");
  const playerId = await host.evaluate(() => sessionStorage.getItem("woc:playerId"));
  expect(playerId).toBeTruthy();

  // Stays open long enough for the takeover to land.
  const ws = new WebSocket(`${PARTY_WS}/${code}`);
  await new Promise<void>((resolve) => (ws.onopen = () => resolve()));
  ws.send(JSON.stringify({ type: "join", playerId, name: "Ali" }));

  await expect(host.getByRole("heading", { name: "Opened in another tab" })).toBeVisible();
  await host.getByRole("button", { name: "Use this tab" }).click();
  await expect(host.getByRole("heading", { name: `Room ${code}` })).toBeVisible();
  await expect(host.getByTestId("player")).toHaveCount(1);
  ws.close();
});

test("the room page never exposes a player's secret id to other players", async ({ browser }) => {
  const host = await newPlayer(browser);
  const guest = await newPlayer(browser);
  const frames: string[] = [];
  guest.on("websocket", (ws) => ws.on("framereceived", (f) => frames.push(String(f.payload))));
  const code = await createRoom(host, "Ali");
  const hostSecret = await host.evaluate(() => sessionStorage.getItem("woc:playerId"));
  await joinRoom(guest, code, "Bo");
  await expect.poll(() => playerNames(guest)).toEqual(["Ali", "Bo"]);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.join("\n")).not.toContain(hostSecret!);
});
