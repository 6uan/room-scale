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

## The link path

`product-html.ts` is how a fetched page reaches the same parser: scripts and
styles dropped, block tags turned into line breaks, entities decoded, and the
result handed to `extractProduct`. Where the markup carries a schema.org
`Product` block its name and price are preferred, because they are stated
rather than guessed. Article publishes one; `fixtures/article-abisko.html` is
a trimmed capture of its sectional page, kept as the regression fixture. The
fetch itself lives in `src/app/api/import`, outside the domain.

## Readers for particular shops

`retailers.ts` is a registry keyed by hostname, for the shops whose pages the
generic parser gets wrong. Wayfair is the first: it prints the price of a
matching set, of assembly, and of a protection plan the same way it prints
the product's own, and keeps the real one only in escaped script state under
`leadPrice`. Its reader reads that field. What a reader returns overrides the
parser; what it leaves out, the parser fills in. Every reader ships with a
trimmed capture of a real page under `fixtures/`, so when a shop changes its
markup the fixture test fails rather than a number coming out wrong.

Every value also carries the line above it as `context`, shown in the report
as "under …". A price reads the same whichever product it belongs to; the
line above is what makes a wrong one visible before it is saved.

## Why text and not HTML

It reads visible page text — what a person gets by selecting a page and copying
— rather than markup. Retail HTML is full of stylesheet lengths and script
numbers that look exactly like measurements (`height:100px`, `Height = 524`),
and none of it survives into what is rendered.
