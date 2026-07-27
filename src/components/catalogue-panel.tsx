"use client";

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
    <div className="flex flex-col gap-3 border-t border-black/10 p-4 dark:border-white/15">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs uppercase tracking-[0.15em] opacity-50">
          Catalogue
        </h2>
        <button
          type="button"
          onClick={() => onSelect({ kind: "new-product" })}
          className="rounded px-1.5 py-0.5 text-xs opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          New product
        </button>
      </div>

      {products.length === 0 ? (
        <p className="px-1 text-xs leading-relaxed opacity-50">
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
                className={`flex cursor-grab items-baseline justify-between gap-2 rounded px-2 py-1.5 text-sm active:cursor-grabbing ${
                  isSelected(selection, "product", product.id)
                    ? "bg-black/10 dark:bg-white/15"
                    : "hover:bg-black/5 dark:hover:bg-white/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "product", id: product.id })}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate">{product.name}</span>
                  <span className="block truncate text-xs opacity-50">
                    {formatLength(product.footprint.widthMeters, unit)} ×{" "}
                    {formatLength(product.footprint.depthMeters, unit)}
                    {product.priceCents === 0
                      ? ""
                      : ` · ${formatCents(product.priceCents)}`}
                    {placed === 0 ? "" : ` · ${placed} placed`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onPlace(product)}
                  aria-label={`Place ${product.name} in the room`}
                  className="rounded border border-black/15 px-2 py-0.5 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                >
                  Place
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
