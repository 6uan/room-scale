import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { projectWithLivingRoom } from "@/domain/project/fixtures";
import { withPartGroup, withParts, type Room } from "@/domain/room";
import { Inspector, type InspectorProps } from "./inspector";

/** The living room with a closet of two sections beside it. */
function roomWithCloset(): Room {
  const base = projectWithLivingRoom().floor.rooms[0];
  if (base === undefined) {
    throw new Error("a new project starts with a room");
  }
  const section = (id: string, zMeters: number) => ({
    id,
    origin: { xMeters: 10, zMeters },
    widthMeters: 1,
    depthMeters: 1,
    rotationRadians: 0,
    openWalls: [],
  });
  return withPartGroup(
    withParts(base, [
      ...base.parts,
      section("room-1-part-2", 0),
      section("room-1-part-3", 1),
    ]),
    { id: "g1", name: "Closet B" },
    ["room-1-part-2", "room-1-part-3"],
  );
}

function renderInspector(overrides: Partial<InspectorProps>) {
  const room = roomWithCloset();
  const floor = { ...projectWithLivingRoom().floor, rooms: [room] };
  const props: InspectorProps = {
    floor,
    furniture: [],
    products: [],
    unit: "imperial",
    selection: { kind: "room", id: room.id },
    onSelect: vi.fn(),
    onFloorChange: vi.fn(),
    underlay: null,
    onAddPlanImage: vi.fn(),
    onUnderlayChange: vi.fn(),
    onRoomChange: vi.fn(),
    onGestureEnd: vi.fn(),
    onRoomRemove: vi.fn(),
    drawingSectionOf: null,
    onDrawSection: vi.fn(),
    onAddOpening: vi.fn(),
    placingOpening: null,
    onOpeningChange: vi.fn(),
    onOpeningRemove: vi.fn(),
    onInstanceChange: vi.fn(),
    onInstanceRemove: vi.fn(),
    onGroupRemove: vi.fn(),
    onProductSave: vi.fn(),
    onProductRemove: vi.fn(),
    onRoundPositions: vi.fn(),
    productProblem: null,
    newProductId: "product-new",
    ...overrides,
  };
  render(<Inspector {...props} />);
  return { room, props };
}

async function menuItems(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Living room actions" }));
  return within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
}

describe("the room panel's menu", () => {
  it("offers only the room when the room itself is selected", async () => {
    const user = userEvent.setup();
    renderInspector({});

    expect(await menuItems(user)).toEqual([
      "Round to whole inches",
      "Delete Living room",
    ]);
    // One menu, and no trash can anywhere else in the panel.
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("names the section and the closet it is in, smallest first", async () => {
    const user = userEvent.setup();
    renderInspector({
      selection: { kind: "room-part", roomId: "room-1", id: "room-1-part-3" },
    });

    expect(await menuItems(user)).toEqual([
      "Round to whole inches",
      "Delete Section 3",
      "Delete Closet B",
      "Delete Living room",
    ]);
  });

  it("deletes the whole closet and goes back to the room", async () => {
    const user = userEvent.setup();
    const { props } = renderInspector({
      selection: { kind: "section-group", roomId: "room-1", id: "g1" },
    });

    await menuItems(user);
    await user.click(screen.getByRole("menuitem", { name: "Delete Closet B" }));

    const changed = vi.mocked(props.onRoomChange).mock.lastCall?.[0];
    expect(changed?.parts.map((part) => part.id)).toEqual(["room-1-part-1"]);
    expect(changed?.partGroups).toBeUndefined();
    expect(props.onSelect).toHaveBeenCalledWith({ kind: "room", id: "room-1" });
    expect(props.onRoomRemove).not.toHaveBeenCalled();
  });

  it("deletes the room only from its own item", async () => {
    const user = userEvent.setup();
    const { room, props } = renderInspector({});

    await menuItems(user);
    await user.click(
      screen.getByRole("menuitem", { name: "Delete Living room" }),
    );

    expect(props.onRoomRemove).toHaveBeenCalledWith(room);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on a second press of the button, and on Escape", async () => {
    const user = userEvent.setup();
    renderInspector({});
    const button = screen.getByRole("button", { name: "Living room actions" });

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await user.click(button);
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(button);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });
});

describe("the opening panel's menu", () => {
  it("deletes the opening by its name", async () => {
    const user = userEvent.setup();
    const { room, props } = renderInspector({
      selection: { kind: "opening", roomId: "room-1", id: "door-1" },
    });
    const door = room.openings.find((one) => one.id === "door-1");

    await user.click(
      screen.getByRole("button", { name: "Living room door 1 actions" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Delete Living room door 1" }),
    );

    expect(props.onOpeningRemove).toHaveBeenCalledWith(room, door);
  });
});

describe("rounding from the menu", () => {
  it("rounds the room, named in the unit on screen", async () => {
    const user = userEvent.setup();
    const { props } = renderInspector({});

    await menuItems(user);
    await user.click(
      screen.getByRole("menuitem", { name: "Round to whole inches" }),
    );
    expect(props.onRoundPositions).toHaveBeenCalledWith(["room-1"], []);
  });

  it("says centimeters in metric", async () => {
    const user = userEvent.setup();
    renderInspector({ unit: "metric" });

    expect(await menuItems(user)).toContain("Round to whole centimeters");
  });
});
