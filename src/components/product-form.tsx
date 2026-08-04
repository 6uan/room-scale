"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import { LabelledButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { PriceField } from "@/components/price-field";
import { ProductImportPanel } from "@/components/product-import-panel";
import type { ExtractedProduct } from "@/domain/import";
import {
  MAX_NAME_LENGTH,
  PRODUCT_LENGTH_LIMITS,
  PURCHASE_STATUSES,
  checkProduct,
  hasProblems,
  withFootprint,
  type FurnitureProduct,
  type ProductProblems,
  type PurchaseStatus,
} from "@/domain/furniture";
import type { DisplayUnit } from "@/domain/units";

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  considering: "Considering",
  ordered: "Ordered",
  owned: "Already own it",
};

export type ProductFormProps = {
  /** The product to start from. Remount with a `key` to start from another. */
  initial: FurnitureProduct;
  unit: DisplayUnit;
  submitLabel: string;
  onSave: (product: FurnitureProduct) => void;
  onCancel?: (() => void) | undefined;
};

/**
 * One product, entered as it reads on the page you are buying from.
 *
 * The draft is held here and only handed up on save, so a partly typed product
 * never reaches the catalogue. Dimensions go through `NumberField` and the price
 * through `PriceField`, which means neither can commit a value the domain would
 * reject.
 */
export function ProductForm({
  initial,
  unit,
  submitLabel,
  onSave,
  onCancel,
}: ProductFormProps) {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const problems = checkProduct(draft);

  // Problems stay quiet until the first save attempt, so an untouched blank
  // form is not covered in complaints about fields nobody has reached yet.
  const shown: ProductProblems = submitted ? problems : {};

  function handleSubmit(event: React.FormEvent): void {
    event.preventDefault();
    setSubmitted(true);
    if (!hasProblems(problems)) {
      onSave({ ...draft, name: draft.name.trim() });
    }
  }

  /**
   * Fills in what was read and leaves everything else alone, so importing over
   * a half-filled form corrects it rather than wiping it.
   */
  function applyExtracted(extracted: ExtractedProduct): void {
    setDraft((current) => ({
      ...current,
      ...(extracted.name === undefined ? {} : { name: extracted.name.value }),
      ...(extracted.priceCents === undefined
        ? {}
        : { priceCents: extracted.priceCents.value }),
      ...(extracted.heightMeters === undefined
        ? {}
        : { heightMeters: extracted.heightMeters.value }),
      footprint: {
        widthMeters:
          extracted.widthMeters?.value ?? current.footprint.widthMeters,
        depthMeters:
          extracted.depthMeters?.value ?? current.footprint.depthMeters,
      },
    }));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <ProductImportPanel unit={unit} onExtracted={applyExtracted} />

      <TextField
        label="Name"
        value={draft.name}
        required
        problem={
          shown.name === "required"
            ? "Give it a name you will recognize in a list."
            : shown.name === "too-long"
              ? `At most ${MAX_NAME_LENGTH} characters.`
              : null
        }
        onValueChange={(name) => setDraft({ ...draft, name })}
      />

      <div className="flex flex-wrap gap-4">
        <NumberField
          label="Width"
          unit={unit}
          meters={draft.footprint.widthMeters}
          limits={PRODUCT_LENGTH_LIMITS}
          onMetersChange={(meters) =>
            setDraft(withFootprint(draft, "widthMeters", meters))
          }
        />
        <NumberField
          label="Depth"
          unit={unit}
          meters={draft.footprint.depthMeters}
          limits={PRODUCT_LENGTH_LIMITS}
          onMetersChange={(meters) =>
            setDraft(withFootprint(draft, "depthMeters", meters))
          }
        />
        <NumberField
          label="Height"
          unit={unit}
          meters={draft.heightMeters}
          limits={PRODUCT_LENGTH_LIMITS}
          onMetersChange={(heightMeters) =>
            setDraft({ ...draft, heightMeters })
          }
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <PriceField
          label="Price"
          cents={draft.priceCents}
          onCentsChange={(priceCents) => setDraft({ ...draft, priceCents })}
        />
        <StatusField
          value={draft.purchaseStatus}
          onValueChange={(purchaseStatus) =>
            setDraft({ ...draft, purchaseStatus })
          }
        />
      </div>

      <TextField
        label="Retailer"
        value={draft.retailer}
        problem={null}
        onValueChange={(retailer) => setDraft({ ...draft, retailer })}
      />

      <TextField
        label="Product link"
        value={draft.productUrl}
        type="url"
        placeholder="https://"
        problem={
          shown.productUrl
            ? "Paste the full address, starting with https://."
            : null
        }
        onValueChange={(productUrl) => setDraft({ ...draft, productUrl })}
      />

      <div className="flex flex-wrap items-center gap-3">
        <LabelledButton label={submitLabel} icon={Check} type="submit" />
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-sm opacity-60 underline underline-offset-4 hover:opacity-100"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  problem: string | null;
  onValueChange: (value: string) => void;
  type?: "text" | "url";
  required?: boolean;
  placeholder?: string;
};

function TextField({
  label,
  value,
  problem,
  onValueChange,
  type = "text",
  required = false,
  placeholder,
}: TextFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        // `aria-required`, not `required`: the form validates itself, and the
        // native attribute would mark an untouched blank field invalid before
        // anyone has reached it.
        aria-required={required}
        placeholder={placeholder}
        aria-invalid={problem !== null}
        {...(problem === null ? {} : { "aria-describedby": messageId })}
        onChange={(event) => onValueChange(event.target.value)}
        className="w-full max-w-md rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20"
      />
      {problem === null ? null : (
        <p id={messageId} className="text-xs text-red-600">
          {problem}
        </p>
      )}
    </div>
  );
}

function StatusField({
  value,
  onValueChange,
}: {
  value: PurchaseStatus;
  onValueChange: (value: PurchaseStatus) => void;
}) {
  const selectId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium">
        Status
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) =>
          onValueChange(event.target.value as PurchaseStatus)
        }
        className="rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20"
      >
        {PURCHASE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {PURCHASE_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </div>
  );
}
