import type { PassageLength } from "../../../shared/type-race-protocol";
import { focusClasses, secondaryButtonClasses, selectedOptionClasses } from "@/lib/colors";

const OPTIONS: { length: PassageLength; label: string; hint: string }[] = [
  { length: "short", label: "Short", hint: "about 1 minute" },
  { length: "medium", label: "Medium", hint: "about 1.5 minutes" },
  { length: "long", label: "Long", hint: "about 2 minutes" },
];

// Passage length (S/M/L). It also sets the time limit, so the hint says how long a run can last.
export function PassageSize({ value, onChange, disabled }: { value: PassageLength; onChange(length: PassageLength): void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Passage length" className="flex flex-wrap gap-2.5">
      {OPTIONS.map((o) => (
        <button
          key={o.length}
          type="button"
          aria-pressed={value === o.length}
          disabled={disabled}
          onClick={() => onChange(o.length)}
          title={o.hint}
          className={`bold-text-sm rounded-xl px-3.5 py-2 disabled:opacity-50 ${value === o.length ? selectedOptionClasses : secondaryButtonClasses} ${focusClasses}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
