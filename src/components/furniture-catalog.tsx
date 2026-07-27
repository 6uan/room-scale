"use client";

import { useState } from "react";
import { ProductForm } from "@/components/product-form";
import { ProductList } from "@/components/product-list";
import { UnitToggle } from "@/components/unit-toggle";
import {
  countPlaced,
  createProduct,
  type FurnitureProduct,
} from "@/domain/furniture";
import { nextId } from "@/domain/project";
import { formatCents, sumCents } from "@/domain/units";
import { useProjectStore } from "@/state/project-store";

/**
 * The catalogue: everything under consideration, with what it costs and where
 * it came from.
 *
 * The products come from the project store, so they are saved and shared with
 * the room view. Placing any of them in the room is the step after next.
 */
export function FurnitureCatalog() {
  const products = useProjectStore((state) => state.project.products);
  const unit = useProjectStore((state) => state.project.displayUnit);
  const setProducts = useProjectStore((state) => state.setProducts);
  const setUnit = useProjectStore((state) => state.setDisplayUnit);
  const instances = useProjectStore((state) => state.project.instances);
  const [editing, setEditing] = useState<FurnitureProduct | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Derived from the products already saved, so a reload cannot hand a new
  // product the id of an existing one.
  const blankId = nextId(
    "product",
    products.map((product) => product.id),
  );

  function addProduct(product: FurnitureProduct): void {
    // Adding changes the derived blank id, which changes the form's key, which
    // resets it to blank.
    setProducts([...products, product]);
  }

  function saveEdit(product: FurnitureProduct): void {
    setProducts(
      products.map((existing) =>
        existing.id === product.id ? product : existing,
      ),
    );
    setEditing(null);
  }

  function removeProduct(product: FurnitureProduct): void {
    // Refused rather than cascaded, per ADR 0003. Deleting the product would
    // leave placements pointing at nothing, and silently removing them from
    // the room is a bigger thing to do than was asked for.
    const placed = countPlaced(instances, product.id);
    if (placed > 0) {
      setRefusal(
        `${product.name} is still in the room ${placed === 1 ? "once" : `${placed} times`}. ` +
          `Take it out of the room before removing it from the catalogue.`,
      );
      return;
    }

    setRefusal(null);
    setProducts(products.filter((existing) => existing.id !== product.id));
    if (editing?.id === product.id) {
      setEditing(null);
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="add-product" className="flex flex-col gap-6">
        <h2 id="add-product" className="text-xl font-semibold tracking-tight">
          {editing === null ? "Add a product" : `Edit ${editing.name}`}
        </h2>

        <UnitToggle unit={unit} onUnitChange={setUnit} />

        <ProductForm
          // Remounting on the id resets the draft when the target changes.
          key={editing?.id ?? blankId}
          initial={editing ?? createProduct(blankId)}
          unit={unit}
          submitLabel={editing === null ? "Add product" : "Save changes"}
          onSave={editing === null ? addProduct : saveEdit}
          onCancel={editing === null ? undefined : () => setEditing(null)}
        />
      </section>

      <section aria-labelledby="catalogue" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="catalogue" className="text-xl font-semibold tracking-tight">
            Catalogue
          </h2>
          {products.length === 0 ? null : (
            <p className="text-sm opacity-60">
              {products.length} {products.length === 1 ? "product" : "products"}{" "}
              ·{" "}
              <span className="tabular-nums">
                {formatCents(
                  sumCents(products.map((product) => product.priceCents)),
                )}
              </span>{" "}
              counting one of each
            </p>
          )}
        </div>

        {refusal === null ? null : (
          <p role="alert" className="text-sm text-red-600">
            {refusal}
          </p>
        )}

        <ProductList
          products={products}
          unit={unit}
          onEdit={setEditing}
          onRemove={removeProduct}
        />
      </section>
    </div>
  );
}
