import { describe, expect, it } from "vitest";
import { createProject } from "@/domain/project";
import {
  SCHEMA_VERSION,
  readStoredProject,
  toStoredProject,
} from "./project-schema";

const STORED = toStoredProject("current", createProject(), 1_700_000_000_000);

describe("readStoredProject", () => {
  it("reads back a document this build wrote", () => {
    const result = readStoredProject(STORED);

    expect(result).toEqual({ ok: true, project: createProject() });
  });

  it("survives a round trip through JSON, as structured cloning would", () => {
    const result = readStoredProject(JSON.parse(JSON.stringify(STORED)));

    expect(result.ok).toBe(true);
  });

  it("keeps openings and products through the round trip", () => {
    const project = {
      ...createProject(),
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
    expect(result.ok && result.project.room.openings).toHaveLength(2);
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
        room: { ...STORED.project.room, widthMeters: Number.NaN },
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
