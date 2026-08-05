# Inspector layout spec

Status: **built**, for the room panel. Date: 2026-08-04.

Steps 1 and 2 of the order of work below are done: the tokens, the three
primitives in `src/components/panel/`, and the room panel re-laid onto them.
Steps 3 and 4 — the apartment, furniture, product and opening panels, and
deleting the ad-hoc classes as each is converted — are not.

The panel on the right has been laid out one row at a time. Each row was a
reasonable decision on its own, and together they use six text sizes, nine gap
values and six control heights, so nothing lines up with anything and two
different controls are both labelled "Walls". This is the scale everything gets
rebuilt onto.

## 1. Vocabulary

### Type

Three roles, and one exception for the panel's own name.

| Role          | Size / weight            | Used for                                 |
| ------------- | ------------------------ | ---------------------------------------- |
| Panel title   | 17px semibold            | "Room 2" — once per panel                |
| Section title | 13px medium              | Footprint, Openings, Walls               |
| Label         | 11px medium, 55% opacity | Position, Size, Angle, Corners           |
| Value         | 14px tabular             | Everything typed or read: numbers, names |
| Note          | 12px, 55% opacity        | The one-line hints, errors excepted      |

Gone: `text-sm` as a label, `text-[13px]` as a note, `text-xs` as both.

### Space

Four steps, no others.

| Step | Between                                              |
| ---- | ---------------------------------------------------- |
| 4px  | Items inside one control (chips in a segment)        |
| 8px  | A row's label and its control; fields inside a row   |
| 16px | Rows inside a section                                |
| 24px | Sections, with a hairline divider at the top of each |

Panel padding is 16px. Content width is therefore **288px** at the 320px panel.

### Controls

| Property    | Value                                                     |
| ----------- | --------------------------------------------------------- |
| Height      | **32px** — every input, chip, button, pad cell and select |
| Radius      | 8px for controls, 6px for chips inside a segment          |
| Border      | 1px at 15% — inputs only; chips and pads are fills        |
| Fill (rest) | 5%                                                        |
| Fill (on)   | 12%                                                       |

A control that cannot be 32px tall is not a control; it is a canvas, and the
wall pad is the only one.

## 2. Primitives

Three components in `src/components/panel/`. Every panel is built only from
these.

### `Section`

```tsx
<Section title="Footprint" action={<IconButton …/>}>…</Section>
```

A hairline divider, the title row, then children spaced 16px. Owns the 24px
between itself and the next section. No section may draw its own divider.

### `Row`

```tsx
<Row label="Angle">…</Row>          // label left, control right
<Row label="Size" wide>…</Row>      // label above, control full width
```

Label in a fixed **56px** column, control fills the remaining **224px**. This
is the alignment that makes an inspector read as a column rather than a pile.

**As built, the label is optional rather than the `wide` flag being available**
— which is how open question 1 was settled. A field carrying an X or a W badge
has already named itself, so a label beside it says it twice and costs a fifth
of the panel; a row of chips has named nothing, so it gets the column. The rule
stays mechanical: pass `label` when a reader could not name the control by
looking at it. `align="top"` is there for a control taller than one line.

### `Segments`

```tsx
<Segments items={…} value={…} onChange={…} />
```

One shape for what are currently three separate implementations: the angle
presets, the section-number picker, and the wall-kind buttons. Chips are 32px
tall, 4px apart, equal width, 12% fill when on.

## 3. The room panel on it

```
┌────────────────────────────────────────┐
│ Room 2                              🗑  │   panel title
├────────────────────────────────────────┤
│ Footprint                              │   section
│  Position  [ X 421.44 ][ Y -204.24 ]   │   row, label left
│  Size                                  │   row, wide
│           [ W 118.28 ][ D 138.24 ]     │
│  Ceiling   [ H 96 ]                    │   row, label left
│  Angle                                 │   row, wide
│           [∠ 0][ 0° ][30°][45°][60°][90°]
│  Corners   ⌜ ⌝                          │   row, label left
│            ⌞ ⌟                          │
│  Walls     ▭ pad                        │   row, label left
│            [Wall][Open][Dividing]      │
│                                        │
│  + Add section        113.5 sq ft      │
├────────────────────────────────────────┤
│ Openings                    🚪 🪟 ↔     │   section, action right
│  Door 1 · north wall               🗑   │
│  Door 2 · east wall                🗑   │
├────────────────────────────────────────┤
│ Wall thickness              4.5 in  ›  │   section, collapsed
└────────────────────────────────────────┘
```

Two changes fall out of the grid rather than being separate ideas:

- **Height leaves Size.** W and D are the section's; H is the room's. They were
  in one group because a room is quoted as W×D×H, and the code apologises for
  it in a comment. Splitting it makes Size a two-up that fits the 224px column
  with room to read, and puts the ceiling where it belongs — with the room.
- **"Walls" the thickness becomes "Wall thickness."** One panel cannot have two
  controls with one name.

## 4. Order of work

1. Tokens and the three primitives, with tests for `Row`'s two modes.
2. Room panel re-laid. Stop and look.
3. Apartment, furniture, product and opening panels onto the same primitives.
4. Delete the ad-hoc spacing and type classes as each panel is converted; the
   scale is only real when nothing bypasses it.

## 5. Open questions

- ~~**The 56px label column** costs a fifth of the panel's width.~~ **Settled:**
  neither, and both. The column exists but is spent only where the controls
  cannot name themselves, so the X/Y/W/D rows keep their full width and the
  chip rows are still labelled. See `Row` above.
- **Does the wall pad survive?** It is the only thing in the panel that is not
  32px tall and not on the grid. It could become a labelled row like everything
  else — four `Segments` chips, one per side — at the cost of no longer looking
  like the room.
- **`Ceiling` or `Height`.** "Ceiling 96 in" reads like a measurement someone
  took; "Height" reads like a property of a rectangle.
