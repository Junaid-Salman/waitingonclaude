"use client";

import { useRef, useState } from "react";
import {
  CHALLENGE_SECONDS_OPTIONS,
  DEFAULT_CHALLENGE_SECONDS,
  WORD_LENGTH,
  CHALLENGE_ROUNDS,
  type ChallengeSeconds,
  type WordProblem,
} from "../../../shared/protocol";
import { canCreate, isWellFormedWord, normaliseWord, wordVerdict, type FormVerdict } from "@/lib/challenge/form";
import { challengeLink } from "@/lib/challenge/link";
import { checkWord, sealWords } from "@/lib/challenge/seal-client";
import {
  buttonClasses,
  cardClasses,
  focusClasses,
  inputClasses,
  invalidInputClasses,
  invalidTextClasses,
  secondaryButtonClasses,
  selectedOptionClasses,
} from "@/lib/colors";

const PROBLEM_TEXT: Record<WordProblem, string> = {
  "bad-format": "Use exactly 5 letters",
  "not-a-word": "Not in the word list",
  duplicate: "Already used",
};

export function ChallengeForm() {
  const [words, setWords] = useState<string[]>(() => Array.from({ length: CHALLENGE_ROUNDS }, () => ""));
  // Server verdicts by word, so editing back to a checked word needs no second request.
  const [verdicts, setVerdicts] = useState<Record<string, "ok" | "not-a-word">>({});
  const [checking, setChecking] = useState<number | null>(null);
  // A short word is only an error once the field has been left, not while typing.
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const [serverProblems, setServerProblems] = useState<Record<number, WordProblem>>({});
  const [limitSec, setLimitSec] = useState<ChallengeSeconds>(DEFAULT_CHALLENGE_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(new Set<string>());
  // Bumped by every change to the words or the limit. A seal response is applied only if the form
  // is still what was sent, so the link on screen is always the link for what is on screen.
  const revision = useRef(0);

  const verdictFor = (index: number): FormVerdict => wordVerdict({ words, index, verdicts, serverProblems, checking });
  const allowed = canCreate(words, words.map((_, i) => verdictFor(i)));

  function formChanged() {
    revision.current++;
    setToken(null);
    setError(null);
  }

  function edit(index: number, value: string) {
    setWords((prev) => prev.map((w, i) => (i === index ? value.replace(/[^a-zA-Z]/g, "").slice(0, WORD_LENGTH) : w)));
    setServerProblems((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => Number(key) !== index)));
    formChanged();
  }

  function pickLimit(seconds: ChallengeSeconds) {
    if (seconds === limitSec) return;
    setLimitSec(seconds);
    formChanged();
  }

  async function onBlur(index: number) {
    setTouched((prev) => ({ ...prev, [index]: true }));
    const word = normaliseWord(words[index]);
    if (!isWellFormedWord(word) || verdicts[word] || inFlight.current.has(word)) return;
    inFlight.current.add(word);
    setChecking(index);
    const valid = await checkWord(word);
    inFlight.current.delete(word);
    // Clear only our own marker: another field may have started its check since.
    setChecking((current) => (current === index ? null : current));
    // null means the network failed; the word stays unchecked and "Create link" still works,
    // because the seal call re-validates every word.
    if (valid !== null) setVerdicts((prev) => ({ ...prev, [word]: valid ? "ok" : "not-a-word" }));
  }

  async function create() {
    setBusy(true);
    setError(null);
    const sent = revision.current;
    const outcome = await sealWords(words.map(normaliseWord), limitSec);
    setBusy(false);
    // The creator changed a word or the limit while this was in flight: the answer is for a form
    // that no longer exists, so showing it would be a link that does not match the screen.
    if (revision.current !== sent) return;
    if (outcome.ok) {
      setToken(outcome.token);
      return;
    }
    if (outcome.kind === "unavailable") {
      setError("Could not create the link. Check your connection and try again.");
      return;
    }
    if (outcome.kind === "rate-limited") {
      setError("Too many links in a short time. Try again in a minute.");
      return;
    }
    setServerProblems(Object.fromEntries(outcome.words.map((w) => [w.index, w.reason])));
    setError("Some words are not allowed. Fix the marked words and try again.");
  }

  const link = token && typeof window !== "undefined" ? challengeLink(window.location.origin, token) : null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <form
      className={`flex w-full max-w-xl flex-col gap-5 p-5 sm:p-8 ${cardClasses}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (allowed && !busy) void create();
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="extrabold-display-sm sm:extrabold-display-lg font-display">Make a challenge</h1>
        <p className="regular-text-md text-muted">Pick 5 words. Whoever opens your link plays them as 5 timed rounds.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="bold-text-sm mb-1 tracking-wider text-muted uppercase">Your 5 words</legend>
        {words.map((value, index) => {
          const verdict = verdictFor(index);
          const problem: WordProblem | null =
            verdict === "bad-format" ? (touched[index] ? verdict : null) : verdict in PROBLEM_TEXT ? (verdict as WordProblem) : null;
          const bad = problem !== null;
          return (
            <div key={index} className="flex flex-col gap-1">
              <label htmlFor={`word-${index}`} className="sr-only">
                Word {index + 1}
              </label>
              <input
                id={`word-${index}`}
                data-testid={`word-${index}`}
                value={value}
                maxLength={WORD_LENGTH}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={bad}
                aria-describedby={bad ? `word-${index}-problem` : undefined}
                onChange={(event) => edit(index, event.target.value)}
                onBlur={() => void onBlur(index)}
                placeholder={`Word ${index + 1}`}
                className={`bold-text-md rounded-xl px-3.5 py-2.5 tracking-widest uppercase placeholder:tracking-normal placeholder:normal-case placeholder:text-muted border-2 ${bad ? invalidInputClasses : inputClasses} bg-surface text-foreground ${focusClasses}`}
              />
              <p
                id={`word-${index}-problem`}
                data-testid={`word-${index}-problem`}
                aria-live="polite"
                className={`regular-text-xs min-h-4 ${invalidTextClasses}`}
              >
                {problem ? PROBLEM_TEXT[problem] : ""}
              </p>
            </div>
          );
        })}
      </fieldset>

      <section className="flex flex-col gap-2" aria-label="Time per word">
        <h2 className="bold-text-sm tracking-wider text-muted uppercase">Time per word</h2>
        <div className="flex flex-wrap gap-2">
          {CHALLENGE_SECONDS_OPTIONS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              aria-pressed={limitSec === seconds}
              onClick={() => pickLimit(seconds)}
              className={`bold-text-sm rounded-xl px-3.5 py-2 ${limitSec === seconds ? selectedOptionClasses : secondaryButtonClasses} ${focusClasses}`}
            >
              {seconds / 60} min
            </button>
          ))}
        </div>
      </section>

      <button
        type="submit"
        disabled={!allowed || busy}
        className={`bold-text-md self-stretch rounded-xl px-5 py-3 disabled:opacity-50 sm:self-start ${buttonClasses} ${focusClasses}`}
      >
        {busy ? "Creating…" : "Create link"}
      </button>

      <p role="status" aria-live="polite" className="bold-text-sm min-h-5 text-invalid" data-testid="form-error">
        {error}
      </p>

      {link && (
        <section aria-label="Your challenge link" className="flex flex-col gap-2" data-testid="link-panel">
          <h2 className="bold-text-sm tracking-wider text-muted uppercase">Your link</h2>
          <div className="flex gap-2.5">
            <input readOnly value={link} aria-label="Challenge link" data-testid="challenge-link" onFocus={(e) => e.currentTarget.select()} className={`regular-text-sm min-w-0 flex-1 rounded-xl border-2 border-foreground bg-surface px-3.5 py-2.5 text-foreground ${focusClasses}`} />
            <button type="button" onClick={() => void copy()} className={`bold-text-sm shrink-0 rounded-xl px-3.5 py-2 ${buttonClasses} ${focusClasses}`}>
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
          <p className="regular-text-sm text-muted">The link never shows your words. Anyone with it can play, any number of times.</p>
        </section>
      )}
    </form>
  );
}
