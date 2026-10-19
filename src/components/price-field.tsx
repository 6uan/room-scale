"use client";

import { useId, useState } from "react";
import {
  MAX_PRICE_CENTS,
  checkPrice,
  type PriceProblem,
} from "@/domain/furniture";
import {
  centsFromDecimalString,
  decimalStringFromCents,
  formatCents,
  type Cents,
} from "@/domain/units";

export type PriceFieldProps = {
  label: string;
  cents: Cents;
  onCentsChange: (cents: Cents) => void;
};

/**
 * A price, typed the way a retailer prints it and stored as integer cents.
 *
 * Like `NumberField`, the text is kept as typed and only a value that parses is
 * reported upward, so a half-typed amount does not momentarily become a
 * different price. The currency sign sits inside the box, and nothing is
 * printed under it unless something is wrong: the number in the box is the
 * price, and echoing it formatted underneath said the same thing twice.
 */
export function PriceField({ label, cents, onCentsChange }: PriceFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;

  const [draft, setDraft] = useState(() => decimalStringFromCents(cents));
  const [applied, setApplied] = useState(cents);

  if (applied !== cents) {
    setApplied(cents);
    setDraft(decimalStringFromCents(cents));
  }

  const parsed = centsFromDecimalString(draft);
  const problem: PriceProblem | "unparsed" | null =
    parsed === null ? "unparsed" : checkPrice(parsed);

  function handleChange(text: string): void {
    setDraft(text);

    const value = centsFromDecimalString(text);
    if (value === null || checkPrice(value) !== null) {
      return;
    }
    setApplied(value);
    onCentsChange(value);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex h-8 min-w-0 items-center rounded-lg border border-black/15 bg-transparent focus-within:border-black/40 dark:border-white/20 dark:focus-within:border-white/45">
        <span className="pl-2.5 text-xs opacity-50">$</span>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={draft}
          aria-invalid={problem !== null}
          {...(problem === null ? {} : { "aria-describedby": messageId })}
          onChange={(event) => handleChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm tabular-nums outline-none"
        />
      </div>
      {problem === null ? null : (
        <p id={messageId} className="text-[13px] text-red-600">
          {problemMessage(problem)}
        </p>
      )}
    </div>
  );
}

function problemMessage(problem: PriceProblem | "unparsed"): string {
  switch (problem) {
    case "unparsed":
    case "not-whole-cents":
      return "Enter an amount like 1299.99.";
    case "negative":
      return "A price cannot be negative.";
    case "too-large":
      return `At most ${formatCents(MAX_PRICE_CENTS)}.`;
  }
}
