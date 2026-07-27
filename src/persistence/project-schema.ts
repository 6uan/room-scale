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
 */
export const SCHEMA_VERSION = 2;

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
  widthMeters: finiteNumber,
  depthMeters: finiteNumber,
  heightMeters: finiteNumber,
  wallThicknessMeters: finiteNumber,
  openings: z.array(openingSchema),
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

const projectSchema = z.object({
  room: roomSchema,
  products: z.array(productSchema),
  instances: z.array(instanceSchema),
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
