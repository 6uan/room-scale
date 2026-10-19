"use client";

import { useState } from "react";
import { PRODUCT_CATEGORY_LABELS } from "@/components/product-form";
import { PanelHeader } from "@/components/panel-header";
import { useScrollFade } from "@/components/scroll-fade";
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
  const scroll = useScrollFade();
  // Folded away when the apartment list needs the room. A fact about this
  // sitting, not the project, so it is not saved.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex max-h-[42vh] min-h-0 flex-col gap-4 border-t border-black/10 p-5 dark:border-white/15">
      <PanelHeader
        title="Furniture"
        action="New product"
        onAction={() => onSelect({ kind: "new-product" })}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((was) => !was)}
      />

      {collapsed ? null : products.length === 0 ? (
        <p className="px-1 text-[13px] leading-relaxed opacity-60">
          Nothing yet. Add the first thing you are thinking of buying, or paste
          the page you found it on.
        </p>
      ) : (
        <div
          {...scroll}
          className={`-mx-2 min-h-0 overflow-y-auto px-2 ${scroll.className}`}
        >
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
                  <button
                    type="button"
                    aria-label={`Place ${product.name} in the room`}
                    onClick={() => onPlace(product)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate">{product.name}</span>
                    <span className="block truncate text-[13px] opacity-55">
                      {product.category === "other"
                        ? ""
                        : `${PRODUCT_CATEGORY_LABELS[product.category]} · `}
                      {formatLength(product.footprint.widthMeters, unit)} ×{" "}
                      {formatLength(product.footprint.depthMeters, unit)}
                      {product.priceCents === 0
                        ? ""
                        : ` · ${formatCents(product.priceCents)}`}
                      {placed === 0 ? "" : ` · ${placed} placed`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
