import { expect, test, type Browser, type Page } from "@playwright/test";
import { newPlayer } from "./helpers";

// partykit.e2e.json shrinks challenge round limits to 1% (a 5 min round lasts 3 s, a 1 min round
// 0.6 s) and holds the reveal for 1.5 s. Any word from the guess list works as a challenge word.
const WORDS = ["crane", "slate", "robot", "moist", "light"];

async function fillWords(page: Page, words: string[]) {
  for (const [i, word] of words.entries()) {
    await page.getByTestId(`word-${i}`).fill(word);
    await page.keyboard.press("Tab"); // blur runs the server check
  }
}

async function makeLink(browser: Browser, words: string[], limit: "1 min" | "5 min"): Promise<string> {
  const creator = await newPlayer(browser);
  await creator.goto("/woordle/challenge/new");
  await fillWords(creator, words);
  await creator.getByRole("button", { name: limit }).click();
  const create = creator.getByRole("button", { name: "Create link" });
  await expect(create).toBeEnabled();
  await create.click();
  const link = await creator.getByTestId("challenge-link").inputValue();
  await creator.context().close();
  return link;
}

// Records every frame the page's PartyKit sockets receive (not Next's dev hot-reload socket).
function recordFrames(page: Page): { frames: string[]; sockets: () => number } {
  const frames: string[] = [];
  let sockets = 0;
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/parties/")) return;
    sockets++;
    ws.on("framereceived", (f) => frames.push(String(f.payload)));
  });
  return { frames, sockets: () => sockets };
}

// A click before React hydrates does nothing, and under load hydration can lag the page load. So
// retry the click until Start is no longer an enabled button; a second Start while connecting is
// ignored by the app, so retrying cannot start two runs.
async function pressStart(page: Page) {
  const enabledStart = page.getByRole("button", { name: "Start" }).and(page.locator(":enabled"));
  await expect(async () => {
    await enabledStart.click({ timeout: 1000 });
    await expect(enabledStart).toHaveCount(0, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

async function solveRound(page: Page, round: number, word: string) {
  await expect(page.getByTestId("round-label")).toHaveText(`Word ${round} of 5`);
  await page.keyboard.type(word);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("round-summary")).toBeVisible();
  await expect(page.getByTestId("round-answer")).toHaveText(new RegExp(word, "i"));
}

test("the Woordle page links to the creator", async ({ page }) => {
  await page.goto("/woordle");
  await page.getByRole("link", { name: "Make a challenge" }).click();
  // The first visit compiles the route on the dev server, which can be slow under load.
  await expect(page).toHaveURL(/\/woordle\/challenge\/new$/, { timeout: 15_000 });
});

test("create a challenge, solve it from the link, read the summary, and play again", async ({ browser }) => {
  test.setTimeout(90_000);
  const link = await makeLink(browser, WORDS, "5 min");

  // The link hides the words, and fits the 200 character limit even with the longer fallback host.
  for (const word of WORDS) expect(link.toLowerCase()).not.toContain(word);
  const token = link.split("/").pop()!;
  expect(`https://waitingonclaude-game.vercel.app/woordle/challenge/${token}`.length).toBeLessThan(200);

  const solver = await newPlayer(browser);
  const { frames } = recordFrames(solver);
  await solver.goto(link);
  await expect(solver.getByRole("button", { name: "Start" })).toBeVisible();
  expect(frames).toHaveLength(0); // opening the link connects to nothing
  await pressStart(solver);

  for (const [i, word] of WORDS.entries()) await solveRound(solver, i + 1, word);

  await expect(solver.getByTestId("challenge-summary")).toBeVisible();
  await expect(solver.getByTestId("summary-solved")).toHaveText("5 of 5 solved");
  await expect(solver.getByTestId("summary-time")).toContainText("Total time");

  // Frame check. Before round 1 is revealed, the other four words are in no frame at all.
  const messages = frames.map((f) => JSON.parse(f) as { type: string; answer?: string });
  const firstReveal = messages.findIndex((m) => m.type === "roundEnd");
  expect(firstReveal).toBeGreaterThan(0);
  const before = frames.slice(0, firstReveal).join("");
  for (const word of WORDS.slice(1)) expect(before).not.toContain(word);
  for (const m of messages.filter((m) => m.type === "challengeStart" || m.type === "roundStart")) {
    for (const word of WORDS) expect(JSON.stringify(m)).not.toContain(word);
  }
  // The scan is not vacuous: the reveal does carry the word.
  expect(messages[firstReveal].answer).toBe("crane");

  // The link stays playable: Play again restarts at word 1.
  await solver.getByRole("button", { name: "Play again" }).click();
  await expect(solver.getByTestId("round-label")).toHaveText("Word 1 of 5");
  await solver.context().close();
});

test("a link where nobody solves anything ends with 0 of 5 on the server clock", async ({ browser }) => {
  test.setTimeout(60_000);
  const link = await makeLink(browser, WORDS, "1 min");
  const solver = await newPlayer(browser);
  await solver.goto(link);
  await pressStart(solver);
  await expect(solver.getByTestId("summary-solved")).toHaveText("0 of 5 solved", { timeout: 30_000 });
  await solver.context().close();
});

test("marks a word that is not in the word list, and one that repeats", async ({ page }) => {
  await page.goto("/woordle/challenge/new");
  const create = page.getByRole("button", { name: "Create link" });

  await fillWords(page, ["zzzzz", "slate", "robot", "moist", "light"]);
  await expect(page.getByTestId("word-0-problem")).toHaveText("Not in the word list");
  await expect(create).toBeDisabled();
  await page.getByTestId("word-0").fill("crane");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("word-0-problem")).toHaveText("");

  await page.getByTestId("word-1").fill("crane");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("word-0-problem")).toHaveText("Already used");
  await expect(page.getByTestId("word-1-problem")).toHaveText("Already used");
  await expect(create).toBeDisabled();

  await page.getByTestId("word-1").fill("slate");
  await page.keyboard.press("Tab");
  await expect(create).toBeEnabled();
});

test("only letters can be typed into a word field", async ({ page }) => {
  await page.goto("/woordle/challenge/new");
  await page.getByTestId("word-0").pressSequentially("cr4an3e9x");
  await expect(page.getByTestId("word-0")).toHaveValue("crane");
});

test("a tampered link and a made-up link both say the challenge has expired, without a reconnect loop", async ({ browser }) => {
  const link = await makeLink(browser, WORDS, "5 min");
  const token = link.split("/").pop()!;
  const at = 40;
  const tampered = token.slice(0, at) + (token[at] === "A" ? "B" : "A") + token.slice(at + 1);

  for (const [label, bad] of [["tampered", tampered], ["made-up", "A".repeat(134)], ["short", "short"]] as const) {
    const page = await newPlayer(browser);
    const { sockets } = recordFrames(page);
    await page.goto(`/woordle/challenge/${bad}`);
    await pressStart(page);
    await expect(page.getByRole("heading", { name: "This challenge link has expired" }), `${label} token`).toBeVisible();
    await expect(page.getByRole("link", { name: "Make your own" })).toBeVisible();
    const settled = sockets();
    await page.waitForTimeout(1500);
    expect(sockets()).toBe(settled);
    await page.context().close();
  }
});

// --- Review fixes M1 to M3 (see .claude/Reviews/phase-4-challenge-code-review.md) ---

test("changing the time limit drops the link, picking the same limit keeps it, and a new link differs (M1)", async ({ page }) => {
  await page.goto("/woordle/challenge/new");
  await fillWords(page, WORDS);
  await page.getByRole("button", { name: "Create link" }).click();
  const first = await page.getByTestId("challenge-link").inputValue();

  await page.getByRole("button", { name: "3 min" }).click(); // already selected
  await expect(page.getByTestId("link-panel")).toBeVisible();

  await page.getByRole("button", { name: "1 min" }).click();
  await expect(page.getByTestId("link-panel")).toHaveCount(0);

  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("link-panel")).toBeVisible();
  expect(await page.getByTestId("challenge-link").inputValue()).not.toBe(first);
});

test("a link that arrives after the form changed is not shown (F1b)", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/parties/challenge/seal", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await gate;
    await route.continue();
  });

  await page.goto("/woordle/challenge/new");
  await fillWords(page, WORDS);
  const create = page.getByRole("button", { name: "Create link" });
  await create.click();
  await expect(page.getByRole("button", { name: "Creating…" })).toBeVisible();

  // The creator edits a word while the request is still out.
  await page.getByTestId("word-4").fill("stone");
  release();

  await expect(create).toBeVisible(); // the request finished (busy is over)
  await expect(page.getByTestId("link-panel")).toHaveCount(0);
  // The form still works for what is on screen now.
  await page.keyboard.press("Tab");
  await create.click();
  await expect(page.getByTestId("link-panel")).toBeVisible();
});

test("Create link works on the first click even when the word check cannot be reached (M3)", async ({ page }) => {
  await page.route("**/parties/challenge/check", (route) => route.abort());
  await page.goto("/woordle/challenge/new");
  await fillWords(page, WORDS);
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByTestId("link-panel")).toBeVisible();
});

test("a word the server rejects at seal time is marked and blocks until it is fixed (M3 keeps the server as the gate)", async ({ page }) => {
  await page.route("**/parties/challenge/check", (route) => route.abort());
  await page.goto("/woordle/challenge/new");
  await fillWords(page, ["zzzzz", "slate", "robot", "moist", "light"]);
  const create = page.getByRole("button", { name: "Create link" });
  await create.click();
  await expect(page.getByTestId("word-0-problem")).toHaveText("Not in the word list");
  await expect(page.getByTestId("link-panel")).toHaveCount(0);
  await expect(create).toBeDisabled();
  await page.getByTestId("word-0").fill("crane");
  await expect(create).toBeEnabled();
});

test("a mangled link says expired: the server answers a token at the cap, the client alone answers one that cannot be a token (M2)", async ({ browser }) => {
  // 512 characters is the largest the client will send: the largest frame must be answered, not
  // dropped. (A token over the cap but inside a frame is covered by the adapter unit test.)
  const page = await newPlayer(browser);
  const { sockets } = recordFrames(page);
  await page.goto(`/woordle/challenge/${"A".repeat(512)}`);
  // A click before React hydrates does nothing; a second click while connecting is ignored.
  await expect(async () => {
    await pressStart(page);
    await expect(page.getByRole("heading", { name: "This challenge link has expired" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 10_000 });
  expect(sockets()).toBe(1);
  await page.context().close();

  // These can never be a token, so no connection is made at all.
  for (const bad of ["A".repeat(513), "A".repeat(600), "abc.def", "ab%2Bcd"]) {
    const p = await newPlayer(browser);
    const rec = recordFrames(p);
    await p.goto(`/woordle/challenge/${bad}`);
    // A click before React hydrates does nothing, so retry it; expiring twice is harmless.
    await expect(async () => {
      await pressStart(p);
      await expect(p.getByRole("heading", { name: "This challenge link has expired" })).toBeVisible({ timeout: 1000 });
    }, `token ${bad.slice(0, 12)}…`).toPass({ timeout: 10_000 });
    await p.waitForTimeout(500);
    expect(rec.sockets()).toBe(0);
    await p.context().close();
  }
});

test("if the server never answers Start, the solver gets Start back after 10 seconds (M2 safety net)", async ({ browser }) => {
  test.setTimeout(40_000);
  const link = await makeLink(browser, WORDS, "5 min");
  const page = await newPlayer(browser);
  // The socket opens but nothing ever replies, like a begin that was dropped.
  await page.routeWebSocket(/\/parties\/challenge\//, () => {});
  await page.goto(link);
  const start = page.getByRole("button", { name: "Start" });
  await pressStart(page);
  await expect(page.getByText("Connecting…")).toBeVisible();
  await expect(start).toBeDisabled();
  await expect(page.getByText("Could not reach the server. Try Start again.")).toBeVisible({ timeout: 20_000 });
  await expect(start).toBeEnabled();
  await page.context().close();
});
