import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { FurnitureInstance, FurnitureProduct } from "@/domain/furniture";
import { createRoom, withRooms } from "@/domain/room";
import { resetProjectStore, useProjectStore } from "@/state/project-store";
import { ProjectChecklist } from "./project-checklist";

beforeEach(resetProjectStore);

function product(
  id: string,
  name: string,
  priceCents: number,
): FurnitureProduct {
  return {
    id,
    name,
    retailer: "Article",
    productUrl: "",
    priceCents,
    purchaseStatus: "considering",
    category: "other",
    footprint: { widthMeters: 1, depthMeters: 1 },
    heightMeters: 0.5,
  };
}

function instance(id: string, productId: string): FurnitureInstance {
  return {
    id,
    productId,
    position: { xMeters: 1, zMeters: 1 },
    rotationRadians: 0,
  };
}

/** A sofa and two pillows in the room, and a rug in the catalogue only. */
function seed() {
  useProjectStore
    .getState()
    .setProducts([
      product("sofa", "Sectional", 199900),
      product("pillow", "Olive pillow", 4500),
      product("rug", "Rug", 34900),
    ]);
  useProjectStore
    .getState()
    .setInstances([
      instance("i1", "sofa"),
      instance("i2", "pillow"),
      instance("i3", "pillow"),
    ]);
}

/** The figure printed under one of the three totals. */
function amountFor(label: RegExp): string {
  const term = screen.getByText(label);
  return term.parentElement?.querySelector("dd")?.textContent ?? "";
}

describe("ProjectChecklist", () => {
  it("says there is nothing to buy for an empty room", () => {
    render(<ProjectChecklist />);

    expect(screen.getByText(/Nothing is in the room yet/)).toBeInTheDocument();
  });

  it("counts each copy standing in the room", () => {
    seed();
    render(<ProjectChecklist />);

    const pillow = screen.getByRole("row", { name: /Olive pillow/ });
    expect(within(pillow).getByText("2")).toBeInTheDocument();
    // 2 × $45.00.
    expect(within(pillow).getByText("$90.00")).toBeInTheDocument();
  });

  it("totals what is in the room, and nothing else", () => {
    seed();
    render(<ProjectChecklist />);

    // 1999.00 + 2 × 45.00. The rug is in the catalogue but not in the room.
    expect(amountFor(/Total/)).toBe("$2,089.00");
    expect(
      screen.getByText(/not placed, so not counted: Rug/),
    ).toBeInTheDocument();
  });

  it("owes the whole total until something is bought", () => {
    seed();
    render(<ProjectChecklist />);

    expect(amountFor(/Still to buy/)).toBe("$2,089.00");
    expect(amountFor(/Ordered or already owned/)).toBe("$0.00");
  });

  it("changes what is still owed when a piece is marked as bought", async () => {
    const user = userEvent.setup();
    seed();
    render(<ProjectChecklist />);

    await user.selectOptions(
      screen.getByLabelText("Sectional status"),
      "owned",
    );

    expect(amountFor(/Ordered or already owned/)).toBe("$1,999.00");
    expect(amountFor(/Still to buy/)).toBe("$90.00");
    // Buying it does not change what the room costs.
    expect(amountFor(/Total/)).toBe("$2,089.00");
  });

  it("counts an order as money already spent", async () => {
    const user = userEvent.setup();
    seed();
    render(<ProjectChecklist />);

    await user.selectOptions(
      screen.getByLabelText("Olive pillow status"),
      "ordered",
    );

    expect(amountFor(/Ordered or already owned/)).toBe("$90.00");
    expect(amountFor(/Still to buy/)).toBe("$1,999.00");
  });

  it("keeps the status it is given, so the catalogue agrees with the list", async () => {
    const user = userEvent.setup();
    seed();
    render(<ProjectChecklist />);

    await user.selectOptions(
      screen.getByLabelText("Sectional status"),
      "owned",
    );

    const stored = useProjectStore
      .getState()
      .project.products.find((one) => one.id === "sofa");
    expect(stored?.purchaseStatus).toBe("owned");
  });

  it("deals the list out by room, with each room's own total", () => {
    seed();
    const state = useProjectStore.getState();
    state.setFloor(
      withRooms(state.project.floor, [
        createRoom("bedroom", "Bedroom", { xMeters: 0, zMeters: 0 }),
        createRoom("study", "Study", { xMeters: 4, zMeters: 0 }),
      ]),
    );
    state.setInstances([
      instance("i1", "sofa"),
      { ...instance("i2", "pillow"), position: { xMeters: 5, zMeters: 1 } },
    ]);
    render(<ProjectChecklist />);

    const bedroom = screen.getByRole("rowgroup", { name: "Bedroom" });
    // The sectional's line, and the room's total, which is the same number.
    expect(within(bedroom).getAllByText("$1,999.00")).toHaveLength(2);
    expect(within(bedroom).queryByText("Olive pillow")).toBeNull();
    const study = screen.getByRole("rowgroup", { name: "Study" });
    expect(within(study).getByText("Olive pillow")).toBeInTheDocument();
  });

  it("opens a product's page from an icon named after it", () => {
    useProjectStore.getState().setProducts([
      {
        ...product("sofa", "Sectional", 199900),
        productUrl: "https://x.test/sofa",
      },
    ]);
    useProjectStore.getState().setInstances([instance("i1", "sofa")]);
    render(<ProjectChecklist />);

    const link = screen.getByRole("link", { name: "Open Sectional" });
    expect(link).toHaveAttribute("href", "https://x.test/sofa");
    expect(link).toHaveTextContent("");
  });

  it("follows the room: taking a piece out changes the bill", () => {
    seed();
    const { rerender } = render(<ProjectChecklist />);
    expect(amountFor(/Total/)).toBe("$2,089.00");

    useProjectStore.getState().setInstances([instance("i1", "sofa")]);
    rerender(<ProjectChecklist />);

    expect(amountFor(/Total/)).toBe("$1,999.00");
  });
});
