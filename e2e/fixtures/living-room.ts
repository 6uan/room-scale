import type { Page } from "@playwright/test";

/**
 * A project holding the 14'×12' living room, put on the machine before the
 * application reads it.
 *
 * A new project is an empty floor now, and that is what most of these tests
 * used to get for free. The room is put back rather than the assertions
 * loosened: a great many of them are about exact geometry — a wall at 84
 * inches, a shared wall at 179.5, a window centred at 84 — and a test that
 * stops naming its numbers stops being able to catch them changing.
 *
 * Written straight into IndexedDB rather than drawn through the interface or
 * opened from a file, for two reasons. Drawing it would land on whatever the
 * pointer produced instead of the exact inches; opening a file would be an
 * undoable edit, which is precisely what `undo.spec.ts` is measuring.
 *
 * The document is a literal at a fixed schema version on purpose. It describes
 * bytes on a disk, so it should change when a migration says it changes and
 * never merely because a default moved.
 */

const DATABASE = "roomscale";
const STORE = "projects";

/** Retail measurements are inches; the stored document is meters. */
const inches = (value: number) => value * 0.0254;

const PART_ID = "room-1-part-1";

const DOCUMENT = {
  id: "current",
  version: 11,
  updatedAt: 1_700_000_000_000,
  project: {
    floor: {
      exteriorWallThicknessMeters: inches(8),
      interiorWallThicknessMeters: inches(4.5),
      rooms: [
        {
          id: "room-1",
          name: "Living room",
          heightMeters: inches(96),
          exteriorWallThicknessMeters: null,
          interiorWallThicknessMeters: null,
          parts: [
            {
              id: PART_ID,
              origin: { xMeters: -inches(84), zMeters: -inches(72) },
              widthMeters: inches(168),
              depthMeters: inches(144),
              rotationRadians: 0,
              openWalls: [],
            },
          ],
          openings: [
            {
              id: "door-1",
              kind: "door",
              partId: PART_ID,
              wall: "south",
              centerMeters: inches(36),
              widthMeters: inches(32),
              hinge: "start",
              swing: "inward",
            },
            {
              id: "window-1",
              kind: "window",
              partId: PART_ID,
              wall: "north",
              centerMeters: inches(84),
              widthMeters: inches(48),
            },
          ],
        },
      ],
    },
    underlay: null,
    products: [],
    layouts: [{ id: "layout-1", name: "First try", instances: [] }],
    activeLayoutId: "layout-1",
    displayUnit: "imperial",
  },
};

/**
 * Opens the workspace on that living room.
 *
 * Two navigations. The first lets the application create the database and
 * settle — waited for by the plan appearing, which only happens once the
 * project has been read, so the store is certainly there by the time the
 * record goes in. That first visit writes nothing itself: nothing has changed
 * yet, and the save only fires on a change. Then the reload reads the record
 * the way a returning visit would.
 *
 * Opened without naming a version, deliberately. The number IndexedDB holds is
 * Dexie's own — ten for the `version(1)` in `project-database.ts` — and
 * guessing at that convention would break the next time it moves.
 */
export async function openWithLivingRoom(page: Page, path = "/") {
  await seedStoredProject(page, DOCUMENT, path);
}

/**
 * A stored record this build cannot read, so the notice about it can be seen.
 *
 * A version 1 document whose project is nonsense: old enough that the read
 * path runs every migration at it, and malformed enough that what comes out
 * the far end fails to parse. That is the real failure — a record written by
 * something else, or corrupted on disk — rather than a mocked-out loader.
 */
const UNREADABLE_DOCUMENT = {
  id: "current",
  version: 1,
  updatedAt: 1_700_000_000_000,
  project: { room: "not a room" },
};

export async function openWithUnreadableProject(page: Page, path = "/") {
  await seedStoredProject(page, UNREADABLE_DOCUMENT, path);
}

/** Puts one document in the store and reloads onto it. */
async function seedStoredProject(
  page: Page,
  document: unknown,
  path: string,
): Promise<void> {
  await page.goto(path);
  await page.waitForSelector('[role="img"][aria-label^="Plan view"]');
  await page.evaluate(
    ({ database, store, document: record }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(database);
        open.onerror = () => reject(open.error);
        open.onblocked = () => reject(new Error("the database is blocked"));
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(store)) {
            db.close();
            reject(new Error(`no ${store} store to seed`));
            return;
          }
          const transaction = db.transaction(store, "readwrite");
          transaction.objectStore(store).put(record);
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { database: DATABASE, store: STORE, document },
  );
  await page.goto(path);
}
