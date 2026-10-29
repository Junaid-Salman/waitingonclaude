import { expect, test, type Page } from "@playwright/test";
import { E2E_REVEAL_MS } from "../party/e2e/answers";
import { createRoom, joinRoom, newPlayer, typeGuess } from "./helpers";

// partykit.e2e.json: answers crane, slate, robot, moist, light; durations scaled by 0.01, so a
// 2 min round lasts 1.2 s and a 5 min round 3 s. The pause between rounds is 1.5 s.
const ANSWERS = ["crane", "slate", "robot", "moist", "light"];

const roundLabel = (page: Page) => page.getByTestId("round-label");

async function pickLength(host: Page, label: "2 min" | "3 min" | "5 min") {
  await host.getByRole("button", { name: label }).click();
  await expect(host.getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
}

async function startMatch(host: Page) {
  await host.getByRole("button", { name: "Start match" }).click();
}

const rankingRows = (page: Page) =>
  page.getByTestId("ranking-row").evaluateAll((rows) =>
    rows.map((row) => {
      const cells = [...row.querySelectorAll("td")];
      return {
        rank: row.getAttribute("data-rank"),
        name: cells[1].querySelector(".truncate")?.textContent ?? "",
        wins: cells[2].textContent ?? "",
        total: cells[3].textContent ?? "",
      };
    }),
  );

// Records every frame the page's PartyKit sockets receive (not Next's dev hot-reload socket).
function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    if (ws.url().includes("/parties/")) ws.on("framereceived", (f) => frames.push(String(f.payload)));
  });
  return frames;
}

test("a two-player match is ranked by rounds won", async ({ browser }) => {
  test.setTimeout(60_000);
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect(ali.getByTestId("player")).toHaveCount(2);
  await pickLength(ali, "5 min");
  await startMatch(ali);

  // Ali wins rounds 1-3 by solving first; Bo wins rounds 4-5.
  const winners = [ali, ali, ali, bo, bo];
  for (let round = 0; round < 5; round++) {
    const first = winners[round];
    const second = first === ali ? bo : ali;
    await expect(roundLabel(ali)).toHaveText(`Round ${round + 1} of 5`);
    await expect(roundLabel(bo)).toHaveText(`Round ${round + 1} of 5`);
    await typeGuess(first, ANSWERS[round]);
    await expect(second.getByTestId("opponent")).toContainText("Solved");
    await typeGuess(second, ANSWERS[round]);

    await expect(ali.getByTestId("round-summary")).toBeVisible();
    await expect(ali.getByTestId("round-answer")).toHaveText(ANSWERS[round]);
    await expect(ali.getByTestId("round-winner")).toHaveText(first === ali ? "You won the round." : "Bo won the round.");
    await expect(bo.getByTestId("round-winner")).toHaveText(first === bo ? "You won the round." : "Ali won the round.");
  }

  await expect(ali.getByTestId("match-summary")).toBeVisible();
  await expect(bo.getByTestId("match-summary")).toBeVisible();
  for (const page of [ali, bo]) {
    const rows = await rankingRows(page);
    expect(rows.map((r) => r.rank)).toEqual(["1", "2"]);
    expect(rows.map((r) => [r.name, r.wins])).toEqual([["Ali", "3"], ["Bo", "2"]]);
  }
});

test("equal rounds won are broken by total time", async ({ browser }) => {
  test.setTimeout(60_000);
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect(ali.getByTestId("player")).toHaveCount(2);
  await pickLength(ali, "5 min"); // 3 s rounds
  await startMatch(ali);

  // Round 1: only Ali solves, at once. Round 2: only Bo solves, 1.2 s in. Rounds 3-5: nobody.
  // Both win one round, so the lower total time decides: Ali's solve was much faster.
  await expect(roundLabel(ali)).toHaveText("Round 1 of 5");
  await typeGuess(ali, ANSWERS[0]);
  await expect(roundLabel(bo)).toHaveText("Round 2 of 5", { timeout: 10_000 });
  await bo.waitForTimeout(1200);
  await typeGuess(bo, ANSWERS[1]);

  await expect(ali.getByTestId("match-summary")).toBeVisible({ timeout: 30_000 });
  const rows = await rankingRows(ali);
  expect(rows.map((r) => [r.name, r.wins, r.rank])).toEqual([
    ["Ali", "1", "1"],
    ["Bo", "1", "2"],
  ]);
});

test("a match nobody plays ends in a shared first place, and a latecomer can join after Play again", async ({ browser }) => {
  test.setTimeout(60_000);
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect(ali.getByTestId("player")).toHaveCount(2);

  // Only the host can start or choose the round length.
  await expect(bo.getByRole("button", { name: "Start match" })).toHaveCount(0);
  await expect(bo.getByText("Waiting for the host to start the match.")).toBeVisible();
  await pickLength(ali, "2 min"); // 1.2 s rounds
  await startMatch(ali);
  await expect(roundLabel(bo)).toHaveText("Round 1 of 5");
  await expect(ali.getByRole("button", { name: "Start match" })).toHaveCount(0);

  // A third browser arrives mid-match and is turned away.
  const cy = await newPlayer(browser);
  await joinRoom(cy, code, "Cy");
  await expect(cy.getByRole("heading", { name: "Match in progress" })).toBeVisible();

  await expect(ali.getByTestId("match-summary")).toBeVisible({ timeout: 30_000 });
  const rows = await rankingRows(ali);
  expect(rows.map((r) => r.rank)).toEqual(["1", "1"]);
  expect(rows[0].total).toBe(rows[1].total); // identical total time: 5 x the limit
  expect(rows[0].total).toBe("0:06");

  // Only the host can send everyone back.
  await expect(bo.getByRole("button", { name: "Play again" })).toHaveCount(0);
  await expect(cy.getByRole("heading", { name: "Match in progress" })).toBeVisible(); // still blocked on results
  await ali.getByRole("button", { name: "Play again" }).click();
  await expect(ali.getByRole("heading", { name: `Room ${code}` })).toBeVisible();
  await expect(bo.getByRole("heading", { name: `Room ${code}` })).toBeVisible();

  await cy.getByRole("button", { name: "Try again" }).click();
  await expect(cy.getByRole("heading", { name: `Room ${code}` })).toBeVisible();
  await expect(ali.getByTestId("player")).toHaveCount(3);
});

test("a round ends early when everyone has solved, and no frame leaks the answer first", async ({ browser }) => {
  test.setTimeout(60_000);
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const aliFrames = recordFrames(ali);
  const boFrames = recordFrames(bo);
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect(ali.getByTestId("player")).toHaveCount(2);
  await pickLength(ali, "5 min"); // 3 s limit
  await startMatch(ali);

  await expect(roundLabel(bo)).toHaveText("Round 1 of 5");
  await typeGuess(bo, ANSWERS[1]); // a wrong word for round 1
  await typeGuess(ali, ANSWERS[0]); // Ali solves round 1
  await expect(bo.getByTestId("opponent")).toContainText("Solved");

  // Everything Bo has been sent so far is free of the answer.
  const beforeSolving = boFrames.slice();
  expect(beforeSolving.length).toBeGreaterThan(0);
  expect(beforeSolving.join("\n")).not.toContain(ANSWERS[0]);

  await typeGuess(bo, ANSWERS[0]); // now Bo solves too: round 1 ends at once
  await expect(ali.getByTestId("round-summary")).toBeVisible();

  const frame = (frames: string[], type: string) => frames.map((f) => JSON.parse(f)).find((m) => m.type === type && (m.round ?? 1) === 1);
  const start = frame(aliFrames, "roundStart");
  const end = frame(aliFrames, "roundEnd");
  expect(end.answer).toBe(ANSWERS[0]);
  // nextAt is the end of the reveal: the round must have ended over a second before endsAt.
  expect(end.nextAt - E2E_REVEAL_MS).toBeLessThan(start.endsAt - 1000);
  // The answer appears in the roundEnd frame (the scan is not vacuous).
  expect(aliFrames.some((f) => f.includes(`"type":"roundEnd"`) && f.includes(ANSWERS[0]))).toBe(true);
});

test("a player who leaves mid-match stays on the board as Left and in the final ranking", async ({ browser }) => {
  test.setTimeout(60_000);
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect(ali.getByTestId("player")).toHaveCount(2);
  await pickLength(ali, "2 min"); // 1.2 s rounds
  await startMatch(ali);
  await expect(roundLabel(ali)).toHaveText("Round 1 of 5");

  await bo.context().close();
  await expect(ali.getByTestId("opponent")).toContainText("Left");

  await expect(ali.getByTestId("match-summary")).toBeVisible({ timeout: 30_000 });
  const rows = await rankingRows(ali);
  expect(rows.map((r) => r.name).sort()).toEqual(["Ali", "Bo"]);
});

test("opponent boards never show letters", async ({ browser }) => {
  const ali = await newPlayer(browser);
  const bo = await newPlayer(browser);
  const code = await createRoom(ali, "Ali");
  await joinRoom(bo, code, "Bo");
  await expect(ali.getByTestId("player")).toHaveCount(2);
  await pickLength(ali, "5 min");
  await startMatch(ali);
  await expect(roundLabel(bo)).toHaveText("Round 1 of 5");

  await typeGuess(ali, ANSWERS[1]); // "slate": wrong for round 1
  const opponent = bo.getByTestId("opponent");
  await expect(opponent.locator('[data-state="green"], [data-state="yellow"], [data-state="grey"]')).toHaveCount(5);
  // The card holds the name and nothing else: no letters, no badge, no word.
  await expect(opponent).toHaveText("Ali");
});
