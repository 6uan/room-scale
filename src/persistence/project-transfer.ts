/**
 * Taking a project out of the browser, and putting one back in.
 *
 * An exported file is the same document IndexedDB holds, in the same versioned
 * envelope. That is deliberate: it means an import goes through
 * `readStoredProject`, so a file written by an older build is migrated forward
 * exactly the way a stored record is, and a file written by a newer one is
 * refused rather than half-understood. A second format would have been a second
 * set of migrations to keep honest.
 *
 * Everything here is text in and text out. Choosing a file, downloading one,
 * and the rest of the browser's part belong to the interface.
 */

import type { Project } from "@/domain/project";
import {
  SCHEMA_VERSION,
  readStoredProject,
  type ReadResult,
} from "./project-schema";

/** What an exported file is called, before the browser adds anything to it. */
export const EXPORT_FILE_NAME = "roomscale-project.json";
export const CHECKLIST_FILE_NAME = "roomscale-checklist.csv";

/**
 * The project as a file's worth of text.
 *
 * Indented, because a file somebody may open in a text editor to see what it
 * holds is worth two spaces. `updatedAt` is passed in rather than read from the
 * clock so this stays a pure function of its inputs.
 */
export function exportProject(project: Project, updatedAt: number): string {
  return `${JSON.stringify(
    { id: "current", version: SCHEMA_VERSION, updatedAt, project },
    null,
    2,
  )}\n`;
}

export type ImportResult =
  | { readonly ok: true; readonly project: Project }
  | { readonly ok: false; readonly reason: ImportFailure };

export type ImportFailure =
  /** Not JSON at all: the wrong file, or one that was damaged in transit. */
  | "not-json"
  /** JSON, but not a RoomScale project — or one that failed validation. */
  | "unreadable"
  /** Written by a build newer than this one. */
  | "from-a-newer-version";

/**
 * Reads a file back into a project, migrating an older one forward.
 *
 * Nothing here trusts the input. A file has been on a disk, through a mail
 * client, and possibly through somebody's text editor since it was written.
 */
export function importProject(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }

  const result: ReadResult = readStoredProject(parsed);
  return result.ok
    ? { ok: true, project: result.project }
    : { ok: false, reason: result.reason };
}
