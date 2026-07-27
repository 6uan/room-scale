"use client";

import { PURCHASE_STATUS_LABELS } from "@/components/product-form";
import {
  PURCHASE_STATUSES,
  type FurnitureProduct,
  type PurchaseStatus,
} from "@/domain/furniture";
import { buildChecklist, type Checklist } from "@/domain/project";
import { formatCents, formatLength } from "@/domain/units";
import { useProjectStore } from "@/state/project-store";

/**
 * What to buy, what it costs, and what is left to pay for.
 *
 * This is the project without the drawing: a room can be planned, priced, and
 * taken to a shop from this page alone. Quantities are counted from what is
 * standing in the room and totals are added up here, so neither can drift from
 * the layout — there is no stored number to go stale.
 *
 * It is meant to be printed. The navigation and the controls drop away, and
 * what is left is a list with a total.
 */
export function ProjectChecklist() {
  const products = useProjectStore((state) => state.project.products);
  const instances = useProjectStore((state) => state.project.instances);
  const unit = useProjectStore((state) => state.project.displayUnit);
  const setProducts = useProjectStore((state) => state.setProducts);

  const checklist = buildChecklist(products, instances);

  function setStatus(product: FurnitureProduct, status: PurchaseStatus): void {
    setProducts(
      products.map((existing) =>
        existing.id === product.id
          ? { ...existing, purchaseStatus: status }
          : existing,
      ),
    );
  }

  if (checklist.lines.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm opacity-60">
          Nothing is in the room yet, so there is nothing to buy. Add furniture
          in the catalogue, then place it in the room — the list counts what is
          standing in the plan, not what is in the catalogue.
        </p>
        <Unplaced products={checklist.unplaced} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Everything placed in the room, with quantity, price, and purchase
            status
          </caption>
          <thead>
            <tr className="border-b border-black/10 text-left dark:border-white/15">
              <Th>Item</Th>
              <Th>In the room</Th>
              <Th>Each</Th>
              <Th>Line</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {checklist.lines.map(({ product, quantity, lineCents }) => (
              <tr
                key={product.id}
                className="border-b border-black/5 align-top dark:border-white/10"
              >
                <Td>
                  <span className="font-medium">{product.name}</span>
                  <span className="block text-xs opacity-60">
                    {formatLength(product.footprint.widthMeters, unit)} ×{" "}
                    {formatLength(product.footprint.depthMeters, unit)}
                    {product.retailer === "" ? null : ` · ${product.retailer}`}
                  </span>
                  {product.productUrl === "" ? null : (
                    <a
                      href={product.productUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
                    >
                      {/* Printed, a link that cannot be clicked is worth its address. */}
                      <span className="print:hidden">Open {product.name}</span>
                      <span className="hidden print:inline">
                        {product.productUrl}
                      </span>
                    </a>
                  )}
                </Td>
                <Td className="tabular-nums">{quantity}</Td>
                <Td className="tabular-nums">
                  {formatCents(product.priceCents)}
                </Td>
                <Td className="tabular-nums font-medium">
                  {formatCents(lineCents)}
                </Td>
                <Td>
                  <select
                    aria-label={`${product.name} status`}
                    value={product.purchaseStatus}
                    onChange={(event) =>
                      setStatus(product, event.target.value as PurchaseStatus)
                    }
                    className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20 print:hidden"
                  >
                    {PURCHASE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {PURCHASE_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  <span className="hidden text-xs print:inline">
                    {PURCHASE_STATUS_LABELS[product.purchaseStatus]}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Totals checklist={checklist} />
      <Unplaced products={checklist.unplaced} />
    </div>
  );
}

/**
 * The three numbers that matter, and the one that answers "can I afford the
 * rest of this?" is the one in the largest type.
 */
function Totals({ checklist }: { checklist: Checklist }) {
  return (
    <dl className="grid gap-4 border-t border-black/10 pt-5 sm:grid-cols-3 dark:border-white/15">
      <Total
        label="Everything in the room"
        value={formatCents(checklist.totalCents)}
      />
      <Total
        label="Ordered or already owned"
        value={formatCents(checklist.committedCents)}
      />
      <Total
        label="Still to buy"
        value={formatCents(checklist.remainingCents)}
        emphasis
      />
    </dl>
  );
}

function Total({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs uppercase tracking-[0.15em] opacity-60">
        {label}
      </dt>
      <dd
        className={
          emphasis
            ? "text-2xl font-semibold tabular-nums tracking-tight"
            : "text-lg tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** Catalogue products with nothing in the room, so none can quietly vanish. */
function Unplaced({ products }: { products: readonly FurnitureProduct[] }) {
  if (products.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Not in the room</h3>
      <p className="text-xs leading-relaxed opacity-60">
        In the catalogue but not placed, so not counted:{" "}
        {products.map((product) => product.name).join(", ")}.
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="py-2 pr-4 text-xs font-medium opacity-60">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`py-3 pr-4 ${className}`}>{children}</td>;
}
