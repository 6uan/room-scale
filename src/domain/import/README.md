# `src/domain/import`

Reading a product out of the text of the page selling it — the deterministic
half of assisted import, per `docs/adr/0005-assisted-product-import.md`.

It matches patterns and reports what it matched. It never infers, and it never
fills a field it did not actually read. Every value carries the text it came
from, so a person can check the number against the page rather than take this
module's word for it.

## What the real pages turned out to be like

Built against two pages actually being considered — a Target TV stand and an
Amazon sectional. Both shaped it:

- **Neither publishes schema.org metadata** for furniture, so there is no
  structured source to prefer over prose. Prose is the source.
- **Amazon prints `52.8 x 125.8 x 36.4 inches` with no axis labels.** Which
  number is the width is a convention, not a fact, so a positional match sets
  `dimensionOrderIsAssumed` and the interface says so.
- **Target's page is a JavaScript shell.** Fetching its URL returns markup with
  no title, no price, and no dimensions in it. Pasting what is on screen works
  where fetching the address never will, which is why that path came first.

## Why text and not HTML

It reads visible page text — what a person gets by selecting a page and copying
— rather than markup. Retail HTML is full of stylesheet lengths and script
numbers that look exactly like measurements (`height:100px`, `Height = 524`),
and none of it survives into what is rendered.
