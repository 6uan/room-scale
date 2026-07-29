import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import type { LayoutProblem } from "@/domain/validation";
import { LayoutProblems } from "./layout-problems";

const NAMES = new Map([
  ["i1", "Sectional"],
  ["i2", "Coffee table"],
]);
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
