import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { createInstance, type PlacedFurniture } from "@/domain/furniture";
import { withParts, withRoom, type Floor, type Room } from "@/domain/room";
import type { Selection } from "@/components/selection";
import { ApartmentLayers } from "./apartment-layers";
import { projectWithLivingRoom } from "@/domain/project/fixtures";

function LayersHarness({ compound = false }: { compound?: boolean }) {
  const [floor, setFloor] = useState<Floor>(() => {
    const initial = projectWithLivingRoom().floor;
    const room = initial.rooms[0];
    if (!compound || room === undefined) {
      return initial;
    }
    return {
      ...initial,
      rooms: [
        withParts(room, [
          ...room.parts,
          {
            id: `${room.id}-part-2`,
            origin: { xMeters: 2, zMeters: 2 },
            widthMeters: 2,
            depthMeters: 2,
            rotationRadians: 0,
            openWalls: [],
          },
        ]),
      ],
    };
  });
  const [selection, setSelection] = useState<Selection>(null);

  return (
    <ApartmentLayers
      floor={floor}
      furniture={[]}
      selection={selection}
      troubledIds={new Set()}
      onSelect={setSelection}
      onRoomChange={(room: Room) => setFloor(withRoom(floor, room))}
      onAddRoom={() => undefined}
    />
  );
}

describe("ApartmentLayers room names", () => {
  it("renames a room only after a double-click", async () => {
    const user = userEvent.setup();
    render(<LayersHarness />);

    const room = screen.getByRole("button", { name: "Living room" });
    await user.click(room);
    await user.click(room);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.dblClick(room);
    const name = screen.getByRole("textbox", { name: "Rename Living room" });
    expect(name).toHaveFocus();
    expect(name).toHaveProperty("selectionStart", "Living room".length);
    expect(name).toHaveProperty("selectionEnd", "Living room".length);
    await user.clear(name);
    await user.type(name, "Great room{Enter}");

    expect(
      screen.getByRole("button", { name: "Great room" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("leaves the existing name alone when renaming is cancelled", async () => {
    const user = userEvent.setup();
    render(<LayersHarness />);

    await user.dblClick(screen.getByRole("button", { name: "Living room" }));
    const name = screen.getByRole("textbox", { name: "Rename Living room" });
    await user.clear(name);
    await user.type(name, "Not this{Escape}");

    expect(
      screen.getByRole("button", { name: "Living room" }),
    ).toBeInTheDocument();
  });

  it("lists and selects each opening under the room it belongs to", async () => {
    const user = userEvent.setup();
    render(<LayersHarness />);

    const door = screen.getByRole("button", { name: "Door 1" });
    const window = screen.getByRole("button", { name: "Window 1" });
    expect(door).toBeInTheDocument();
    expect(window).toBeInTheDocument();

    await user.click(window);

    expect(window).toHaveAttribute("aria-pressed", "true");
    expect(door).toHaveAttribute("aria-pressed", "false");
  });

  it("does not repeat the only rectangle as Section 1", () => {
    render(<LayersHarness />);

    expect(
      screen.queryByRole("button", { name: "Section 1" }),
    ).not.toBeInTheDocument();
  });

  it("lists and selects the added sections once the room is compound", async () => {
    const user = userEvent.setup();
    render(<LayersHarness compound />);

    // The first rectangle is the room itself, on the room's own row.
    expect(
      screen.queryByRole("button", { name: "Section 1" }),
    ).not.toBeInTheDocument();
    const section = screen.getByRole("button", { name: "Section 2" });
    await user.click(section);

    expect(section).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Living room" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("ApartmentLayers pieces", () => {
  const rug: PlacedFurniture = {
    instance: createInstance("i1", "rug", { xMeters: 0, zMeters: 0 }),
    product: {
      id: "rug",
      name: "Rug",
      retailer: "",
      productUrl: "",
      priceCents: 0,
      purchaseStatus: "considering",
      category: "rug",
      footprint: { widthMeters: 2, depthMeters: 1 },
      heightMeters: 0.01,
    },
  };
  const lamp: PlacedFurniture = {
    instance: createInstance("i2", "lamp", { xMeters: 1, zMeters: 0.5 }),
    product: { ...rug.product, id: "lamp", name: "Lamp" },
  };

  function renderPieces(
    furniture: readonly PlacedFurniture[],
    handlers: {
      onToggleHidden?: (id: string) => void;
      onReorder?: (id: string, beforeId: string) => void;
    },
  ) {
    return render(
      <ApartmentLayers
        floor={projectWithLivingRoom().floor}
        furniture={furniture}
        selection={null}
        troubledIds={new Set()}
        onSelect={() => undefined}
        onRoomChange={() => undefined}
        onAddRoom={() => undefined}
        {...handlers}
      />,
    );
  }

  it("offers to hide a piece, and to show one that is hidden", async () => {
    const user = userEvent.setup();
    const onToggleHidden = vi.fn();
    renderPieces(
      [rug, { ...lamp, instance: { ...lamp.instance, hidden: true } }],
      { onToggleHidden },
    );

    await user.click(screen.getByRole("button", { name: "Hide Rug" }));
    expect(onToggleHidden).toHaveBeenLastCalledWith("i1");
    await user.click(screen.getByRole("button", { name: "Show Lamp" }));
    expect(onToggleHidden).toHaveBeenLastCalledWith("i2");
  });

  it("opens a menu on a right-click, with the piece's own actions", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const onToggleHidden = vi.fn();
    renderPieces([rug], { onToggleHidden });
    // The remove handler goes in through the same props object.
    cleanup();
    render(
      <ApartmentLayers
        floor={projectWithLivingRoom().floor}
        furniture={[rug]}
        selection={null}
        troubledIds={new Set()}
        onSelect={() => undefined}
        onRoomChange={() => undefined}
        onAddRoom={() => undefined}
        onToggleHidden={onToggleHidden}
        onRemove={onRemove}
      />,
    );

    const row = screen.getByRole("button", { name: "Rug" }).closest("li");
    if (row === null) {
      throw new Error("the rug has a row");
    }
    fireEvent.contextMenu(row, { clientX: 40, clientY: 40 });

    const menu = screen.getByRole("menu", { name: "Rug" });
    expect(
      within(menu).getByRole("menuitem", { name: "Edit product" }),
    ).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "Hide" }));
    expect(onToggleHidden).toHaveBeenCalledWith("i1");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.contextMenu(row, { clientX: 40, clientY: 40 });
    await user.click(
      screen.getByRole("menuitem", { name: "Take out of the room" }),
    );
    expect(onRemove).toHaveBeenCalledWith("i1");
  });

  it("reorders by dragging one row onto another", () => {
    const onReorder = vi.fn();
    renderPieces([rug, lamp], { onReorder });
    // Each piece's own row: the room's row above them holds their text too.
    const lampRow = screen.getByRole("button", { name: "Lamp" }).closest("li");
    const rugRow = screen.getByRole("button", { name: "Rug" }).closest("li");
    if (lampRow === null || rugRow === null) {
      throw new Error("each piece has a row");
    }

    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? "",
      get types() {
        return [...data.keys()];
      },
      effectAllowed: "move",
    };
    fireEvent.dragStart(lampRow, { dataTransfer });
    fireEvent.dragOver(rugRow, { dataTransfer });
    fireEvent.drop(rugRow, { dataTransfer });

    expect(onReorder).toHaveBeenCalledWith("i2", "i1");
  });
});
