import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FurnitureProduct, ProductCategory } from "@/domain/furniture";
import { CataloguePanel } from "./catalogue-panel";

function product(
  id: string,
  name: string,
  category: ProductCategory,
): FurnitureProduct {
  return {
    id,
    name,
    retailer: "",
    productUrl: "",
    priceCents: 0,
    purchaseStatus: "wanted",
    category,
    footprint: { widthMeters: 1, depthMeters: 1 },
    heightMeters: 0.5,
  };
}

const products = [
  product("sofa", "Sofa", "seating"),
  product("chair", "Chair", "seating"),
  product("lamp", "Arc lamp", "lighting"),
];

function renderPanel(list: readonly FurnitureProduct[], onPlace = vi.fn()) {
  return render(
    <CataloguePanel
      products={list}
      instances={[]}
      unit="metric"
      selection={null}
      onSelect={() => {}}
      onPlace={onPlace}
    />,
  );
}

function listed(): string[] {
  return screen
    .getAllByRole("button", { name: /^Place / })
    .map((button) => button.getAttribute("aria-label") ?? "");
}

describe("CataloguePanel category filter", () => {
  it("offers All and only the categories in use, each with its count", () => {
    renderPanel(products);
    const filter = screen.getByRole("group", { name: "Show furniture" });
    expect(
      within(filter)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["All, 3", "Seating, 2", "Lighting, 1"]);
    expect(
      within(filter).getByRole("button", { name: "All, 3" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("narrows the list to one category, and back", async () => {
    const user = userEvent.setup();
    renderPanel(products);
    await user.click(screen.getByRole("button", { name: "Seating, 2" }));
    expect(listed()).toEqual([
      "Place Sofa in the room",
      "Place Chair in the room",
    ]);
    await user.click(screen.getByRole("button", { name: "All, 3" }));
    expect(listed()).toHaveLength(3);
  });

  it("places from a narrowed list", async () => {
    const user = userEvent.setup();
    const onPlace = vi.fn();
    renderPanel(products, onPlace);
    await user.click(screen.getByRole("button", { name: "Lighting, 1" }));
    await user.click(
      screen.getByRole("button", { name: "Place Arc lamp in the room" }),
    );
    expect(onPlace).toHaveBeenCalledWith(products[2]);
  });

  it("shows no filter while there is only one category", () => {
    renderPanel(products.slice(0, 2));
    expect(screen.queryByRole("group", { name: "Show furniture" })).toBeNull();
  });

  it("falls back to All when the chosen category empties", async () => {
    const user = userEvent.setup();
    const { rerender } = renderPanel(products);
    await user.click(screen.getByRole("button", { name: "Lighting, 1" }));
    const rest = [...products.slice(0, 2), product("rug", "Rug", "rug")];
    rerender(
      <CataloguePanel
        products={rest}
        instances={[]}
        unit="metric"
        selection={null}
        onSelect={() => {}}
        onPlace={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "All, 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(listed()).toHaveLength(3);
  });
});
