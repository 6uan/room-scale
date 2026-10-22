"use client";

import { Link } from "lucide-react";
import {
  useId,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { ExtractionReport } from "@/components/product-import-panel";
import {
  retailerNameFromHostname,
  type ExtractedProduct,
} from "@/domain/import";
import type { DisplayUnit } from "@/domain/units";

export type ProductLinkFieldProps = {
  value: string;
  unit: DisplayUnit;
  problem: string | null;
  onValueChange: (value: string) => void;
  /** Called with what the page said, to fill the rest of the form for checking. */
  onExtracted: (extracted: ExtractedProduct) => void;
};

/**
 * The product's address, first in the form because it is the thing you have
 * first: you are looking at the page. Pasting it fetches that one page and
 * fills in the rest for checking; it can also be fetched again by the
 * button, after an edit, or with Enter. The address itself is kept as the
 * product's link, so a product remembers where it came from. Nothing here
 * saves anything — the form does, once it has been looked over.
 */
export function ProductLinkField({
  value,
  unit,
  problem,
  onValueChange,
  onExtracted,
}: ProductLinkFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const [fetching, setFetching] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  async function fetchPage(url: string): Promise<void> {
    const address = url.trim();
    if (address === "" || fetching) {
      return;
    }
    setFetching(true);
    setReport(null);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: address }),
      });
      const result = (await response.json()) as FetchResult;
      if (result.status !== "read") {
        setReport({ kind: "failed", message: result.message });
        return;
      }
      const extracted: ExtractedProduct = {
        ...result.extracted,
        productUrl: { value: address, sourceText: address },
        ...retailerOf(address),
      };
      setReport({ kind: "read", extracted });
      onExtracted(extracted);
    } catch {
      setReport({ kind: "failed", message: "The page could not be fetched." });
    } finally {
      setFetching(false);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData("text").trim();
    if (pasted === "") {
      return;
    }
    event.preventDefault();
    onValueChange(pasted);
    void fetchPage(pasted);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void fetchPage(value);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          Product link
        </label>
        <button
          type="button"
          disabled={value.trim() === "" || fetching}
          onClick={() => void fetchPage(value)}
          className="flex items-center gap-1.5 text-[13px] opacity-60 transition-opacity hover:opacity-100 disabled:opacity-30"
        >
          <Link aria-hidden="true" className="size-3.5" />
          {fetching ? "Fetching…" : "Fetch the page"}
        </button>
      </div>
      <input
        id={inputId}
        type="url"
        value={value}
        placeholder="Paste the page's address to fill the form in"
        aria-invalid={problem !== null}
        {...(problem === null ? {} : { "aria-describedby": messageId })}
        onChange={(event) => onValueChange(event.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        className="h-8 w-full rounded-lg border border-black/15 bg-transparent px-2.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/45"
      />
      {problem === null ? null : (
        <p id={messageId} className="text-[13px] text-red-600">
          {problem}
        </p>
      )}
      {report === null ? null : report.kind === "failed" ? (
        <p role="status" className="text-[13px]">
          {report.message} Paste the page&apos;s text instead, or fill the form
          in by hand.
        </p>
      ) : (
        <ExtractionReport report={report.extracted} unit={unit} />
      )}
    </div>
  );
}

type Report =
  | { kind: "read"; extracted: ExtractedProduct }
  | { kind: "failed"; message: string };

/** What `/api/import` answers. */
type FetchResult =
  | { status: "read"; extracted: ExtractedProduct }
  | { status: "refused" | "unreachable"; message: string };

function retailerOf(address: string): Pick<ExtractedProduct, "retailer"> {
  try {
    const name = retailerNameFromHostname(new URL(address).hostname);
    return name === null
      ? {}
      : { retailer: { value: name, sourceText: new URL(address).hostname } };
  } catch {
    return {};
  }
}
