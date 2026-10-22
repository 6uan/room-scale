"use client";

import { Link, WandSparkles } from "lucide-react";
import { useId, useState } from "react";
import { LabelledButton } from "@/components/icon-button";
import {
  extractProduct,
  type Extracted,
  type ExtractedProduct,
} from "@/domain/import";
import { formatCents, formatLength, type DisplayUnit } from "@/domain/units";

export type ProductImportPanelProps = {
  unit: DisplayUnit;
  /** Called with what was read, to fill the form in for checking. */
  onExtracted: (extracted: ExtractedProduct) => void;
};

/**
 * Paste a product page, get the form filled in.
 *
 * Two ways in, both ending at the same report: the page's address, fetched
 * once by the server on the button press and nothing else; or the page's
 * text, read right here. The address is quicker where it works and says so
 * where it does not, and the text is the way in that always works, which is
 * why it stays beside the link rather than behind it.
 *
 * Shown by the form when asked for, not folded under a disclosure of its
 * own: the form decides where it goes. Nothing here saves anything. It reads
 * what it can, says what it read and where each value came from, and leaves
 * the form to be corrected and submitted as normal — the confirmation step
 * ADR 0005 requires.
 */
export function ProductImportPanel({
  unit,
  onExtracted,
}: ProductImportPanelProps) {
  const urlId = useId();
  const textareaId = useId();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [fetching, setFetching] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  function handleFill(): void {
    const extracted = extractProduct(text);
    setReport({ kind: "read", extracted });
    onExtracted(extracted);
  }

  async function handleFetch(): Promise<void> {
    setFetching(true);
    setReport(null);
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = (await response.json()) as FetchResult;
      if (result.status !== "read") {
        setReport({ kind: "failed", message: result.message });
        return;
      }
      const extracted: ExtractedProduct = {
        ...result.extracted,
        productUrl: { value: url.trim(), sourceText: url.trim() },
      };
      setReport({ kind: "read", extracted });
      onExtracted(extracted);
    } catch {
      setReport({ kind: "failed", message: "The page could not be fetched." });
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-3 dark:border-white/15">
      <label htmlFor={urlId} className="text-[13px] leading-relaxed opacity-70">
        Paste the product page&apos;s address. The page is fetched once, and
        whatever can be read is filled into the form for you to check.
      </label>
      <div className="flex gap-2">
        <input
          id={urlId}
          type="url"
          value={url}
          placeholder="https://"
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && url.trim() !== "" && !fetching) {
              event.preventDefault();
              void handleFetch();
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20"
        />
        <LabelledButton
          label={fetching ? "Fetching…" : "Fetch the page"}
          icon={Link}
          disabled={url.trim() === "" || fetching}
          onClick={() => void handleFetch()}
        />
      </div>

      <label
        htmlFor={textareaId}
        className="text-[13px] leading-relaxed opacity-70"
      >
        Or open the page, select all of it, copy, and paste the text here — this
        works on pages the address does not.
      </label>
      <textarea
        id={textareaId}
        value={text}
        rows={5}
        onChange={(event) => setText(event.target.value)}
        className="w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 font-mono text-xs dark:border-white/20"
      />
      <div>
        <LabelledButton
          label="Fill the form"
          icon={WandSparkles}
          disabled={text.trim() === ""}
          onClick={handleFill}
        />
      </div>

      {report === null ? null : report.kind === "failed" ? (
        <p role="status" className="text-sm">
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

function ExtractionReport({
  report,
  unit,
}: {
  report: ExtractedProduct;
  unit: DisplayUnit;
}) {
  const rows = [
    describe("Name", report.name, (value) => value),
    describe("Price", report.priceCents, (value) => formatCents(value)),
    describe("Width", report.widthMeters, (value) => formatLength(value, unit)),
    describe("Length", report.depthMeters, (value) =>
      formatLength(value, unit),
    ),
    describe("Height", report.heightMeters, (value) =>
      formatLength(value, unit),
    ),
  ].filter((row) => row !== null);

  if (rows.length === 0) {
    return (
      <p role="status" className="text-sm">
        Nothing could be read from that. Fill the form in by hand — the page may
        be one this cannot read yet.
      </p>
    );
  }

  return (
    <div role="status" className="flex flex-col gap-2">
      <p className="text-sm">
        Read {rows.length} {rows.length === 1 ? "value" : "values"}. Check each
        against the page before saving.
      </p>
      <dl className="flex flex-col gap-1 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-2">
            <dt className="opacity-60">{row.label}:</dt>
            <dd className="font-medium">{row.value}</dd>
            <dd className="opacity-60">
              from <q className="font-mono">{row.sourceText}</q>
              {row.context === undefined ? null : (
                <>
                  {" "}
                  under <q>{row.context}</q>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {report.dimensionOrderIsAssumed ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">
          The page listed three sizes without saying which was which. They have
          been read as width, length, then height — check that against the
          picture before saving.
        </p>
      ) : null}
    </div>
  );
}

type ReportRow = {
  label: string;
  value: string;
  sourceText: string;
  context?: string;
};

function describe<T>(
  label: string,
  extracted: Extracted<T> | undefined,
  format: (value: T) => string,
): ReportRow | null {
  return extracted === undefined
    ? null
    : {
        label,
        value: format(extracted.value),
        sourceText: extracted.sourceText,
        ...(extracted.context === undefined
          ? {}
          : { context: extracted.context }),
      };
}
