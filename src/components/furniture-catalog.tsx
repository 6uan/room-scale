"use client";

import { useState } from "react";
import { ProductForm } from "@/components/product-form";
import { ProductList } from "@/components/product-list";
import { UnitToggle } from "@/components/unit-toggle";
import { createProduct, type FurnitureProduct } from "@/domain/furniture";
import { formatCents, sumCents, type DisplayUnit } from "@/domain/units";

/**
 * The catalogue: everything under consideration, with what it costs and where
 * it came from.
 *
 * State lives here as plain serializable data. Saving it arrives at the next
 * roadmap step, and placing any of it in the room at the one after.
 */
export function FurnitureCatalog() {
  const [products, setProducts] = useState<readonly FurnitureProduct[]>([]);
  const [unit, setUnit] = useState<DisplayUnit>("imperial");
  const [editing, setEditing] = useState<FurnitureProduct | null>(null);
  // A counter rather than a random id: this has to work over plain HTTP, where
  // `crypto.randomUUID` is unavailable, and it keeps the tests deterministic.
  // Held as state rather than a ref because the blank form's key derives from
  // it, and a ref read during render is not a thing React guarantees.
  const [nextProductNumber, setNextProductNumber] = useState(1);
  const blankId = `product-${nextProductNumber}`;

  function addProduct(product: FurnitureProduct): void {
    setProducts([...products, product]);
    // Advancing the number changes the form's key, which resets it to blank.
    setNextProductNumber(nextProductNumber + 1);
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
