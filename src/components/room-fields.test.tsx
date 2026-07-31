import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "@/domain/project";
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
      wallThicknessMeters: 0.1,
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
    const floor = createProject().floor;
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
    const floor = createProject().floor;
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

  it("adds an editable rectangular section to the room", () => {
    const floor = createProject().floor;
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
    const floor = createProject().floor;
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
    const floor = createProject().floor;
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
    const floor = createProject().floor;
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
