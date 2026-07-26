# ADR 0002: Local-first persistence

- Status: Accepted
- Date: 2026-07-26

## Context

A RoomScale project is a room, some furniture, a few saved layouts, and a
shopping list. It is small, single-user, and personal: it reveals the shape of
someone's home, what they are about to buy, and how much they are spending.

A server-backed design would require accounts, authentication, a database,
hosting, a privacy policy, and a deletion path — a large amount of work and
ongoing cost for an open-source project whose value is a geometry engine. It
would also make self-hosting the only way for a privacy-conscious user to
participate.

The MVP explicitly excludes multiplayer, sharing, and checkout, so there is no
feature in scope that needs a server round-trip.

## Decision

**All project data lives in the user's browser. There is no backend.**

- IndexedDB, accessed through Dexie, is the store of record. All access is
  confined to `src/persistence`.
- Everything persisted is plain serializable data validated by Zod on read. No
  class instances, no Three.js objects, no functions.
- Records carry a schema version; reads run forward migrations.
- JSON export/import and CSV export are the portability and backup story, and
  they are first-class features rather than an afterthought.
- The Next.js app is a static front end. Server components may render the
  shell; they never own project state.

## Consequences

Positive:

- No account, no upload, no telemetry on room dimensions. The privacy story is
  "we never receive it."
- The app works offline once loaded, and a deploy is a static hosting job.
- Tests exercise the real storage boundary in jsdom / a browser without
  fixtures for a server.

Negative:

- Data is scoped to one browser profile on one device. Clearing site data or
  browsing in a private window loses the project. This must be stated plainly
  in the interface, not buried in a README.
- No sync across devices and no server-side backup; export is the only
  recovery. Users who ignore export can lose work.
- Storage may be evicted by the browser under pressure. Requesting persistent
  storage helps but is not guaranteed.
- Schema migrations run on user devices with no way to inspect failures
  centrally. Migration code needs unit tests against captured old payloads.
- Adding sharing later means introducing a server and reconciling divergent
  local copies. That is accepted; the local store stays authoritative in any
  such design.
