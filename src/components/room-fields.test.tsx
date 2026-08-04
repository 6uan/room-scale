import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  createRoom,
  DEFAULT_FLOOR,
  primaryRoomPart,
  roomPartRect,
  withParts,
  withRoomLength,
  type Floor,
  type Room,
} from "@/domain/room";
import { RoomFields } from "./room-fields";
import { projectWithLivingRoom } from "@/domain/project/fixtures";

function snappingFloor(): { floor: Floor; room: Room } {
  const room = withRoomLength(
    createRoom("room-1", "Living room", { xMeters: 0, zMeters: 0 }),
    "widthMeters",
    3.9,
  );
  const neighbor = createRoom("room-2", "Study", {
    xMeters: 4.1,
    zMeters: 0,
  });
  return {
    room,
    floor: {
      ...DEFAULT_FLOOR,
      exteriorWallThicknessMeters: 0.1,
      interiorWallThicknessMeters: 0.1,
      rooms: [room, neighbor],
    },
  };
}

function renderFields(
  floor: Floor,
  room: Room,
  onChange: (room: Room, gesture?: string) => void,
) {
  return render(
    <RoomFields
      floor={floor}
      room={room}
      unit="metric"
      onChange={onChange}
      onGestureEnd={vi.fn()}
      onRemove={vi.fn()}
      onAddOpening={vi.fn()}
    />,
  );
}

function mockPointerCapture(element: HTMLElement) {
  Object.assign(element, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
}

describe("RoomFields", () => {
  it("groups design-tool coordinates and dimensions without repeating the name", () => {
    const floor = projectWithLivingRoom().floor;
    const room = floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with a room");
    }

    render(
      <RoomFields
        floor={floor}
        room={room}
        unit="imperial"
        onChange={vi.fn()}
        onGestureEnd={vi.fn()}
        onRemove={vi.fn()}
        onAddOpening={vi.fn()}
      />,
    );

    const position = screen.getByRole("group", { name: "Position" });
    expect(
      within(position).getByRole("spinbutton", {
        name: "Living room X position",
      }),
    ).toBeInTheDocument();
    expect(
      within(position).getByRole("spinbutton", {
        name: "Living room Y position",
      }),
    ).toBeInTheDocument();
    expect(within(position).getAllByRole("slider")).toHaveLength(2);

    const size = screen.getByRole("group", { name: "Size" });
    expect(within(size).getAllByRole("spinbutton")).toEqual([
      within(size).getByRole("spinbutton", { name: "Living room width" }),
      within(size).getByRole("spinbutton", { name: "Living room depth" }),
    ]);
    expect(within(size).getAllByRole("slider")).toHaveLength(2);
    expect(
      screen.getByRole("spinbutton", { name: "Living room height" }),
    ).toBeInTheDocument();
    expect(
      within(size).getByRole("slider", {
        name: "W drag handle",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Name" }),
    ).not.toBeInTheDocument();
  });

  it("snaps a scrubbed width to the neighboring shared wall", () => {
    const { floor, room } = snappingFloor();
    const onChange = vi.fn();
    renderFields(floor, room, onChange);

    const scrubber = screen.getByRole("slider", { name: "W drag handle" });
    mockPointerCapture(scrubber);
    fireEvent.pointerDown(scrubber, {
      pointerId: 3,
      button: 0,
      clientX: 100,
    });
    fireEvent.pointerMove(scrubber, { pointerId: 3, clientX: 105 });

    const changed = onChange.mock.lastCall?.[0] as Room | undefined;
    expect(changed && primaryRoomPart(changed).widthMeters).toBeCloseTo(4, 10);
    expect(onChange.mock.lastCall?.[1]).toBe("room-field:room-1:width");
  });

  it("keeps a typed width exact even when it is inside snapping distance", () => {
    const { floor, room } = snappingFloor();
    const onChange = vi.fn();
    renderFields(floor, room, onChange);

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Living room width" }),
      { target: { value: "395" } },
    );

    const changed = onChange.mock.lastCall?.[0] as Room | undefined;
    expect(changed && primaryRoomPart(changed).widthMeters).toBeCloseTo(
      3.95,
      10,
    );
    expect(onChange.mock.lastCall?.[1]).toBeUndefined();
  });

  it("turns a section by its typed angle, spinning it in place", () => {
    const floor = projectWithLivingRoom().floor;
    const room = floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with a room");
    }
    const onChange = vi.fn();
    renderFields(floor, room, onChange);

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Living room angle" }),
      { target: { value: "45" } },
    );

    const changed = onChange.mock.lastCall?.[0] as Room | undefined;
    expect(changed && primaryRoomPart(changed).rotationRadians).toBeCloseTo(
      Math.PI / 4,
      10,
    );
    const before = roomPartRect(primaryRoomPart(room)).center;
    const after = changed && roomPartRect(primaryRoomPart(changed)).center;
    expect(after?.xMeters).toBeCloseTo(before.xMeters, 10);
    expect(after?.zMeters).toBeCloseTo(before.zMeters, 10);
  });

  it("keeps a turned room's scrubbed width exact instead of axis-snapping it", () => {
    const { floor, room } = snappingFloor();
    const turned = {
      ...room,
      parts: room.parts.map((part) => ({
        ...part,
        rotationRadians: Math.PI / 4,
      })),
    };
    const onChange = vi.fn();
    renderFields(
      { ...floor, rooms: [turned, ...floor.rooms.slice(1)] },
      turned,
      onChange,
    );

    const scrubber = screen.getByRole("slider", { name: "W drag handle" });
    mockPointerCapture(scrubber);
    fireEvent.pointerDown(scrubber, {
      pointerId: 3,
      button: 0,
      clientX: 100,
    });
    fireEvent.pointerMove(scrubber, { pointerId: 3, clientX: 105 });

    // 3.9 m scrubbed up by five hundredths: exactly 3.95, nothing pulled to 4.
    const changed = onChange.mock.lastCall?.[0] as Room | undefined;
    expect(changed && primaryRoomPart(changed).widthMeters).toBeCloseTo(
      3.95,
      10,
    );
  });

  it("opens a wall from its toggle, and closes it again", () => {
    const floor = projectWithLivingRoom().floor;
    const room = floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with a room");
    }
    const onChange = vi.fn();
    renderFields(floor, room, onChange);

    fireEvent.click(
      screen.getByRole("button", { name: "Living room north wall open" }),
    );

    const opened = onChange.mock.lastCall?.[0] as Room | undefined;
    if (opened === undefined) {
      throw new Error("the toggle reported no change");
    }
    expect(primaryRoomPart(opened).openWalls).toEqual(["north"]);
    expect(
      screen.getByRole("button", { name: "Living room north wall open" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("closes an opened wall from the same toggle", () => {
    const floor = projectWithLivingRoom().floor;
    const base = floor.rooms[0];
    if (base === undefined) {
      throw new Error("a new project starts with a room");
    }
    const room = {
      ...base,
      parts: base.parts.map((part) => ({
        ...part,
        openWalls: ["north" as const],
      })),
    };
    const onChange = vi.fn();
    renderFields({ ...floor, rooms: [room] }, room, onChange);

    const toggle = screen.getByRole("button", {
      name: "Living room north wall open",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);

    const closed = onChange.mock.lastCall?.[0] as Room | undefined;
    expect(closed && primaryRoomPart(closed).openWalls).toEqual([]);
  });

  it("adds an editable rectangular section to the room", () => {
    const floor = projectWithLivingRoom().floor;
    const room = floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with a room");
    }
    const onChange = vi.fn();
    const onSelectPart = vi.fn();
    render(
      <RoomFields
        floor={floor}
        room={room}
        unit="metric"
        onChange={onChange}
        onGestureEnd={vi.fn()}
        onRemove={vi.fn()}
        onAddOpening={vi.fn()}
        onSelectPart={onSelectPart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add section" }));

    const changed = onChange.mock.lastCall?.[0] as Room | undefined;
    expect(changed?.parts).toHaveLength(2);
    expect(changed?.parts[1]?.id).toBe("room-1-part-2");
    expect(onSelectPart).toHaveBeenCalledWith("room-1-part-2");
  });

  it("shows a plain footprint instead of Section 1 for a rectangular room", () => {
    const floor = projectWithLivingRoom().floor;
    const room = floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with a room");
    }
    render(
      <RoomFields
        floor={floor}
        room={room}
        unit="metric"
        onChange={vi.fn()}
        onGestureEnd={vi.fn()}
        onRemove={vi.fn()}
        onAddOpening={vi.fn()}
      />,
    );

    expect(screen.getByText("Footprint")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select Living room" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Section 1")).not.toBeInTheDocument();
  });

  it("selects a section from its sidebar card once the room is compound", () => {
    const floor = projectWithLivingRoom().floor;
    const base = floor.rooms[0];
    if (base === undefined) {
      throw new Error("a new project starts with a room");
    }
    const room = withParts(base, [
      ...base.parts,
      {
        id: "room-1-part-2",
        origin: { xMeters: 2, zMeters: 2 },
        widthMeters: 2,
        depthMeters: 2,
        rotationRadians: 0,
        openWalls: [],
      },
    ]);
    const onSelectPart = vi.fn();
    render(
      <RoomFields
        floor={{ ...floor, rooms: [room] }}
        room={room}
        unit="metric"
        onChange={vi.fn()}
        onGestureEnd={vi.fn()}
        onRemove={vi.fn()}
        onAddOpening={vi.fn()}
        onSelectPart={onSelectPart}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Select Living room section 1" }),
    );
    expect(onSelectPart).toHaveBeenCalledWith("room-1-part-1");
  });

  it("collapses selection back to the room when one part remains", () => {
    const floor = projectWithLivingRoom().floor;
    const base = floor.rooms[0];
    if (base === undefined) {
      throw new Error("a new project starts with a room");
    }
    const room = withParts(base, [
      ...base.parts,
      {
        id: "room-1-part-2",
        origin: { xMeters: 2, zMeters: 2 },
        widthMeters: 2,
        depthMeters: 2,
        rotationRadians: 0,
        openWalls: [],
      },
    ]);
    const onSelectPart = vi.fn();
    render(
      <RoomFields
        floor={{ ...floor, rooms: [room] }}
        room={room}
        unit="metric"
        selectedPartId="room-1-part-1"
        onChange={vi.fn()}
        onGestureEnd={vi.fn()}
        onRemove={vi.fn()}
        onAddOpening={vi.fn()}
        onSelectPart={onSelectPart}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Living room section 2" }),
    );

    expect(onSelectPart).toHaveBeenCalledWith(null);
  });
});

describe("a room's own wall thickness", () => {
  const FLOOR: Floor = {
    ...DEFAULT_FLOOR,
    exteriorWallThicknessMeters: 0.2,
    interiorWallThicknessMeters: 0.1,
    rooms: [createRoom("room-1", "Living room", { xMeters: 0, zMeters: 0 })],
  };
  const ROOM = FLOOR.rooms[0]!;

  function walls() {
    return screen.getByRole("button", { name: /^Walls/ });
  }

  it("stays folded away, reading out what the apartment gave it", () => {
    renderFields(FLOOR, ROOM, vi.fn());

    expect(walls()).toHaveAttribute("aria-expanded", "false");
    expect(walls()).toHaveTextContent("20 cm shell, 10 cm partitions");
    expect(walls()).toHaveTextContent("from the apartment");
    // Folded means folded: the fields are not in the document at all.
    expect(
      screen.queryByLabelText("Living room interior wall thickness"),
    ).not.toBeInTheDocument();
  });

  it("opens onto the inherited numbers rather than empty boxes", async () => {
    renderFields(FLOOR, ROOM, vi.fn());

    await userEvent.click(walls());

    expect(walls()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByLabelText("Living room exterior wall thickness"),
    ).toHaveValue(20);
    expect(
      screen.getByLabelText("Living room interior wall thickness"),
    ).toHaveValue(10);
  });

  it("makes the number this room's as soon as it is typed over", async () => {
    const onChange = vi.fn();
    renderFields(FLOOR, ROOM, onChange);
    await userEvent.click(walls());

    fireEvent.change(
      screen.getByLabelText("Living room interior wall thickness"),
      { target: { value: "30" } },
    );

    expect(onChange).toHaveBeenCalled();
    const [next] = onChange.mock.calls.at(-1) as [Room];
    expect(next.interiorWallThicknessMeters).toBeCloseTo(0.3, 10);
    // The other one is untouched: overriding is per number, not per room.
    expect(next.exteriorWallThicknessMeters).toBeNull();
  });

  it("hands a number back to the apartment, and says so while it is not", async () => {
    const own: Room = { ...ROOM, interiorWallThicknessMeters: 0.3 };
    const onChange = vi.fn();
    renderFields(FLOOR, own, onChange);

    expect(walls()).toHaveTextContent("20 cm shell, 30 cm partitions");
    expect(walls()).not.toHaveTextContent("from the apartment");

    await userEvent.click(walls());
    await userEvent.click(
      screen.getByRole("button", {
        name: "Use the apartment's interior wall thickness",
      }),
    );

    const [next] = onChange.mock.calls.at(-1) as [Room];
    expect(next.interiorWallThicknessMeters).toBeNull();
  });

  it("offers no way back for a number that was never overridden", async () => {
    renderFields(FLOOR, ROOM, vi.fn());
    await userEvent.click(walls());

    expect(
      screen.queryByRole("button", {
        name: "Use the apartment's exterior wall thickness",
      }),
    ).not.toBeInTheDocument();
  });
});
