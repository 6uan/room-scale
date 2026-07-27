import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import type { LayoutProblem } from "@/domain/validation";
import { LayoutProblems } from "./layout-problems";

const NAMES = new Map([
  ["i1", "Sectional"],
  ["i2", "Coffee table"],
]);
const ROUTES = new Map([["w1", "To the guest room"]]);
const ROOMS = new Map([
  ["r1", "Living room"],
  ["r2", "Hall"],
]);

function renderProblems(problems: readonly LayoutProblem[]) {
  render(
    <LayoutProblems
      problems={problems}
      names={NAMES}
      roomNames={ROOMS}
      walkwayNames={ROUTES}
      unit="imperial"
    />,
  );
}

describe("LayoutProblems", () => {
  it("says so when there is nothing wrong", () => {
    renderProblems([]);

    expect(screen.getByText(/Everything fits/)).toBeInTheDocument();
  });

  it("names both pieces of an overlap, and the amount", () => {
    renderProblems([
      {
        kind: "overlap",
        instanceIds: ["i1", "i2"],
        depthMeters: metersFromInches(4),
      },
    ]);

    expect(
      screen.getByText(`Sectional overlaps Coffee table by 0' 4.0".`),
    ).toBeInTheDocument();
  });

  it("names the wall a piece crosses", () => {
    renderProblems([
      {
        kind: "crosses-wall",
        instanceId: "i1",
        roomId: "r1",
        wall: "west",
        overhangMeters: metersFromInches(12),
      },
    ]);

    expect(
      screen.getByText(
        `Sectional crosses the west wall of the Living room by 1' 0.0".`,
      ),
    ).toBeInTheDocument();
  });

  it("says a piece is in no room at all without measuring it", () => {
    renderProblems([{ kind: "outside-room", instanceId: "i2" }]);

    expect(
      screen.getByText("Coffee table is not in any room."),
    ).toBeInTheDocument();
  });

  it("names both rooms when two blocks are in the same place", () => {
    renderProblems([
      {
        kind: "rooms-overlap",
        roomIds: ["r1", "r2"],
        depthMeters: metersFromInches(18),
      },
    ]);

    expect(
      screen.getByText(
        `Living room and Hall are in the same place, overlapping by 1' 6.0".`,
      ),
    ).toBeInTheDocument();
  });
});

describe("LayoutProblems: routes", () => {
  it("reports the width left, the shortfall, and what is in the way", () => {
    renderProblems([
      {
        kind: "walkway-blocked",
        walkwayId: "w1",
        instanceIds: ["i1"],
        clearMeters: metersFromInches(30),
        shortfallMeters: metersFromInches(6),
      },
    ]);

    // The width it needs is what it has plus what it is short: 36 inches.
    expect(
      screen.getByText(
        `To the guest room is down to 2' 6.0", 0' 6.0" short of the 3' 0.0" it needs. In the way: Sectional.`,
      ),
    ).toBeInTheDocument();
  });

  it("words a route that only misses the width you wanted differently", () => {
    renderProblems([
      {
        kind: "walkway-tight",
        walkwayId: "w1",
        instanceIds: ["i1", "i2"],
        clearMeters: metersFromInches(38),
        shortfallMeters: metersFromInches(4),
      },
    ]);

    const message = screen.getByText(/To the guest room is down to/);
    expect(message).toHaveTextContent(`under the 3' 6.0" you asked for`);
    expect(message).toHaveTextContent("In the way: Sectional, Coffee table");
    // Amber, not red: it works, and it is narrower than you hoped.
    expect(message).toHaveClass("text-amber-600");
  });

  it("marks a route that cannot be walked down in red", () => {
    renderProblems([
      {
        kind: "walkway-blocked",
        walkwayId: "w1",
        instanceIds: [],
        clearMeters: 0.5,
        shortfallMeters: 0.4,
      },
    ]);

    expect(screen.getByText(/is down to/)).toHaveClass("text-red-600");
  });

  it("falls back to calling it a route when it has no name", () => {
    render(
      <LayoutProblems
        problems={[
          {
            kind: "walkway-blocked",
            walkwayId: "missing",
            instanceIds: [],
            clearMeters: 0.5,
            shortfallMeters: 0.4,
          },
        ]}
        names={NAMES}
        roomNames={ROOMS}
        walkwayNames={new Map()}
        unit="metric"
      />,
    );

    expect(
      screen.getByText(/^A route is down to 50\.0 cm/),
    ).toBeInTheDocument();
  });
});
