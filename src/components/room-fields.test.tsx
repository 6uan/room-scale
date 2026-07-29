import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "@/domain/project";
import {
  createRoom,
  DEFAULT_FLOOR,
  type Floor,
  type Room,
} from "@/domain/room";
import { RoomFields } from "./room-fields";

function snappingFloor(): { floor: Floor; room: Room } {
  const room = {
    ...createRoom("room-1", "Living room", { xMeters: 0, zMeters: 0 }),
    widthMeters: 3.9,
  };
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
      within(size).getByRole("spinbutton", { name: "Living room height" }),
      within(size).getByRole("spinbutton", { name: "Living room depth" }),
    ]);
    expect(within(size).getAllByRole("slider")).toHaveLength(3);
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
    expect(changed?.widthMeters).toBeCloseTo(4, 10);
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
    expect(changed?.widthMeters).toBeCloseTo(3.95, 10);
    expect(onChange.mock.lastCall?.[1]).toBeUndefined();
  });
});
