# `src/state`

The active project, held in one place so `/plan` and `/furniture` are two views
of the same thing rather than two islands.

`project-store.ts` is a Zustand store of plain serializable data. It does no
input and no output: reading and writing IndexedDB is `ProjectGate`'s job, in
`src/components`. That keeps the store testable without a database and keeps
the persistence boundary somewhere you can see it.

All maths is delegated to `src/domain`.
