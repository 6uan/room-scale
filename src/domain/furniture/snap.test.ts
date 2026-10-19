import { describe, expect, it } from "vitest";
import { DEFAULT_FLOOR, SNAP_METERS } from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { createInstance, turnInstance } from "./instance";
import type { FurnitureProduct } from "./product";
import { snapInstancePosition } from "./snap";

/** A one-room apartment, four by three, with its north-west corner at the origin. */
const FLOOR = {
  ...DEFAULT_FLOOR,
  rooms: [
    {
      ...LIVING_ROOM,
      parts: [
        {
          id: "room-1-part-1",
          origin: { xMeters: 0, zMeters: 0 },
          widthMeters: 4,
          depthMeters: 3,
          rotationRadians: 0,
          openWalls: [],
        },
      ],
      openings: [],
    },
  ],
};

/** Two wide, one deep. */
const SOFA: FurnitureProduct = {
  id: "sofa",
  name: "Sofa",
  retailer: "",
  productUrl: "",
  priceCents: 0,
  purchaseStatus: "considering",
  footprint: { widthMeters: 2, depthMeters: 1 },
  heightMeters: 0.8,
};

function sofaAt(xMeters: number, zMeters: number, rotationRadians = 0) {
  const instance = turnInstance(
    createInstance("i1", SOFA.id, { xMeters, zMeters }),
    rotationRadians,
  );
  return { instance, product: SOFA };
}

describe("snapInstancePosition", () => {
  it("pulls a piece let go just short of a wall flush against it", () => {
    // Its back edge 3 cm off the north wall: the center lands at half its depth.
    const placed = sofaAt(2, 0.53);

    expect(
      snapInstancePosition(FLOOR, placed, placed.instance.position),
    ).toEqual({ xMeters: 2, zMeters: 0.5 });
  });

  it("snaps each axis on its own, so a corner lands in the corner", () => {
    const placed = sofaAt(1.03, 2.48);

    expect(
      snapInstancePosition(FLOOR, placed, placed.instance.position),
    ).toEqual({ xMeters: 1, zMeters: 2.5 });
  });

  it("leaves a piece alone when nothing is within reach", () => {
    const placed = sofaAt(2, 1.5);

    expect(
      snapInstancePosition(FLOOR, placed, placed.instance.position),
    ).toEqual({ xMeters: 2, zMeters: 1.5 });
  });

  it("does not reach further than the room snap does", () => {
    const placed = sofaAt(2, 0.5 + SNAP_METERS);

    expect(
      snapInstancePosition(FLOOR, placed, placed.instance.position).zMeters,
    ).toBe(0.5 + SNAP_METERS);
  });

  it("snaps a turned piece by its bounding box", () => {
    // Turned a quarter: now one wide and two deep, so flush against the west
    // wall means its center is half a meter in.
    const placed = sofaAt(0.47, 1.5, Math.PI / 2);

    const snapped = snapInstancePosition(
      FLOOR,
      placed,
      placed.instance.position,
    );
    expect(snapped.xMeters).toBeCloseTo(0.5, 10);
    expect(snapped.zMeters).toBe(1.5);
  });

  it("offers a turned room no faces at all", () => {
    const turned = {
      ...FLOOR,
      rooms: FLOOR.rooms.map((room) => ({
        ...room,
        parts: room.parts.map((part) => ({ ...part, rotationRadians: 0.3 })),
      })),
    };
    const placed = sofaAt(2, 0.53);

    expect(
      snapInstancePosition(turned, placed, placed.instance.position),
    ).toEqual({ xMeters: 2, zMeters: 0.53 });
  });
});
