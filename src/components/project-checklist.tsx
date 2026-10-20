"use client";

import { ExternalLink } from "lucide-react";
import { PURCHASE_STATUS_LABELS, SelectBox } from "@/components/product-form";
import {
  PURCHASE_STATUSES,
  type FurnitureProduct,
  type PurchaseStatus,
} from "@/domain/furniture";
import {
  activeInstances,
  activeLayout,
  buildChecklist,
  checklistByRoom,
  type Checklist,
  type Layout,
} from "@/domain/project";
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
  const instances = useProjectStore((state) => activeInstances(state.project));
  const floor = useProjectStore((state) => state.project.floor);
  const unit = useProjectStore((state) => state.project.displayUnit);
  const layouts = useProjectStore((state) => state.project.layouts);
  const current = useProjectStore((state) => activeLayout(state.project));
  const setProducts = useProjectStore((state) => state.setProducts);

  const checklist = buildChecklist(products, instances);
  const rooms = checklistByRoom(products, instances, floor);

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
          in the furniture list, then place it in the room — the list counts
          what is standing in the plan, not what is in the list.
        </p>
        <Unplaced products={checklist.unplaced} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Everything placed, room by room, with quantity, price, and purchase
          status
        </caption>
        <thead>
          <tr className="text-left">
            <Th>Item</Th>
            <Th align="right">Quantity</Th>
            <Th align="right">Price</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        {rooms.map(({ room, checklist: inRoom }) => (
          <tbody
            key={room?.id ?? "outside"}
            aria-label={room?.name ?? "Outside every room"}
          >
            <tr className="border-t border-black/10 dark:border-white/15">
              <th
                scope="rowgroup"
                colSpan={4}
                className="pt-5 pb-2 text-left font-medium"
              >
                {room?.name ?? "Outside every room"}
              </th>
            </tr>
            {inRoom.lines.map(({ product, quantity, lineCents }) => (
              <tr key={product.id} className="align-top">
                <Td>
                  <span className="font-medium">{product.name}</span>
                  {product.productUrl === "" ? null : (
                    <a
                      href={product.productUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open ${product.name}`}
                      title={`Open ${product.name}`}
                      className="ml-1.5 inline-block align-[-2px] opacity-60 hover:opacity-100 print:hidden"
                    >
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </a>
                  )}
                  <span className="block text-xs opacity-60">
                    {formatLength(product.footprint.widthMeters, unit)} ×{" "}
                    {formatLength(product.footprint.depthMeters, unit)}
                    {product.retailer === "" ? null : ` · ${product.retailer}`}
                    {quantity > 1
                      ? ` · ${quantity} × ${formatCents(product.priceCents)}`
                      : null}
                  </span>
                  {/* Printed, a link that cannot be clicked is worth its address. */}
                  {product.productUrl === "" ? null : (
                    <span className="hidden text-xs opacity-60 print:block">
                      {product.productUrl}
                    </span>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{quantity}</Td>
                <Td className="text-right tabular-nums">
                  {formatCents(lineCents)}
                </Td>
                <Td>
                  <div className="print:hidden">
                    <SelectBox
                      label={`${product.name} status`}
                      value={product.purchaseStatus}
                      options={PURCHASE_STATUSES}
                      labels={PURCHASE_STATUS_LABELS}
                      onValueChange={(status) => setStatus(product, status)}
                      size="small"
                    />
                  </div>
                  <span className="hidden text-xs print:inline">
                    {PURCHASE_STATUS_LABELS[product.purchaseStatus]}
                  </span>
                </Td>
              </tr>
            ))}
            {/* A receipt's department subtotal: what this room comes to. */}
            <tr>
              <td
                colSpan={2}
                className="pt-1 pb-4 text-right text-xs opacity-60"
              >
                {room?.name ?? "Outside"} total
              </td>
              <td className="px-2 pt-1 pb-4 text-right tabular-nums">
                {formatCents(inRoom.totalCents)}
              </td>
              <td />
            </tr>
          </tbody>
        ))}
      </table>

      <Totals checklist={checklist} />
      <Comparison layouts={layouts} activeId={current.id} products={products} />
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
      <Total label="Total" value={formatCents(checklist.totalCents)} />
      <Total label="Owned" value={formatCents(checklist.committedCents)} />
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

/**
 * What the other arrangements would cost.
 *
 * The reason to keep a second layout is to find out whether the cheaper sofa
 * makes a room you would rather live in, and that is a question with two
 * numbers in it. One arrangement is priced above in full; the rest are here as
 * the totals to weigh it against.
 */
function Comparison({
  layouts,
  activeId,
  products,
}: {
  layouts: readonly Layout[];
  activeId: string;
  products: readonly FurnitureProduct[];
}) {
  if (layouts.length < 2) {
    return null;
  }

  const priced = layouts.map((layout) => ({
    layout,
    checklist: buildChecklist(products, layout.instances),
  }));
  const cheapest = Math.min(
    ...priced.map(({ checklist }) => checklist.totalCents),
  );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Against the other layouts</h3>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/10 text-left dark:border-white/15">
            <Th>Layout</Th>
            <Th>Pieces</Th>
            <Th>Total</Th>
            <Th>Still to buy</Th>
          </tr>
        </thead>
        <tbody>
          {priced.map(({ layout, checklist }) => (
            <tr
              key={layout.id}
              className="border-b border-black/5 dark:border-white/10"
            >
              <Td>
                <span
                  className={layout.id === activeId ? "font-medium" : undefined}
                >
                  {layout.name}
                </span>
                {layout.id === activeId ? (
                  <span className="ml-2 text-xs opacity-60">priced above</span>
                ) : null}
              </Td>
              <Td className="tabular-nums">{layout.instances.length}</Td>
              <Td className="tabular-nums">
                {formatCents(checklist.totalCents)}
                {/* Named, not just formatted: a column of numbers does not
                    say which one is the bargain. */}
                {checklist.totalCents === cheapest && layouts.length > 1 ? (
                  <span className="ml-2 text-xs opacity-60">least</span>
                ) : null}
              </Td>
              <Td className="tabular-nums">
                {formatCents(checklist.remainingCents)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
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
        In the furniture list but not placed, so not counted:{" "}
        {products.map((product) => product.name).join(", ")}.
      </p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-2 py-2 text-xs font-medium opacity-60 first:pl-0 last:pr-0 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
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
  return (
    <td className={`px-2 py-2 first:pl-0 last:pr-0 ${className}`}>
      {children}
    </td>
  );
}
