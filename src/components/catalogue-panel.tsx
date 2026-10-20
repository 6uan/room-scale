"use client";

import { useState, type MouseEvent } from "react";
import { ContextMenu } from "@/components/context-menu";
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
  /** Removes the product, and every copy of it standing in any layout. */
  onDelete?: (product: FurnitureProduct) => void;
  /** Folded away, when the workspace is keeping track; otherwise its own. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Free to take the sidebar, when the apartment list has folded away. */
  unbounded?: boolean;
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
  onDelete,
  collapsed: collapsedProp,
  onToggleCollapsed,
  unbounded = false,
}: CataloguePanelProps) {
  const scroll = useScrollFade();
  // Folded away when the apartment list needs the room. A fact about this
  // sitting, not the project, so it is not saved.
  const [ownCollapsed, setOwnCollapsed] = useState(false);
  /** The row a right-click opened a menu on, and where. */
  const [menu, setMenu] = useState<{
    product: FurnitureProduct;
    x: number;
    y: number;
  } | null>(null);
  const collapsed = collapsedProp ?? ownCollapsed;
  const toggleCollapsed =
    onToggleCollapsed ?? (() => setOwnCollapsed((was) => !was));

  return (
    <div
      className={`flex min-h-0 min-w-0 flex-col border-t border-black/10 px-3 pt-3 pb-3 dark:border-white/15 ${
        unbounded ? "" : "max-h-[42vh]"
      }`}
    >
      <PanelHeader
        title="Furniture"
        action="New product"
        onAction={() => onSelect({ kind: "new-product" })}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      {/* A rule under the header, edge to edge, so where the list scrolls is
          seen. Outside the folding part, which clips what bleeds past it. */}
      {collapsed ? null : (
        <div className="-mx-3 mt-3 border-t border-black/10 dark:border-white/15" />
      )}

      {/*
        Folded by animating a grid row from one share to none, which is the
        one way CSS will animate a height it has not been told. The list
        stays mounted while it folds, inert, so it has something to animate
        and comes back where it was scrolled to.
      */}
      <div
        className="grid min-h-0 transition-[grid-template-rows,opacity] duration-200 ease-out"
        style={{
          // minmax(0, 1fr) rather than 1fr: a plain fr track will not go
          // below its content, which is the whole list, and then nothing
          // inside it ever scrolls.
          gridTemplateRows: collapsed ? "0fr" : "minmax(0, 1fr)",
          opacity: collapsed ? 0 : 1,
        }}
        inert={collapsed}
        aria-hidden={collapsed}
      >
        {/* The gap under the header lives in here, so it folds with the list. */}
        <div className="-mx-3 flex min-h-0 flex-col overflow-hidden">
          {products.length === 0 ? (
            <p className="px-1 text-[13px] leading-relaxed opacity-60">
              Nothing yet. Add the first thing you are thinking of buying, or
              paste the page you found it on.
            </p>
          ) : (
            <div
              {...scroll}
              className={`min-h-0 overflow-y-auto px-3 pt-3 ${scroll.className}`}
            >
              <ul className="flex flex-col gap-1">
                {products.map((product) => {
                  const placed = countPlaced(instances, product.id);
                  return (
                    <li
                      key={product.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          PRODUCT_DRAG_TYPE,
                          product.id,
                        );
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      onContextMenu={(event: MouseEvent<HTMLLIElement>) => {
                        event.preventDefault();
                        setMenu({
                          product,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      className={`group flex min-w-0 cursor-grab items-center gap-1 rounded-lg px-2.5 py-2 text-sm transition-colors active:cursor-grabbing ${
                        isSelected(selection, "product", product.id)
                          ? "bg-black/10 dark:bg-white/15"
                          : "hover:bg-black/5 dark:hover:bg-white/10"
                      }`}
                    >
                      <button
                        type="button"
                        aria-label={`Place ${product.name} in the room`}
                        onClick={() => onPlace(product)}
                        // The hand: a button's own cursor is the arrow, which
                        // hid the row's say that it can be dragged.
                        className="min-w-0 flex-1 cursor-grab text-left active:cursor-grabbing"
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
      </div>
      {menu === null ? null : (
        <ContextMenu
          at={menu}
          label={menu.product.name}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Edit",
              onSelect: () =>
                onSelect({ kind: "product", id: menu.product.id }),
            },
            ...(onDelete === undefined
              ? []
              : [
                  {
                    label: placedLabel(countPlaced(instances, menu.product.id)),
                    danger: true,
                    onSelect: () => onDelete(menu.product),
                  },
                ]),
          ]}
        />
      )}
    </div>
  );
}

/** What deleting does, said before it is done: a placed product goes too. */
function placedLabel(placed: number): string {
  return placed === 0
    ? "Delete"
    : placed === 1
      ? "Delete, and take it out of the room"
      : `Delete, and take ${placed} out of the room`;
}
