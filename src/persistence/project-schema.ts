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
 */
export const SCHEMA_VERSION = 6;

/** Meters, cents, and the rest are all plain finite numbers on the way in. */
const finiteNumber = z
  .number()
  .refine(Number.isFinite, "must be a finite number");

const wholeNumber = z
  .number()
  .refine(Number.isSafeInteger, "must be a whole number");

const openingFields = {
  id: z.string().min(1),
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

const roomSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  origin: z.object({ xMeters: finiteNumber, zMeters: finiteNumber }),
  widthMeters: finiteNumber,
  depthMeters: finiteNumber,
  heightMeters: finiteNumber,
  openings: z.array(openingSchema),
});

const floorSchema = z.object({
  wallThicknessMeters: finiteNumber,
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

const projectSchema = z.object({
  floor: floorSchema,
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
