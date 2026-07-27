# ADR 0005: Assisted product import, with generated values never trusted

- Status: Accepted
- Date: 2026-07-26

## Context

Entering a product by hand means copying eight fields off a retail page:
name, three dimensions, price, retailer, link, and status. A room's worth of
furniture is a dozen of those. That tedium is the most likely reason for the
tool to go unused, and it falls entirely on the one person the tool is for.

Three things could fill those fields in, and they are not equally trustworthy.

**Structured metadata.** Most furniture retailers already publish
`<script type="application/ld+json">` with a schema.org `Product`: name, price,
brand, SKU, image. Parsing it is deterministic and cannot invent a value.
Dimensions, however, are usually absent from it.

**Text patterns.** Dimensions almost always appear in prose or a spec table —
`112"W x 65"D x 34"H`, `Overall Width - Side to Side: 112"`,
`112 x 65 x 34 inches`. A parser over those patterns either matches or does not,
can point at the exact text it matched, and can be unit tested against strings
captured from real pages.

**A language model.** It reads anything, including pages the other two cannot,
and it is the only option that degrades silently. A model that reads `56` as
`65` produces a plausible number in a tool whose entire premise is dimensional
correctness, and the error surfaces when the sofa is delivered.

Fetching is its own problem. This is a local-first browser application, and a
browser cannot fetch a cross-origin page. A URL therefore requires something
server-side, which the Next.js app can provide but which many retailers defeat
anyway through bot detection or JavaScript-rendered markup.

`AGENTS.md` also listed "retailer scraping" as out of scope. Fetching one page
the user is already looking at, on their explicit action, is a different act
from harvesting a catalogue, but the specification did not distinguish them.

## Decision

**Import fills the form in. It never creates a product, and a generated value is
never stored without being seen.**

Sources are tried in order of how much they can be trusted:

1. **Pasted page text**, parsed for JSON-LD and then for dimension patterns.
   Pure, offline, unit tested. Always available, and the fallback whenever the
   later sources fail.
2. **A pasted URL**, fetched by a Next route handler and run through the same
   parser. One page, one user action, no crawling and no bulk collection.
   Blocked or empty pages report that plainly and hand back to source 1.
3. **A local language model** at `localhost:11434`, with output constrained to
   the product schema. Reached only for pages the parser could not read, and
   entirely optional — the first two sources work whether or not it is running.

Every source ends at the same place: the product form, filled in, showing what
was found and the source text each value came from. The person confirms or
corrects it before it becomes a product.

The specification is amended to permit single-page import on explicit user
action, and to keep bulk scraping out of scope.

## Consequences

Positive:

- The tedious part goes away without the trustworthy part going with it. A
  parser failure is visible; a model hallucination would not have been.
- Local inference keeps ADR 0002's promise: no account, no third party, no page
  content leaving the machine.
- The dimension parser is testable, so the retailers actually used become
  regression fixtures rather than anecdotes.

Negative:

- The application is no longer purely client-side. A route handler runs on a
  server, which is a boundary that did not exist before, and anything it fetches
  arrives from an untrusted origin and has to be treated that way — size limits,
  timeouts, and no execution of anything retrieved.
- Retailer coverage will be uneven and will rot. Pages change, blocks appear,
  and a parser that worked in July fails in December. Manual entry has to remain
  a first-class path forever, not a legacy one.
- The optional model is a third configuration state — running, not running, or
  running and wrong — and each has to be handled and explained.
- Fetching a page on someone's behalf carries terms-of-service questions that
  the one-page-on-request limit reduces but does not remove.
