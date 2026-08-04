/**
 * The stored shape of a project, and how a stored record is read back.
 *
 * Everything here describes bytes that came out of IndexedDB, which is not the
 * same thing as a value the application produced. It was written by a possibly
 * older build, on a device we cannot see, and may have been edited by hand. So
 * it is parsed rather than cast, and a record that does not parse is refused
 * rather than half-trusted.
 *
 * Two versions are in play and they are not the same number:
 *
 * - `SCHEMA_VERSION` here is the shape of the document.
 * - Dexie's own version, in `project-database.ts`, is the shape of the tables.
 */

import { z } from "zod";
import type { Project } from "@/domain/project";

/**
 * Bumped whenever the stored document shape changes.
 *
 * 1. Room, products, and the display-unit preference.
 * 2. Added `instances` — copies of products placed in the room.
 * 3. Historical document revision.
 * 4. The room became a floor: an apartment of rooms, each with a place on it.
 * 5. Furniture moved into named layouts, so arrangements can be compared.
 * 6. Removed a retired floor-planning field.
 * 7. A room became a union of rectangular parts; openings name their part.
 * 8. A part may be turned about its corner. Existing parts are square: zero.
 * 9. Walls split into exterior and interior thickness; a part wall may be
 *    left open. Existing projects keep one thickness for both, nothing open.
 * 10. Added the traceable plan underlay. Existing projects have none.
 */
export const SCHEMA_VERSION = 10;

/** Meters, cents, and the rest are all plain finite numbers on the way in. */
const finiteNumber = z
  .number()
  .refine(Number.isFinite, "must be a finite number");

const wholeNumber = z
  .number()
  .refine(Number.isSafeInteger, "must be a whole number");

const openingFields = {
  id: z.string().min(1),
  partId: z.string().min(1),
  wall: z.enum(["north", "east", "south", "west"]),
  centerMeters: finiteNumber,
  widthMeters: finiteNumber,
};

const openingSchema = z.discriminatedUnion("kind", [
  z.object({
    ...openingFields,
    kind: z.literal("door"),
    hinge: z.enum(["start", "end"]),
    swing: z.enum(["inward", "outward"]),
  }),
  z.object({ ...openingFields, kind: z.literal("window") }),
  z.object({ ...openingFields, kind: z.literal("passage") }),
]);

const roomPartSchema = z.object({
  id: z.string().min(1),
  origin: z.object({ xMeters: finiteNumber, zMeters: finiteNumber }),
  widthMeters: finiteNumber,
  depthMeters: finiteNumber,
  rotationRadians: finiteNumber,
  openWalls: z.array(z.enum(["north", "east", "south", "west"])),
});

const roomSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  heightMeters: finiteNumber,
  parts: z.array(roomPartSchema).min(1),
  openings: z.array(openingSchema),
});

const floorSchema = z.object({
  exteriorWallThicknessMeters: finiteNumber,
  interiorWallThicknessMeters: finiteNumber,
  rooms: z.array(roomSchema),
});

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  retailer: z.string(),
  productUrl: z.string(),
  priceCents: wholeNumber,
  purchaseStatus: z.enum(["considering", "ordered", "owned"]),
  footprint: z.object({
    widthMeters: finiteNumber,
    depthMeters: finiteNumber,
  }),
  heightMeters: finiteNumber,
});

const instanceSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  position: z.object({ xMeters: finiteNumber, zMeters: finiteNumber }),
  rotationRadians: finiteNumber,
});

const layoutSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  instances: z.array(instanceSchema),
});

const underlaySchema = z.object({
  imageDataUrl: z.string().min(1),
  imageWidthPixels: finiteNumber.refine(
    (value) => value > 0,
    "must be positive",
  ),
  imageHeightPixels: finiteNumber.refine(
    (value) => value > 0,
    "must be positive",
  ),
  metersPerPixel: finiteNumber.refine((value) => value > 0, "must be positive"),
  origin: z.object({ xMeters: finiteNumber, zMeters: finiteNumber }),
  visible: z.boolean(),
});

const projectSchema = z.object({
  floor: floorSchema,
  underlay: underlaySchema.nullable(),
  products: z.array(productSchema),
  // At least one: a project with nowhere to put furniture is not a project,
  // and every accessor is written knowing there is one to fall back to.
  layouts: z.array(layoutSchema).min(1),
  activeLayoutId: z.string().min(1),
  displayUnit: z.enum(["metric", "imperial"]),
});

/**
 * What the schema parses has to be a `Project`. If the domain type gains a
 * field, or changes one's type, and this schema does not follow, this stops
 * compiling rather than failing at runtime on someone's machine.
 */
const _parsedIsAProject = (parsed: z.infer<typeof projectSchema>): Project =>
  parsed;
void _parsedIsAProject;

export const storedProjectSchema = z.object({
  id: z.string().min(1),
  version: z.literal(SCHEMA_VERSION),
  updatedAt: wholeNumber,
  project: projectSchema,
});

/**
 * Written by hand rather than inferred, so the document it carries is the
 * domain's `Project` — the schema's inferred version differs only in that Zod
 * cannot express `readonly`, and that difference is not worth propagating.
 */
export type StoredProject = {
  readonly id: string;
  readonly version: number;
  readonly updatedAt: number;
  readonly project: Project;
};

export type ReadResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly reason: ReadFailure };

export type ReadFailure =
  /** Not a document we recognize at all, or one that failed validation. */
  | "unreadable"
  /** Written by a build newer than this one. Refused rather than guessed at. */
  | "from-a-newer-version";

/**
 * One step forward, keyed by the version it upgrades from.
 *
 * Each runs on data that has not been validated yet, so a step must tolerate
 * anything and never throw — whatever it produces is parsed afterwards, and
 * that parse is what decides whether the result is usable.
 */
const MIGRATIONS: Record<number, (document: object) => object> = {
  1: (document) => ({
    ...document,
    version: 2,
    // Version 2 added placed furniture. A version 1 project had none, which is
    // an empty list rather than a missing field.
    project: { ...projectOf(document), instances: [] },
  }),
  2: (document) => {
    const project = projectOf(document);
    return {
      ...document,
      version: 3,
      project,
    };
  },
  3: (document) => {
    const project = projectOf(document);
    const room = roomOf(project) as Record<string, unknown>;
    // The room key itself goes: what it held is now spread across the floor.
    const rest = Object.fromEntries(
      Object.entries(project).filter(([key]) => key !== "room"),
    );

    // Version 4 made the apartment the unit of work. A version 3 project was
    // an apartment of exactly one room standing at the origin, which is what
    // it always was.
    return {
      ...document,
      version: 4,
      project: {
        ...rest,
        floor: {
          wallThicknessMeters: room.wallThicknessMeters,
          rooms: [
            {
              id: "room-1",
              name: "Living room",
              origin: { xMeters: 0, zMeters: 0 },
              widthMeters: room.widthMeters,
              depthMeters: room.depthMeters,
              heightMeters: room.heightMeters,
              openings: Array.isArray(room.openings) ? room.openings : [],
            },
          ],
        },
      },
    };
  },
  4: (document) => {
    const project = projectOf(document) as Record<string, unknown>;
    // The instances key itself goes: what it held is now inside a layout.
    const rest = Object.fromEntries(
      Object.entries(project).filter(([key]) => key !== "instances"),
    );

    // Version 5 gave furniture somewhere to live other than the project
    // itself. What a version 4 project held was one arrangement that nobody
    // had needed to name yet, so that is what it becomes.
    return {
      ...document,
      version: 5,
      project: {
        ...rest,
        layouts: [
          {
            id: "layout-1",
            name: "First try",
            instances: Array.isArray(project.instances)
              ? project.instances
              : [],
          },
        ],
        activeLayoutId: "layout-1",
      },
    };
  },
  // Parsing the next version strips fields its floor no longer recognizes.
  5: (document) => ({ ...document, version: 6 }),
  6: (document) => {
    const project = projectOf(document) as Record<string, unknown>;
    const floor = objectOf(project.floor);
    const rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
    return {
      ...document,
      version: 7,
      project: {
        ...project,
        floor: {
          ...floor,
          rooms: rooms.map((value) => {
            const room = objectOf(value);
            const roomId = typeof room.id === "string" ? room.id : "room";
            const partId = `${roomId}-part-1`;
            const openings = Array.isArray(room.openings) ? room.openings : [];
            return {
              id: room.id,
              name: room.name,
              heightMeters: room.heightMeters,
              parts: [
                {
                  id: partId,
                  origin: room.origin,
                  widthMeters: room.widthMeters,
                  depthMeters: room.depthMeters,
                },
              ],
              openings: openings.map((opening) => ({
                ...objectOf(opening),
                partId,
              })),
            };
          }),
        },
      },
    };
  },
  7: (document) => {
    const project = projectOf(document) as Record<string, unknown>;
    const floor = objectOf(project.floor);
    const rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
    return {
      ...document,
      version: 8,
      project: {
        ...project,
        floor: {
          ...floor,
          // Version 8 let a part turn. Every stored part was square to the
          // plan, which is exactly what a rotation of zero says.
          rooms: rooms.map((value) => {
            const room = objectOf(value);
            const parts = Array.isArray(room.parts) ? room.parts : [];
            return {
              ...room,
              parts: parts.map((part) => ({
                ...objectOf(part),
                rotationRadians: 0,
              })),
            };
          }),
        },
      },
    };
  },
  8: (document) => {
    const project = projectOf(document) as Record<string, unknown>;
    const floor = objectOf(project.floor);
    const rooms = Array.isArray(floor.rooms) ? floor.rooms : [];
    // The wallThicknessMeters key itself goes: it split into two.
    const rest = Object.fromEntries(
      Object.entries(floor).filter(([key]) => key !== "wallThicknessMeters"),
    );
    return {
      ...document,
      version: 9,
      project: {
        ...project,
        floor: {
          ...rest,
          // Version 9 split the one thickness into shell and partitions, and
          // let a wall be left open. A stored project had one thickness for
          // everything and every wall closed, so that is what it stays.
          exteriorWallThicknessMeters: floor.wallThicknessMeters,
          interiorWallThicknessMeters: floor.wallThicknessMeters,
          rooms: rooms.map((value) => {
            const room = objectOf(value);
            const parts = Array.isArray(room.parts) ? room.parts : [];
            return {
              ...room,
              parts: parts.map((part) => ({
                ...objectOf(part),
                openWalls: [],
              })),
            };
          }),
        },
      },
    };
  },
  9: (document) => ({
    ...document,
    version: 10,
    // Version 10 put the listing's plan under the canvas. A stored project
    // was traced from nothing, which is an underlay of null.
    project: { ...projectOf(document), underlay: null },
  }),
};

/**
 * Reads a raw stored value into a project, migrating older documents forward.
 *
 * Migrations run on devices where we never see them fail, so each one is tested
 * against a payload captured from the version it upgrades.
 */
export function readStoredProject(value: unknown): ReadResult {
  const version = versionOf(value);

  if (version === null || typeof value !== "object" || value === null) {
    return { ok: false, reason: "unreadable" };
  }
  if (version > SCHEMA_VERSION) {
    // An older build opening a newer document. Overwriting it with what this
    // build understands would silently destroy whatever the newer one added.
    return { ok: false, reason: "from-a-newer-version" };
  }

  let document: object = value;
  for (let from = version; from < SCHEMA_VERSION; from += 1) {
    const step = MIGRATIONS[from];
    if (step === undefined) {
      // A version we know is old but have no way to upgrade. Refusing keeps it
      // on disk for a build that can.
      return { ok: false, reason: "unreadable" };
    }
    document = step(document);
  }

  const parsed = storedProjectSchema.safeParse(document);
  return parsed.success
    ? { ok: true, project: parsed.data.project }
    : { ok: false, reason: "unreadable" };
}

/** The document's project, however malformed, for a migration to build on. */
function projectOf(document: object): object {
  const project = (document as { project?: unknown }).project;
  return typeof project === "object" && project !== null ? project : {};
}

function roomOf(project: object): object {
  const room = (project as { room?: unknown }).room;
  return typeof room === "object" && room !== null ? room : {};
}

function objectOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/** Reads the version without trusting anything else about the value. */
function versionOf(value: unknown): number | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const version = (value as { version?: unknown }).version;
  return typeof version === "number" && Number.isFinite(version)
    ? version
    : null;
}

export function toStoredProject(
  id: string,
  project: Project,
  updatedAt: number,
): StoredProject {
  return { id, version: SCHEMA_VERSION, updatedAt, project };
}
