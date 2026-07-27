# `src/persistence`

Dexie over IndexedDB, per `docs/adr/0002-local-first-persistence.md`.

| Module                  | Holds                                              |
| ----------------------- | -------------------------------------------------- |
| `project-database.ts`   | The Dexie database and its table.                  |
| `project-schema.ts`     | Zod schemas, the document version, and migrations. |
| `project-repository.ts` | Loading and saving a `Project`.                    |

Everything crossing this boundary is plain serializable data — never a
Three.js object or a class instance.

Two versions are in play and they are different numbers. Dexie's `version(1)`
is the shape of the _tables_. `SCHEMA_VERSION` is the shape of the _document_
inside a row. Adding a field to a project changes the second, not the first.

What comes out of storage is parsed, not cast. It was written by a possibly
older build on a device we cannot see. A record that fails to parse is kept
aside rather than overwritten, and a document from a newer build is refused
rather than half-understood.
