"use client";

import { ChevronDown, ClipboardPaste } from "lucide-react";
import { useId, useState } from "react";
import { NumberField } from "@/components/number-field";
import { PriceField } from "@/components/price-field";
import { ProductImportPanel } from "@/components/product-import-panel";
import { ProductLinkField } from "@/components/product-link-field";
import type { ExtractedProduct } from "@/domain/import";
import {
  MAX_NAME_LENGTH,
  PRODUCT_CATEGORIES,
  PRODUCT_LENGTH_LIMITS,
  PURCHASE_STATUSES,
  checkProduct,
  hasProblems,
  withFootprint,
  type FurnitureProduct,
  type ProductCategory,
  type ProductProblems,
  type PurchaseStatus,
} from "@/domain/furniture";
import type { DisplayUnit } from "@/domain/units";

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  wanted: "Wishlist",
  owned: "Purchased",
};

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  seating: "Seating",
  table: "Table",
  storage: "Storage",
  bed: "Bed",
  rug: "Rug",
  lighting: "Lighting",
  decor: "Decor",
  other: "Other",
};

export type ProductFormProps = {
  /** The product to start from. Remount with a `key` to start from another. */
  initial: FurnitureProduct;
  unit: DisplayUnit;
  submitLabel: string;
  /** Something the save itself refused, printed above the buttons. */
  problem?: string | null;
  onSave: (product: FurnitureProduct) => void;
  onCancel?: (() => void) | undefined;
};

/**
 * One product, entered as it reads on the page you are buying from.
 *
 * The draft is held here and only handed up on save, so a partly typed product
 * never reaches the list. Dimensions go through `NumberField` and the price
 * through `PriceField`, which means neither can commit a value the domain would
 * reject.
 *
 * The link comes first, because it is what you have before anything else —
 * you are looking at the page — and pasting it fills the rest in. Then the
 * name, and the three sizes in one row the way a listing prints them. Pasting
 * the page's text is the way in for pages a link cannot read, so it is a
 * small button beside the name that opens the paste box when asked. The two
 * buttons stay at the bottom of the panel whatever is scrolled, because a save
 * button you have to go looking for is one you forget to press.
 */
export function ProductForm({
  initial,
  unit,
  submitLabel,
  problem = null,
  onSave,
  onCancel,
}: ProductFormProps) {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [pasting, setPasting] = useState(false);
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
      ...(extracted.productUrl === undefined
        ? {}
        : { productUrl: extracted.productUrl.value }),
      ...(extracted.retailer === undefined
        ? {}
        : { retailer: extracted.retailer.value }),
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
    <form
      onSubmit={handleSubmit}
      className="-mb-5 flex min-h-0 flex-1 flex-col gap-5"
      noValidate
    >
      <ProductLinkField
        value={draft.productUrl}
        unit={unit}
        problem={
          shown.productUrl
            ? "Paste the full address, starting with https://."
            : null
        }
        onValueChange={(productUrl) => setDraft({ ...draft, productUrl })}
        onExtracted={applyExtracted}
      />

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
        action={
          <button
            type="button"
            aria-expanded={pasting}
            onClick={() => setPasting((open) => !open)}
            className="flex items-center gap-1.5 text-[13px] opacity-60 transition-opacity hover:opacity-100"
          >
            <ClipboardPaste aria-hidden="true" className="size-3.5" />
            Paste from a product page
          </button>
        }
      />

      {pasting ? (
        <ProductImportPanel unit={unit} onExtracted={applyExtracted} />
      ) : null}

      <SelectField
        label="Category"
        value={draft.category}
        options={PRODUCT_CATEGORIES}
        labels={PRODUCT_CATEGORY_LABELS}
        onValueChange={(category) => setDraft({ ...draft, category })}
      />

      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Width"
          unit={unit}
          meters={draft.footprint.widthMeters}
          limits={PRODUCT_LENGTH_LIMITS}
          hint={false}
          onMetersChange={(meters) =>
            setDraft(withFootprint(draft, "widthMeters", meters))
          }
        />
        <NumberField
          label="Length"
          unit={unit}
          meters={draft.footprint.depthMeters}
          limits={PRODUCT_LENGTH_LIMITS}
          hint={false}
          onMetersChange={(meters) =>
            setDraft(withFootprint(draft, "depthMeters", meters))
          }
        />
        <NumberField
          label="Height"
          unit={unit}
          meters={draft.heightMeters}
          limits={PRODUCT_LENGTH_LIMITS}
          hint={false}
          onMetersChange={(heightMeters) =>
            setDraft({ ...draft, heightMeters })
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PriceField
          label="Price"
          cents={draft.priceCents}
          onCentsChange={(priceCents) => setDraft({ ...draft, priceCents })}
        />
        <SelectField
          label="Status"
          value={draft.purchaseStatus}
          options={PURCHASE_STATUSES}
          labels={PURCHASE_STATUS_LABELS}
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

      {problem === null ? null : (
        <p role="alert" className="text-[13px] text-red-600">
          {problem}
        </p>
      )}

      {/* Pinned to the bottom of the panel: `sticky` against the inspector's
          own scroll, with the panel's padding pulled back out so the bar runs
          edge to edge and sits on its own background rather than over the
          fields scrolling under it. */}
      <div className="sticky bottom-0 -mx-5 mt-auto flex items-center justify-between gap-3 border-t border-black/10 bg-background px-5 py-3 dark:border-white/15">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-lg px-3 text-sm font-medium opacity-70 transition-colors hover:bg-black/[0.06] hover:opacity-100 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          className="h-8 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85"
        >
          {submitLabel}
        </button>
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
  /** Something small to offer beside the label, on the right. */
  action?: React.ReactNode;
};

export function TextField({
  label,
  value,
  problem,
  onValueChange,
  type = "text",
  required = false,
  placeholder,
  action,
}: TextFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        {action}
      </div>
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
        className="h-8 w-full rounded-lg border border-black/15 bg-transparent px-2.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/45"
      />
      {problem === null ? null : (
        <p id={messageId} className="text-[13px] text-red-600">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * A closed choice, drawn as the other fields are.
 *
 * The browser's own select arrow sits hard against the right edge of the box,
 * so it is hidden and a chevron drawn in its place with room around it.
 */
function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onValueChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onValueChange: (value: T) => void;
}) {
  const selectId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium">
        {label}
      </label>
      <SelectBox
        id={selectId}
        value={value}
        options={options}
        labels={labels}
        onValueChange={onValueChange}
      />
    </div>
  );
}

/** The select itself, with the chevron; named by a label or an aria-label. */
export function SelectBox<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onValueChange,
  size = "normal",
}: {
  id?: string;
  label?: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onValueChange: (value: T) => void;
  size?: "normal" | "small";
}) {
  const small = size === "small";
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value as T)}
        className={`appearance-none border border-black/15 bg-transparent outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/45 ${
          small
            ? "h-7 w-auto rounded-md pr-7 pl-2 text-xs"
            : "h-8 w-full rounded-lg pr-8 pl-2.5 text-sm"
        }`}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-50 ${
          small ? "right-2 size-3.5" : "right-2.5 size-4"
        }`}
      />
    </div>
  );
}
