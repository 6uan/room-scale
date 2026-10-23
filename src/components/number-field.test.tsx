import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { metersFromInches, type DisplayUnit } from "@/domain/units";
import { NumberField } from "./number-field";

function ScrubField({
  onChange,
  onGestureEnd,
  startInches = 96,
  unit = "inches",
}: {
  onChange: (meters: number, gesture?: string) => void;
  onGestureEnd: () => void;
  startInches?: number;
  unit?: DisplayUnit;
}) {
  const [meters, setMeters] = useState(metersFromInches(startInches));

  return (
    <NumberField
      label="Living room width"
      compactLabel="W"
      scrubGesture="room-field:room-1:width"
      unit={unit}
      meters={meters}
      limits={{ minMeters: 0.5, maxMeters: 30 }}
      onMetersChange={(next, gesture) => {
        setMeters(next);
        onChange(next, gesture);
      }}
      onGestureEnd={onGestureEnd}
    />
  );
}

function mockPointerCapture(element: HTMLElement) {
  Object.assign(element, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
}

describe("NumberField compact scrubbing", () => {
  it("changes one displayed unit per horizontal pixel as one gesture", () => {
    const onChange = vi.fn();
    const onGestureEnd = vi.fn();
    render(<ScrubField onChange={onChange} onGestureEnd={onGestureEnd} />);

    const slider = screen.getByRole("slider", {
      name: "W drag handle",
    });
    mockPointerCapture(slider);

    fireEvent.pointerDown(slider, {
      pointerId: 7,
      button: 0,
      clientX: 100,
    });
    fireEvent.pointerMove(slider, { pointerId: 7, clientX: 112 });
    fireEvent.pointerUp(slider, { pointerId: 7, clientX: 112 });

    expect(
      screen.getByRole("textbox", { name: "Living room width" }),
    ).toHaveValue("108");
    expect(onChange).toHaveBeenLastCalledWith(
      metersFromInches(108),
      "room-field:room-1:width",
    );
    expect(onGestureEnd).toHaveBeenCalledOnce();
  });

  it("lands a scrub on a round number rather than carrying a fraction", () => {
    const onChange = vi.fn();
    render(
      <ScrubField
        onChange={onChange}
        onGestureEnd={() => undefined}
        startInches={286.93}
      />,
    );

    const slider = screen.getByRole("slider", { name: "W drag handle" });
    mockPointerCapture(slider);

    fireEvent.pointerDown(slider, { pointerId: 3, button: 0, clientX: 100 });
    fireEvent.pointerMove(slider, { pointerId: 3, clientX: 105 });
    fireEvent.pointerUp(slider, { pointerId: 3, clientX: 105 });

    // Five pixels from 286.93 is 291.93 if the step is what gets rounded, and
    // 292 if the value is. A dimension nobody can drag to a whole inch is the
    // bug this guards: the fraction used to survive every gesture forever.
    expect(
      screen.getByRole("textbox", { name: "Living room width" }),
    ).toHaveValue("292");
  });

  it("also adjusts from the keyboard while the number stays typeable", () => {
    const onChange = vi.fn();
    render(<ScrubField onChange={onChange} onGestureEnd={() => undefined} />);

    fireEvent.keyDown(
      screen.getByRole("slider", {
        name: "W drag handle",
      }),
      { key: "ArrowRight" },
    );

    const field = screen.getByRole("textbox", {
      name: "Living room width",
    });
    expect(field).toHaveValue("97");
    expect(field).toHaveClass("compact-number-input");
    expect(onChange).toHaveBeenLastCalledWith(metersFromInches(97), undefined);
  });

  it("stops a scrub at the field limits", () => {
    const onChange = vi.fn();
    render(<ScrubField onChange={onChange} onGestureEnd={() => undefined} />);

    const slider = screen.getByRole("slider", { name: "W drag handle" });
    mockPointerCapture(slider);
    fireEvent.pointerDown(slider, {
      pointerId: 8,
      button: 0,
      clientX: 100,
    });
    fireEvent.pointerMove(slider, { pointerId: 8, clientX: -1000 });

    expect(
      screen.getByRole("textbox", { name: "Living room width" }),
    ).toHaveValue("19.69");
    expect(onChange.mock.lastCall?.[0]).toBe(0.5);
  });
});

describe("NumberField arrow keys", () => {
  it("steps an inch with ↑ and ↓, ten with Shift, exactly and as one gesture", () => {
    const onChange = vi.fn();
    const onGestureEnd = vi.fn();
    render(<ScrubField onChange={onChange} onGestureEnd={onGestureEnd} />);
    const field = screen.getByRole("textbox", { name: "Living room width" });

    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field).toHaveValue("97");
    expect(onChange).toHaveBeenLastCalledWith(
      metersFromInches(97),
      "room-field:room-1:width",
    );

    fireEvent.keyDown(field, { key: "ArrowDown", shiftKey: true });
    expect(field).toHaveValue("87");

    fireEvent.keyUp(field, { key: "ArrowDown" });
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
  });

  it("stops at the field's limits", () => {
    const onChange = vi.fn();
    render(
      <ScrubField
        onChange={onChange}
        onGestureEnd={() => undefined}
        startInches={25}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Living room width" });

    fireEvent.keyDown(field, { key: "ArrowDown", shiftKey: true });
    expect(onChange.mock.lastCall?.[0]).toBe(0.5);
  });
});

describe("NumberField in feet and inches", () => {
  it("shows the length the way the labels do, and steps it by the inch", () => {
    const onChange = vi.fn();
    render(
      <ScrubField
        onChange={onChange}
        onGestureEnd={() => undefined}
        startInches={116}
        unit="imperial"
      />,
    );
    const field = screen.getByRole("textbox", { name: "Living room width" });
    expect(field).toHaveValue(`9' 8"`);

    fireEvent.keyDown(field, { key: "ArrowUp", shiftKey: true });
    expect(field).toHaveValue(`10' 6"`);
    expect(onChange.mock.lastCall?.[0]).toBeCloseTo(metersFromInches(126), 12);
  });

  it("still takes a bare number as inches", () => {
    const onChange = vi.fn();
    render(
      <ScrubField
        onChange={onChange}
        onGestureEnd={() => undefined}
        unit="imperial"
      />,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Living room width" }),
      { target: { value: "116" } },
    );
    expect(onChange.mock.lastCall?.[0]).toBeCloseTo(metersFromInches(116), 12);
  });
});

describe("NumberField limits", () => {
  it("judges what is typed, not a value handed in from outside", () => {
    const { rerender } = render(
      <NumberField
        label="Gap to north wall"
        unit="inches"
        meters={metersFromInches(-80)}
        limits={{ minMeters: 0, maxMeters: 30 }}
        onMetersChange={vi.fn()}
      />,
    );
    const field = screen.getByRole("textbox", { name: "Gap to north wall" });
    expect(field).toHaveValue("-80");
    expect(field).toHaveAttribute("aria-invalid", "false");

    fireEvent.change(field, { target: { value: "-5" } });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/At least/)).toBeInTheDocument();

    rerender(
      <NumberField
        label="Gap to north wall"
        unit="inches"
        meters={metersFromInches(12)}
        limits={{ minMeters: 0, maxMeters: 30 }}
        onMetersChange={vi.fn()}
      />,
    );
    expect(field).toHaveAttribute("aria-invalid", "false");
  });
});
