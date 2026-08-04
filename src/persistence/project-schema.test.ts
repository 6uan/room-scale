import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  readStoredProject,
  toStoredProject,
} from "./project-schema";
import { projectWithLivingRoom } from "@/domain/project/fixtures";

const STORED = toStoredProject(
  "current",
  projectWithLivingRoom(),
  1_700_000_000_000,
);

/**
 * The living room's floor as a build before version 13 stored it: two wall
 * thicknesses rather than one, on the floor and on every room.
 *
 * The fixture describes the shape this build writes, and a migration test has
 * to hand the reader the shape the *older* build wrote. Spelled out here once
 * rather than in each of the tests that needs it.
 */
function floorWithTwoThicknesses(
  project: ReturnType<typeof projectWithLivingRoom>,
) {
  return {
    exteriorWallThicknessMeters: 0.2032,
    interiorWallThicknessMeters: 0.1143,
    rooms: project.floor.rooms.map((room) => {
      const { wallThicknessMeters, ...rest } = room;
      void wallThicknessMeters;
      return {
        ...rest,
        exteriorWallThicknessMeters: null,
        interiorWallThicknessMeters: null,
      };
    }),
  };
}

describe("readStoredProject", () => {
  it("reads back a document this build wrote", () => {
    const result = readStoredProject(STORED);

    expect(result).toEqual({ ok: true, project: projectWithLivingRoom() });
  });

  it("survives a round trip through JSON, as structured cloning would", () => {
    const result = readStoredProject(JSON.parse(JSON.stringify(STORED)));

    expect(result.ok).toBe(true);
  });

  it("keeps openings and products through the round trip", () => {
    const project = {
      ...projectWithLivingRoom(),
      products: [
        {
          id: "p1",
          name: "Rug",
          retailer: "",
          productUrl: "",
          priceCents: 34900,
          purchaseStatus: "considering" as const,
          footprint: { widthMeters: 2.4, depthMeters: 1.5 },
          heightMeters: 0.01,
        },
      ],
    };
    const result = readStoredProject(
      toStoredProject("current", project, 1_700_000_000_000),
    );

    expect(result.ok && result.project).toEqual(project);
    expect(result.ok && result.project.floor.rooms[0]?.openings).toHaveLength(
      2,
    );
  });

  it("upgrades a version 1 document, which predates placed furniture", () => {
    // Captured from the version 1 schema, exactly as it sat in IndexedDB.
    const version1 = {
      id: "current",
      version: 1,
      updatedAt: 1_700_000_000_000,
      project: {
        room: {
          widthMeters: 4.2,
          depthMeters: 3.6,
          heightMeters: 2.44,
          wallThicknessMeters: 0.1143,
          openings: [
            {
              id: "door-1",
              kind: "door",
              wall: "south",
              centerMeters: 0.9,
              widthMeters: 0.8128,
              hinge: "start",
              swing: "inward",
            },
          ],
        },
        products: [
          {
            id: "p1",
            name: "Rug",
            retailer: "",
            productUrl: "",
            priceCents: 34900,
            purchaseStatus: "considering",
            footprint: { widthMeters: 2.4, depthMeters: 1.5 },
            heightMeters: 0.01,
          },
        ],
        displayUnit: "imperial",
      },
    };

    const result = readStoredProject(version1);

    expect(result.ok).toBe(true);
    // Nothing was placed before version 2, so nothing is placed after it.
    expect(result.ok && result.project.layouts[0]?.instances).toEqual([]);
    // And everything the old document did hold survived the upgrade.
    expect(result.ok && result.project.products).toHaveLength(1);
    expect(result.ok && result.project.floor.rooms[0]?.openings).toHaveLength(
      1,
    );
    expect(result.ok && result.project.displayUnit).toBe("imperial");
  });

  it("upgrades a version 2 document", () => {
    // Captured from the version 2 schema, exactly as it sat in IndexedDB.
    const version2 = {
      id: "current",
      version: 2,
      updatedAt: 1_700_000_000_000,
      project: {
        room: {
          widthMeters: 4.2,
          depthMeters: 3.6,
          heightMeters: 2.44,
          wallThicknessMeters: 0.1143,
          openings: [
            {
              id: "window-1",
              kind: "window",
              wall: "north",
              centerMeters: 2.1,
              widthMeters: 1.2192,
            },
          ],
        },
        products: [
          {
            id: "p1",
            name: "Rug",
            retailer: "",
            productUrl: "",
            priceCents: 34900,
            purchaseStatus: "considering",
            footprint: { widthMeters: 2.4, depthMeters: 1.5 },
            heightMeters: 0.01,
          },
        ],
        instances: [
          {
            id: "i1",
            productId: "p1",
            position: { xMeters: 2.1, zMeters: 1.8 },
            rotationRadians: 0,
          },
        ],
        displayUnit: "imperial",
      },
    };

    const result = readStoredProject(version2);

    expect(result.ok).toBe(true);
    // The room the document did describe is untouched.
    expect(result.ok && result.project.floor.rooms[0]?.openings).toHaveLength(
      1,
    );
    expect(result.ok && result.project.layouts[0]?.instances).toHaveLength(1);
    expect(result.ok && result.project.products).toHaveLength(1);
  });

  it("upgrades a version 4 document, which predates layouts", () => {
    // Captured from the version 4 schema, exactly as it sat in IndexedDB.
    const version4 = {
      id: "current",
      version: 4,
      updatedAt: 1_700_000_000_000,
      project: {
        floor: {
          wallThicknessMeters: 0.1143,
          rooms: [
            {
              id: "room-1",
              name: "Living room",
              origin: { xMeters: 0, zMeters: 0 },
              widthMeters: 4.2,
              depthMeters: 3.6,
              heightMeters: 2.44,
              openings: [],
            },
          ],
        },
        products: [
          {
            id: "p1",
            name: "Rug",
            retailer: "",
            productUrl: "",
            priceCents: 34900,
            purchaseStatus: "considering",
            footprint: { widthMeters: 2.4, depthMeters: 1.5 },
            heightMeters: 0.01,
          },
        ],
        instances: [
          {
            id: "i1",
            productId: "p1",
            position: { xMeters: 2.1, zMeters: 1.8 },
            rotationRadians: 0,
          },
        ],
        displayUnit: "imperial",
      },
    };

    const result = readStoredProject(version4);

    expect(result.ok).toBe(true);
    // What it held was one arrangement nobody had needed to name yet.
    expect(result.ok && result.project.layouts).toHaveLength(1);
    expect(result.ok && result.project.layouts[0]?.instances).toHaveLength(1);
    expect(result.ok && result.project.activeLayoutId).toBe(
      result.ok ? result.project.layouts[0]?.id : "",
    );
    // And the furniture itself is untouched by the move.
    expect(
      result.ok && result.project.layouts[0]?.instances[0]?.position,
    ).toEqual({ xMeters: 2.1, zMeters: 1.8 });
  });

  it("drops retired floor data when upgrading a version 5 document", () => {
    const project = projectWithLivingRoom();
    const legacyRooms = project.floor.rooms.map((room) => {
      const part = room.parts[0];
      if (part === undefined) {
        throw new Error("a room has a part");
      }
      return {
        id: room.id,
        name: room.name,
        origin: part.origin,
        widthMeters: part.widthMeters,
        depthMeters: part.depthMeters,
        heightMeters: room.heightMeters,
        openings: room.openings.map((opening) => {
          const { partId, ...legacy } = opening;
          void partId;
          return legacy;
        }),
      };
    });
    const version5 = {
      id: "current",
      version: 5,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        // The one thickness a version 5 floor carried, and nothing split yet.
        floor: {
          wallThicknessMeters: 0.1143,
          rooms: legacyRooms,
          retiredFloorData: [{ id: "legacy-1" }],
        },
      },
    };

    const result = readStoredProject(version5);

    // The same project, save for the thickness the old floor carried. It was
    // split into two on the way to version 9 and put back into one at 13, and
    // comes out as the number that went in. A stored measurement is never
    // replaced by a newer default.
    expect(result).toEqual({
      ok: true,
      project: {
        ...project,
        floor: { ...project.floor, wallThicknessMeters: 0.1143 },
      },
    });
    expect(
      result.ok && "retiredFloorData" in (result.project.floor as object),
    ).toBe(false);
  });

  it("upgrades a version 6 rectangle to one room part", () => {
    const project = projectWithLivingRoom();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room part");
    }
    const version6 = {
      id: "current",
      version: 6,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        floor: {
          wallThicknessMeters: 0.1143,
          rooms: [
            {
              id: room.id,
              name: room.name,
              origin: part.origin,
              widthMeters: part.widthMeters,
              depthMeters: part.depthMeters,
              heightMeters: room.heightMeters,
              openings: room.openings.map((opening) => {
                const { partId, ...legacy } = opening;
                void partId;
                return legacy;
              }),
            },
          ],
        },
      },
    };

    const result = readStoredProject(version6);

    expect(result.ok).toBe(true);
    expect(result.ok && result.project.floor.rooms[0]?.parts).toEqual([part]);
    expect(
      result.ok && result.project.floor.rooms[0]?.openings[0]?.partId,
    ).toBe(part.id);
  });

  it("upgrades a version 7 part, which could not yet be turned", () => {
    const project = projectWithLivingRoom();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room part");
    }
    const { rotationRadians, openWalls, ...legacyPart } = part;
    void rotationRadians;
    void openWalls;
    const version7 = {
      id: "current",
      version: 7,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        floor: {
          wallThicknessMeters: 0.1143,
          rooms: [{ ...room, parts: [legacyPart] }],
        },
      },
    };

    const result = readStoredProject(version7);

    expect(result.ok).toBe(true);
    expect(result.ok && result.project.floor.rooms[0]?.parts).toEqual([part]);
  });

  it("carries a version 8 wall thickness through the split and back", () => {
    const project = projectWithLivingRoom();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room part");
    }
    const { openWalls, ...closedPart } = part;
    void openWalls;
    const version8 = {
      id: "current",
      version: 8,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        floor: {
          wallThicknessMeters: 0.2,
          rooms: [{ ...room, parts: [closedPart] }],
        },
      },
    };

    const result = readStoredProject(version8);

    expect(result.ok).toBe(true);
    // Version 9 split the one thickness into two, and version 13 put them
    // back into one. A project that had a single number all along comes out
    // the far end with that same number.
    expect(result.ok && result.project.floor.wallThicknessMeters).toBe(0.2);
    expect(
      result.ok && result.project.floor.rooms[0]?.parts[0]?.openWalls,
    ).toEqual([]);
    expect(
      result.ok &&
        "exteriorWallThicknessMeters" in (result.project.floor as object),
    ).toBe(false);
  });

  it("gives a version 9 project no underlay, which is what it had", () => {
    const project = projectWithLivingRoom();
    const { underlay, ...withoutUnderlay } = project;
    void underlay;
    const version9 = {
      id: "current",
      version: 9,
      updatedAt: 1_700_000_000_000,
      project: { ...withoutUnderlay, floor: floorWithTwoThicknesses(project) },
    };

    const result = readStoredProject(version9);

    expect(result.ok).toBe(true);
    expect(result.ok && result.project.underlay).toBeNull();
  });

  it("leaves a version 10 room taking the floor's wall thickness", () => {
    const project = projectWithLivingRoom();
    const room = project.floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with one room");
    }
    const { wallThicknessMeters, ...bare } = room;
    void wallThicknessMeters;
    const version10 = {
      id: "current",
      version: 10,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        floor: {
          exteriorWallThicknessMeters: 0.1143,
          interiorWallThicknessMeters: 0.1143,
          rooms: [bare],
        },
      },
    };

    const result = readStoredProject(version10);

    expect(result.ok).toBe(true);
    // Null, meaning "whatever the floor says" — which is what it always did.
    expect(
      result.ok && result.project.floor.rooms[0]?.wallThicknessMeters,
    ).toBeNull();
    // And the floor keeps its own measured number rather than taking the
    // default a new apartment starts on.
    expect(result.ok && result.project.floor.wallThicknessMeters).toBe(0.1143);
  });

  it("keeps the partition when a version 12 project's two thicknesses collapse", () => {
    const project = projectWithLivingRoom();
    const room = project.floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with one room");
    }
    const { wallThicknessMeters, ...bare } = room;
    void wallThicknessMeters;
    const version12 = {
      id: "current",
      version: 12,
      updatedAt: 1_700_000_000_000,
      project: {
        ...project,
        floor: {
          exteriorWallThicknessMeters: 0.2032,
          interiorWallThicknessMeters: 0.1143,
          rooms: [
            {
              ...bare,
              exteriorWallThicknessMeters: null,
              interiorWallThicknessMeters: 0.3,
            },
          ],
        },
      },
    };

    const result = readStoredProject(version12);

    expect(result.ok).toBe(true);
    // The interior number is the one kept, on the floor and on the room: it
    // is what decides how far apart snapped rooms stand, so keeping it leaves
    // every room exactly where it was.
    expect(result.ok && result.project.floor.wallThicknessMeters).toBe(0.1143);
    expect(
      result.ok && result.project.floor.rooms[0]?.wallThicknessMeters,
    ).toBe(0.3);
    // And the keys it replaced are gone rather than carried along.
    expect(
      result.ok &&
        "interiorWallThicknessMeters" in (result.project.floor as object),
    ).toBe(false);
  });

  it("leaves a version 11 section square, with no corners clipped", () => {
    const project = projectWithLivingRoom();
    const version11 = {
      id: "current",
      version: 11,
      updatedAt: 1_700_000_000_000,
      project: { ...project, floor: floorWithTwoThicknesses(project) },
    };

    const result = readStoredProject(version11);

    expect(result.ok).toBe(true);
    // Absent, which is what "every corner of it is square" says.
    expect(
      result.ok && result.project.floor.rooms[0]?.parts[0]?.cuts,
    ).toBeUndefined();
  });

  it("keeps a clipped corner through the round trip", () => {
    const project = projectWithLivingRoom();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room of one part");
    }
    const stored = {
      ...STORED,
      project: {
        ...project,
        floor: {
          ...project.floor,
          rooms: [
            {
              ...room,
              parts: [
                {
                  ...part,
                  cuts: {
                    "north-west": { widthMeters: 0.9144, depthMeters: 0.6 },
                  },
                },
              ],
              openings: [
                {
                  id: "door-9",
                  partId: part.id,
                  kind: "door",
                  wall: "north-west",
                  centerMeters: 0.5,
                  widthMeters: 0.8128,
                  hinge: "start",
                  swing: "inward",
                },
              ],
            },
          ],
        },
      },
    };

    const result = readStoredProject(stored);

    expect(result.ok).toBe(true);
    expect(result.ok && result.project.floor.rooms[0]?.parts[0]?.cuts).toEqual({
      "north-west": { widthMeters: 0.9144, depthMeters: 0.6 },
    });
    // A door hung on the chamfer keeps its address through the round trip.
    expect(result.ok && result.project.floor.rooms[0]?.openings[0]?.wall).toBe(
      "north-west",
    );
  });

  it("keeps a room's own wall thickness through the round trip", () => {
    const project = projectWithLivingRoom();
    const room = project.floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with one room");
    }
    const stored = {
      ...STORED,
      project: {
        ...project,
        floor: {
          ...project.floor,
          rooms: [{ ...room, wallThicknessMeters: 0.3 }],
        },
      },
    };

    const result = readStoredProject(stored);

    expect(
      result.ok && result.project.floor.rooms[0]?.wallThicknessMeters,
    ).toBe(0.3);
  });

  it("keeps a calibrated underlay through the round trip", () => {
    const project = {
      ...projectWithLivingRoom(),
      underlay: {
        imageDataUrl: "data:image/png;base64,x",
        imageWidthPixels: 800,
        imageHeightPixels: 600,
        metersPerPixel: 0.0125,
        origin: { xMeters: -4, zMeters: -3 },
        visible: true,
      },
    };
    const result = readStoredProject(
      toStoredProject("current", project, 1_700_000_000_000),
    );

    expect(result.ok && result.project.underlay).toEqual(project.underlay);
  });

  it("refuses a part whose rotation is missing at the current version", () => {
    const project = projectWithLivingRoom();
    const room = project.floor.rooms[0];
    const part = room?.parts[0];
    if (room === undefined || part === undefined) {
      throw new Error("a new project starts with one room part");
    }
    const { rotationRadians, ...squarePart } = part;
    void rotationRadians;
    const current = {
      ...STORED,
      project: {
        ...project,
        floor: { ...project.floor, rooms: [{ ...room, parts: [squarePart] }] },
      },
    };

    expect(readStoredProject(current).ok).toBe(false);
  });

  it("refuses a project with no layout to put furniture in", () => {
    const empty = {
      ...STORED,
      project: { ...STORED.project, layouts: [] },
    };

    expect(readStoredProject(empty).ok).toBe(false);
  });

  it("refuses a version 1 document that was already broken", () => {
    const damaged = {
      id: "current",
      version: 1,
      updatedAt: 0,
      project: { room: "not a room", products: [], displayUnit: "imperial" },
    };

    expect(readStoredProject(damaged)).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("refuses a document from a newer build rather than reading round it", () => {
    const result = readStoredProject({
      ...STORED,
      version: SCHEMA_VERSION + 1,
    });

    expect(result).toEqual({ ok: false, reason: "from-a-newer-version" });
  });

  it("refuses anything without a version", () => {
    for (const value of [null, undefined, 42, "a project", {}, []]) {
      expect(readStoredProject(value)).toEqual({
        ok: false,
        reason: "unreadable",
      });
    }
  });

  it("refuses a document whose contents do not match the schema", () => {
    const missingRoom = { ...STORED, project: { products: [] } };
    const wrongType = {
      ...STORED,
      project: { ...STORED.project, displayUnit: "furlongs" },
    };

    expect(readStoredProject(missingRoom).ok).toBe(false);
    expect(readStoredProject(wrongType).ok).toBe(false);
  });

  it("refuses measurements that are not finite numbers", () => {
    const notFinite = {
      ...STORED,
      project: {
        ...STORED.project,
        floor: {
          ...STORED.project.floor,
          rooms: [
            {
              ...STORED.project.floor.rooms[0],
              parts: [
                {
                  ...STORED.project.floor.rooms[0]?.parts[0],
                  widthMeters: Number.NaN,
                },
              ],
            },
          ],
        },
      },
    };

    expect(readStoredProject(notFinite).ok).toBe(false);
  });

  it("refuses a price that is not whole cents", () => {
    const fractional = {
      ...STORED,
      project: {
        ...STORED.project,
        products: [
          {
            id: "p1",
            name: "Rug",
            retailer: "",
            productUrl: "",
            priceCents: 349.5,
            purchaseStatus: "considering",
            footprint: { widthMeters: 2.4, depthMeters: 1.5 },
            heightMeters: 0.01,
          },
        ],
      },
    };

    expect(readStoredProject(fractional).ok).toBe(false);
  });
});
