// Builds party/data/answers.json and party/data/guesses.json from SCOWL and LDNOOBW.
//
//   node scripts/build-wordlists.mjs --download [--report .claude/Plans/phase-1-answer-review.md]
//   node scripts/build-wordlists.mjs --scowl <extracted dir> --blocklist <file> --frequency <file> [--report <file>]
//
// Rules are documented in party/data/LICENSES.md. Exits non-zero on any invariant failure.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCOWL_URL = "https://downloads.sourceforge.net/project/wordlist/SCOWL/2020.12.07/scowl-2020.12.07.tar.gz";
const BLOCKLIST_URL =
  "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en";

const FREQUENCY_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt";

const ANSWER_SOURCES = ["english-words", "american-words"];
const ANSWER_MAX_LEVEL = 35;
const GUESS_SOURCES = ["english-words", "american-words", "british-words", "canadian-words"];
const GUESS_MAX_LEVEL = 70;
// Answers must rank within this many of the most common English words, so players are never
// asked for obscure ones (wryer, uteri, tacit). Guesses are not filtered by frequency.
const ANSWER_MAX_FREQ_RANK = 20000;
const ANSWER_COUNT_RANGE = [1200, 2300];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

function fail(message) {
  console.error(`build-wordlists: ${message}`);
  process.exit(1);
}

async function download(url, file) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) fail(`download failed (${res.status}): ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

// SCOWL ships one file per sublist and level, for example final/english-words.35.
function readSublists(scowlDir, names, maxLevel) {
  const words = new Set();
  for (const name of names) {
    for (let level = 10; level <= maxLevel; level += 5) {
      const file = join(scowlDir, "final", `${name}.${level}`);
      if (!existsSync(file)) continue;
      for (const line of readFileSync(file, "latin1").split("\n")) {
        if (/^[a-z]{5}$/.test(line)) words.add(line);
      }
    }
  }
  return words;
}

function readOptional(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter((l) => /^[a-z]{5}$/.test(l));
}

const opts = args();
let scowlDir = opts.scowl;
let blocklistFile = opts.blocklist;
let frequencyFile = opts.frequency;

if (opts.download) {
  const tmp = mkdtempSync(join(tmpdir(), "woordle-words-"));
  const tgz = join(tmp, "scowl.tgz");
  await download(SCOWL_URL, tgz);
  execFileSync("tar", ["-xzf", tgz, "-C", tmp]);
  scowlDir = join(tmp, "scowl-2020.12.07");
  blocklistFile = join(tmp, "ldnoobw.txt");
  await download(BLOCKLIST_URL, blocklistFile);
  frequencyFile = join(tmp, "frequency.txt");
  await download(FREQUENCY_URL, frequencyFile);
}
if (!scowlDir || !blocklistFile || !frequencyFile) {
  fail("pass --download, or all of --scowl <dir>, --blocklist <file> and --frequency <file>");
}
if (!existsSync(join(scowlDir, "final"))) fail(`no final/ directory in ${scowlDir}`);

const blocklist = new Set(
  readFileSync(blocklistFile, "utf8")
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter((l) => /^[a-z]{5}$/.test(l)),
);
// Lines are "word count", most common first; a word's rank is its 1-based line number.
const frequencyRank = new Map();
readFileSync(frequencyFile, "utf8")
  .split("\n")
  .forEach((line, i) => {
    const word = line.split(" ")[0];
    if (word && !frequencyRank.has(word)) frequencyRank.set(word, i + 1);
  });
const exclude = new Set(readOptional(join(root, "scripts/answers-exclude.txt")));
const include = readOptional(join(root, "scripts/answers-include.txt"));

const guesses = readSublists(scowlDir, GUESS_SOURCES, GUESS_MAX_LEVEL);
const candidates = readSublists(scowlDir, ANSWER_SOURCES, ANSWER_MAX_LEVEL);

// Plurals and past tenses make poor answers. "[^s]s$" keeps -ss words such as "class".
const dropped = { pluralOrEd: [], blocklist: [], uncommon: [], excluded: [] };
const answers = new Set();
for (const word of candidates) {
  if (/[^s]s$/.test(word) || /ed$/.test(word)) dropped.pluralOrEd.push(word);
  else if (blocklist.has(word)) dropped.blocklist.push(word);
  else if ((frequencyRank.get(word) ?? Infinity) > ANSWER_MAX_FREQ_RANK) dropped.uncommon.push(word);
  else if (exclude.has(word)) dropped.excluded.push(word);
  else answers.add(word);
}
for (const word of include) answers.add(word);

for (const word of answers) guesses.add(word); // every answer is a valid guess by construction
const answerList = [...answers].sort();
const guessList = [...guesses].sort();

if (answerList.length < ANSWER_COUNT_RANGE[0] || answerList.length > ANSWER_COUNT_RANGE[1]) {
  fail(`answer count ${answerList.length} outside ${ANSWER_COUNT_RANGE.join("–")}`);
}
const guessSet = new Set(guessList);
const missing = answerList.filter((w) => !guessSet.has(w));
if (missing.length > 0) fail(`answers missing from guesses: ${missing.join(", ")}`);
const blocked = answerList.filter((w) => blocklist.has(w) && !include.includes(w));
if (blocked.length > 0) fail(`blocklisted answers: ${blocked.join(", ")}`);

const dataDir = join(root, "party/data");
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, "answers.json"), JSON.stringify(answerList) + "\n");
writeFileSync(join(dataDir, "guesses.json"), JSON.stringify(guessList) + "\n");
console.log(`answers: ${answerList.length}, guesses: ${guessList.length}`);
console.log(`dropped: ${dropped.pluralOrEd.length} plural/-ed, ${dropped.blocklist.length} blocklist, ${dropped.uncommon.length} uncommon, ${dropped.excluded.length} excluded`);

if (typeof opts.report === "string") {
  const lines = [
    "# Phase 1 — answer list for owner review",
    "",
    `Answers: ${answerList.length}. Guesses: ${guessList.length}. SCOWL 2020.12.07 (answers: ${ANSWER_SOURCES.join(" + ")} ≤${ANSWER_MAX_LEVEL}, frequency rank ≤${ANSWER_MAX_FREQ_RANK}; guesses: ${GUESS_SOURCES.join(" + ")} ≤${GUESS_MAX_LEVEL}).`,
    "",
    `Dropped as plural or -ed (${dropped.pluralOrEd.length}), sample of non-plural-looking words to consider restoring via scripts/answers-include.txt:`,
    "",
    dropped.pluralOrEd.filter((w) => /[^s]s$/.test(w) && /(us|is|as|os)$/.test(w)).join(" "),
    "",
    `Removed by blocklist (${dropped.blocklist.length}): ${dropped.blocklist.join(" ")}`,
    "",
    `Removed as uncommon, outside the ${ANSWER_MAX_FREQ_RANK.toLocaleString("en-US")} most frequent English words (${dropped.uncommon.length}); restore any via scripts/answers-include.txt:`,
    "",
    dropped.uncommon.join(" "),
    "",
    `Removed by scripts/answers-exclude.txt (${dropped.excluded.length}): ${dropped.excluded.join(" ")}`,
    "",
    "## Full answer list",
    "",
    answerList.join(" "),
    "",
  ];
  const reportPath = resolve(root, opts.report);
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, lines.join("\n"));
  console.log(`report: ${reportPath}`);
}
