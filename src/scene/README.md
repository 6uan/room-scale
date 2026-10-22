# `src/scene`

The perspective view: React Three Fiber components that stand the plan's
rooms up and show them from inside.

Nothing here decides where anything is. `src/domain/room/shell.ts` computes
the floor slabs and wall boxes in meters, in floor coordinates, from the same
functions the plan draws with, and is unit tested without a renderer. These
components place meshes where that module says and read nothing back out of
Three.js. No Three.js object is ever stored in state or on disk.

The view is for seeing the apartment, never for measuring it. Every number is
in the panels beside it, and the plan view keeps every capability it has.
