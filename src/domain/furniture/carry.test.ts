import { describe, expect, it } from "vitest";
import { DEFAULT_FLOOR, resizeRoomEdge, withOrigin } from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { carriedWithRooms } from "./carry";
import { createInstance } from "./instance";
import type { FurnitureProduct } from "./product";

const FLOOR = { ...DEFAULT_FLOOR, rooms: [LIVING_ROOM] };
const CHAIR: FurnitureProduct = {
  id: "chair",
  name: "Chair",
  retailer: "",
  productUrl: "",
  priceCents: 0,
  purchaseStatus: "wanted",
  category: "seating",
  footprint: { widthMeters: 0.5, depthMeters: 0.5 },
  heightMeters: 0.8,
};
const inside = {
  instance: createInstance("in", CHAIR.id, { xMeters: 0, zMeters: 0 }),
  product: CHAIR,
};
const outside = {
  instance: createInstance("out", CHAIR.id, { xMeters: 9, zMeters: 9 }),
  product: CHAIR,
};
const origin = LIVING_ROOM.parts[0]?.origin ?? { xMeters: 0, zMeters: 0 };

describe("carriedWithRooms", () => {
  it("carries what stands in the room by the room's own move", () => {
    const moved = withOrigin(LIVING_ROOM, {
      xMeters: origin.xMeters + 1,
      zMeters: origin.zMeters + 2,
    });
    const [chair, far] = carriedWithRooms(
      FLOOR,
      [inside, outside],
      [{ before: LIVING_ROOM, after: moved }],
    );
    expect(chair?.position).toEqual({ xMeters: 1, zMeters: 2 });
    expect(far?.position).toEqual({ xMeters: 9, zMeters: 9 });
  });

  it("leaves a piece that is only moving with a group to the group", () => {
    const moved = withOrigin(LIVING_ROOM, {
      xMeters: origin.xMeters + 1,
      zMeters: origin.zMeters,
    });
    const [chair] = carriedWithRooms(
      FLOOR,
      [inside],
      [{ before: LIVING_ROOM, after: moved }],
      ["in"],
    );
    expect(chair?.position).toEqual({ xMeters: 0, zMeters: 0 });
  });

  it("carries nothing when the room was resized rather than moved", () => {
    // Pulling the west wall out changes the origin, and asks nothing of the
    // furniture.
    const wider = resizeRoomEdge(LIVING_ROOM, "west", origin.xMeters - 1);
    const [chair] = carriedWithRooms(
      FLOOR,
      [inside],
      [{ before: LIVING_ROOM, after: wider }],
    );
    expect(chair?.position).toEqual({ xMeters: 0, zMeters: 0 });
  });

  it("carries nothing when the room did not move", () => {
    const [chair] = carriedWithRooms(
      FLOOR,
      [inside],
      [{ before: LIVING_ROOM, after: { ...LIVING_ROOM, name: "Lounge" } }],
    );
    expect(chair).toBe(inside.instance);
  });
});
