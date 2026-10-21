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
import { withGroup, withoutGroup, type PieceGroup } from "@/domain/project";

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

  it("folds a room up to its own row, and opens it again", async () => {
    const user = userEvent.setup();
    render(<LayersHarness />);
    const door = screen.getByRole("button", { name: "Door 1" });
    expect(door).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Collapse Living room" }),
    );

    // Folded: what was under the room is out of reach, the room itself is not.
    expect(screen.queryByRole("button", { name: "Door 1" })).toBeNull();
    expect(screen.getByRole("button", { name: "Living room" })).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Expand Living room" }),
    );
    expect(screen.getByRole("button", { name: "Door 1" })).toBeVisible();
  });

  it("renames an opening and a section in their rows", async () => {
    const user = userEvent.setup();
    render(<LayersHarness compound />);

    await user.dblClick(screen.getByRole("button", { name: "Door 1" }));
    const door = screen.getByRole("textbox", { name: "Rename Door 1" });
    await user.clear(door);
    await user.type(door, "Front door{Enter}");
    expect(screen.getByRole("button", { name: "Front door" })).toBeVisible();

    await user.dblClick(screen.getByRole("button", { name: "Section 2" }));
    const section = screen.getByRole("textbox", { name: "Rename Section 2" });
    await user.clear(section);
    await user.type(section, "Closet{Enter}");
    expect(screen.getByRole("button", { name: "Closet" })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
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
      purchaseStatus: "wanted",
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

  it("renames a piece in its row, and offers it from the menu", async () => {
    const user = userEvent.setup();
    const onRenamePiece = vi.fn();
    render(
      <ApartmentLayers
        floor={projectWithLivingRoom().floor}
        furniture={[rug, lamp]}
        selection={null}
        troubledIds={new Set()}
        onSelect={() => undefined}
        onRoomChange={() => undefined}
        onAddRoom={() => undefined}
        onRenamePiece={onRenamePiece}
      />,
    );

    await user.dblClick(screen.getByRole("button", { name: "Rug" }));
    const field = screen.getByLabelText("Rename Rug");
    await user.clear(field);
    await user.type(field, "Hall rug{Enter}");
    expect(onRenamePiece).toHaveBeenCalledWith("i1", "Hall rug");
    // The row is a row again, and nothing else was renamed.
    expect(screen.getByRole("button", { name: "Rug" })).toBeVisible();

    const row = screen.getByRole("button", { name: "Lamp" }).closest("li");
    if (row === null) {
      throw new Error("the lamp has a row");
    }
    fireEvent.contextMenu(row, { clientX: 40, clientY: 40 });
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.getByLabelText("Rename Lamp")).toHaveFocus();
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

describe("ApartmentLayers groups", () => {
  const piece = (id: string, name: string): PlacedFurniture => ({
    instance: createInstance(id, name.toLowerCase(), {
      xMeters: 0.5,
      zMeters: 0.5,
    }),
    product: {
      id: name.toLowerCase(),
      name,
      retailer: "",
      productUrl: "",
      priceCents: 0,
      purchaseStatus: "wanted",
      category: "other",
      footprint: { widthMeters: 0.5, depthMeters: 0.5 },
      heightMeters: 0.5,
    },
  });
  const furniture = [
    piece("i1", "Bed"),
    piece("i2", "Lamp"),
    piece("i3", "Rug"),
  ];

  /** The list over a selection and some groups, the way the workspace holds them. */
  function GroupsHarness({
    initialGroups = [],
    onRenameGroup,
    onUngroup,
  }: {
    initialGroups?: readonly PieceGroup[];
    onRenameGroup?: (id: string, name: string) => void;
    onUngroup?: (id: string) => void;
  }) {
    const [selection, setSelection] = useState<Selection>(null);
    const [groups, setGroups] = useState(initialGroups);
    return (
      <ApartmentLayers
        floor={projectWithLivingRoom().floor}
        furniture={furniture}
        selection={selection}
        troubledIds={new Set()}
        onSelect={setSelection}
        onRoomChange={() => undefined}
        onAddRoom={() => undefined}
        groups={groups}
        onGroup={(ids) =>
          setGroups((was) => withGroup(was, `g${was.length + 1}`, ids))
        }
        onUngroup={
          onUngroup ?? ((id) => setGroups((was) => withoutGroup(was, id)))
        }
        onRenameGroup={onRenameGroup}
      />
    );
  }

  const pressed = (name: string) =>
    screen.getByRole("button", { name }).getAttribute("aria-pressed");

  it("selects a range with Shift, and adds or removes one with the command key", async () => {
    const user = userEvent.setup();
    render(<GroupsHarness />);

    await user.click(screen.getByRole("button", { name: "Bed" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("button", { name: "Rug" }));
    await user.keyboard("{/Shift}");
    expect([pressed("Bed"), pressed("Lamp"), pressed("Rug")]).toEqual([
      "true",
      "true",
      "true",
    ]);

    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("button", { name: "Lamp" }));
    await user.keyboard("{/Meta}");
    expect([pressed("Bed"), pressed("Lamp"), pressed("Rug")]).toEqual([
      "true",
      "false",
      "true",
    ]);
  });

  it("groups the selection from the menu, and lists the group under its name", async () => {
    const user = userEvent.setup();
    render(<GroupsHarness />);

    await user.click(screen.getByRole("button", { name: "Bed" }));
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("button", { name: "Lamp" }));
    await user.keyboard("{/Meta}");
    const row = screen.getByRole("button", { name: "Lamp" }).closest("li");
    if (row === null) {
      throw new Error("the lamp has a row");
    }
    fireEvent.contextMenu(row, { clientX: 40, clientY: 40 });
    await user.click(screen.getByRole("menuitem", { name: "Group 2 pieces" }));

    const group = screen.getByRole("button", { name: "Group 1" });
    expect(group).toHaveAttribute("aria-pressed", "true");
    // Picking one piece out of it leaves the group row unpressed.
    await user.click(screen.getByRole("button", { name: "Rug" }));
    expect(pressed("Group 1")).toBe("false");
    await user.click(group);
    expect([pressed("Bed"), pressed("Lamp"), pressed("Rug")]).toEqual([
      "true",
      "true",
      "false",
    ]);
  });

  it("takes a piece dropped on the group's row into the group, lit while held over", () => {
    const onAddToGroup = vi.fn();
    render(
      <ApartmentLayers
        floor={projectWithLivingRoom().floor}
        furniture={furniture}
        selection={null}
        troubledIds={new Set()}
        onSelect={() => undefined}
        onRoomChange={() => undefined}
        onAddRoom={() => undefined}
        onReorder={() => undefined}
        groups={[{ id: "g1", name: "Group 1", instanceIds: ["i1", "i2"] }]}
        onAddToGroup={onAddToGroup}
      />,
    );
    const rugRow = screen.getByRole("button", { name: "Rug" }).closest("li");
    const groupButton = screen.getByRole("button", { name: "Group 1" });
    if (rugRow === null) {
      throw new Error("the rug has a row");
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

    fireEvent.dragStart(rugRow, { dataTransfer });
    fireEvent.dragOver(groupButton, { dataTransfer });
    expect(groupButton.parentElement?.className).toContain("bg-blue-500/20");
    fireEvent.drop(groupButton, { dataTransfer });

    expect(onAddToGroup).toHaveBeenCalledWith("g1", "i3");
    expect(groupButton.parentElement?.className).not.toContain(
      "bg-blue-500/20",
    );
  });

  it("folds a group, renames it, and ungroups it", async () => {
    const user = userEvent.setup();
    const onRenameGroup = vi.fn();
    const onUngroup = vi.fn();
    render(
      <GroupsHarness
        initialGroups={[
          { id: "g1", name: "Group 1", instanceIds: ["i1", "i2"] },
        ]}
        onRenameGroup={onRenameGroup}
        onUngroup={onUngroup}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Collapse Group 1" }));
    expect(screen.queryByRole("button", { name: "Bed" })).toBeNull();
    expect(screen.getByRole("button", { name: "Rug" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Expand Group 1" }));

    await user.dblClick(screen.getByRole("button", { name: "Group 1" }));
    const field = screen.getByLabelText("Rename Group 1");
    await user.clear(field);
    await user.type(field, "Bedside{Enter}");
    expect(onRenameGroup).toHaveBeenCalledWith("g1", "Bedside");

    const row = screen.getByRole("button", { name: "Group 1" }).closest("li");
    if (row === null) {
      throw new Error("the group has a row");
    }
    fireEvent.contextMenu(row, { clientX: 40, clientY: 40 });
    await user.click(screen.getByRole("menuitem", { name: "Ungroup" }));
    expect(onUngroup).toHaveBeenCalledWith("g1");
  });
});
