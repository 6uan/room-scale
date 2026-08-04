"use client";

import { CornerDownLeft, GripVertical } from "lucide-react";
import { IconButton } from "@/components/icon-button";
import { PanelHeader } from "@/components/panel-header";
import {
  countPlaced,
  type FurnitureInstance,
  type FurnitureProduct,
} from "@/domain/furniture";
import { formatCents, formatLength, type DisplayUnit } from "@/domain/units";
import { isSelected, type Selection } from "@/components/selection";

/** What a drag from this panel carries, so the plan knows what was dropped. */
export const PRODUCT_DRAG_TYPE = "application/x-roomscale-product";

export type CataloguePanelProps = {
  products: readonly FurnitureProduct[];
  instances: readonly FurnitureInstance[];
  unit: DisplayUnit;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onPlace: (product: FurnitureProduct) => void;
};

/**
 * The things being considered, to drag onto the plan.
 *
 * Dragging drops a piece exactly where it is let go, which is the quick way.
 * The Place button is the one that always works — on a touchscreen, or when the
 * spot you want is not on screen — and it lands the piece in the middle, ready
 * to be moved. Pressing a name opens the product itself for editing.
 */
export function CataloguePanel({
  products,
  instances,
  unit,
  selection,
  onSelect,
  onPlace,
}: CataloguePanelProps) {
  return (
    <div className="flex max-h-[70vh] min-h-0 flex-col gap-4 overflow-y-auto border-t border-black/10 p-5 dark:border-white/15">
      <PanelHeader
        title="Catalogue"
        action="New product"
        onAction={() => onSelect({ kind: "new-product" })}
      />

      {products.length === 0 ? (
        <p className="px-1 text-[13px] leading-relaxed opacity-60">
          Nothing yet. Add the first thing you are thinking of buying, or paste
          the page you found it on.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {products.map((product) => {
            const placed = countPlaced(instances, product.id);
            return (
              <li
                key={product.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(PRODUCT_DRAG_TYPE, product.id);
                  event.dataTransfer.effectAllowed = "copy";
                }}
                className={`group flex min-w-0 cursor-grab items-center gap-1 rounded-lg py-2 pr-1 pl-1.5 text-sm transition-colors active:cursor-grabbing ${
                  isSelected(selection, "product", product.id)
                    ? "bg-black/10 dark:bg-white/15"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                {/* The handle is the only sign a row can be dragged at all,
                    which the word "Place" beside it never was. */}
                <GripVertical
                  aria-hidden="true"
                  className="size-3.5 shrink-0 opacity-25 group-hover:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "product", id: product.id })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate">{product.name}</span>
                  <span className="block truncate text-[13px] opacity-55">
                    {formatLength(product.footprint.widthMeters, unit)} ×{" "}
                    {formatLength(product.footprint.depthMeters, unit)}
                    {product.priceCents === 0
                      ? ""
                      : ` · ${formatCents(product.priceCents)}`}
                    {placed === 0 ? "" : ` · ${placed} placed`}
                  </span>
                </button>
                <IconButton
                  label={`Place ${product.name} in the room`}
                  icon={CornerDownLeft}
                  size="small"
                  onClick={() => onPlace(product)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
