"use client";

import { PURCHASE_STATUS_LABELS } from "@/components/product-form";
import type { FurnitureProduct } from "@/domain/furniture";
import { formatCents, formatLength, type DisplayUnit } from "@/domain/units";

export type ProductListProps = {
  products: readonly FurnitureProduct[];
  unit: DisplayUnit;
  onEdit: (product: FurnitureProduct) => void;
  onRemove: (product: FurnitureProduct) => void;
};

/**
 * The catalogue as a table — the non-3D representation of what is being bought,
 * and the one that has to stay readable when there is no room drawn at all.
 */
export function ProductList({
  products,
  unit,
  onEdit,
  onRemove,
}: ProductListProps) {
  if (products.length === 0) {
    return (
      <p className="text-sm opacity-60">
        Nothing yet. Add the first thing you are thinking of buying — its
        dimensions, its price, and the page you found it on.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Furniture products, with dimensions, price, and purchase status
        </caption>
        <thead>
          <tr className="border-b border-black/10 text-left dark:border-white/15">
            <Th>Name</Th>
            <Th>Size (W × D × H)</Th>
            <Th>Price</Th>
            <Th>Status</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr
              key={product.id}
              className="border-b border-black/5 align-top dark:border-white/10"
            >
              <Td>
                <span className="font-medium">{product.name}</span>
                {product.retailer === "" ? null : (
                  <span className="block text-xs opacity-60">
                    {product.retailer}
                  </span>
                )}
                {product.productUrl === "" ? null : (
                  <a
                    href={product.productUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
                  >
                    {`Open ${product.name} product page`}
                  </a>
                )}
              </Td>
              <Td>
                <span className="tabular-nums">
                  {formatSize(product, unit)}
                </span>
              </Td>
              <Td>
                <span className="tabular-nums">
                  {formatCents(product.priceCents)}
                </span>
              </Td>
              <Td>{PURCHASE_STATUS_LABELS[product.purchaseStatus]}</Td>
              <Td>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => onEdit(product)}
                    aria-label={`Edit ${product.name}`}
                    className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(product)}
                    aria-label={`Remove ${product.name}`}
                    className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
                  >
                    Remove
                  </button>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatSize(product: FurnitureProduct, unit: DisplayUnit): string {
  return [
    product.footprint.widthMeters,
    product.footprint.depthMeters,
    product.heightMeters,
  ]
    .map((meters) => formatLength(meters, unit))
    .join(" × ");
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="py-2 pr-4 text-xs font-medium uppercase tracking-[0.15em] opacity-60"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-3 pr-4">{children}</td>;
}
