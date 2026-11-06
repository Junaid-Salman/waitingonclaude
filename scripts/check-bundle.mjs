// Fails if a word list leaks into the client bundle (.next/static).
//   node scripts/check-bundle.mjs
//
// A plain grep for five-letter words matches ordinary JS, so this looks for runs of three
// consecutive list entries (first, middle, last) joined the way minified JSON arrays are.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function runsFor(words) {
  const starts = [0, Math.floor((words.length - 3) / 2), words.length - 3];
  return starts.map((i) => words.slice(i, i + 3));
}

// Passages are prose, so the probe is the first 40 characters of the first, middle and last entry.
export function passageProbes(passages) {
  const at = [0, Math.floor((passages.length - 1) / 2), passages.length - 1];
  return at.map((i) => passages[i].text.slice(0, 40));
}

export function findLeaks(source, lists, passages = []) {
  const leaks = [];
  if (passages.length > 0) {
    for (const probe of passageProbes(passages)) {
      // A bundler may escape quotes when it embeds a string, so look for that form as well.
      if (source.includes(probe) || source.includes(JSON.stringify(probe).slice(1, -1))) leaks.push(`passage: ${probe}`);
    }
  }
  for (const [name, words] of Object.entries(lists)) {
    for (const run of runsFor(words)) {
      const quoted = run.map((w) => `"${w}"`).join(",");
      const bare = run.join(",");
      if (source.includes(quoted) || source.includes(bare)) leaks.push(`${name}: ${run.join(",")}`);
    }
  }
  return leaks;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const lists = {
    answers: JSON.parse(readFileSync(join(root, "party/data/answers.json"), "utf8")),
    guesses: JSON.parse(readFileSync(join(root, "party/data/guesses.json"), "utf8")),
  };
  const passages = JSON.parse(readFileSync(join(root, "party/data/passages.json"), "utf8"));
  const staticDir = join(root, ".next/static");
  if (!existsSync(staticDir)) {
    console.error("check-bundle: no .next/static; run `npm run build` first");
    process.exit(1);
  }
  const problems = [];
  let scanned = 0;
  for (const file of walk(staticDir)) {
    if (/(answers|guesses|passages)\.json/.test(file)) problems.push(`word list asset: ${file}`);
    if (!/\.(js|json|html|txt|map)$/.test(file)) continue;
    scanned++;
    for (const leak of findLeaks(readFileSync(file, "utf8"), lists, passages)) problems.push(`${file}: ${leak}`);
  }
  if (problems.length > 0) {
    console.error(`check-bundle: word or passage data found in client output\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`check-bundle: ${scanned} client files scanned, no word or passage data found`);
}
