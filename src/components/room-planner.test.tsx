import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { resetProjectStore, useProjectStore } from "@/state/project-store";
import { RoomPlanner } from "./room-planner";

// The project store is module-level, so it outlives a single test.
beforeEach(resetProjectStore);

/**
 * The canvas itself is not exercised here: jsdom gives elements a zero size and
 * no 2D context, so the drawing effect returns early. The projection and
 * opening geometry it would use are covered in `src/domain`, and the plan view
 * is checked in a real browser by `e2e/plan.spec.ts`. What matters here is that
 * the room can be read and edited entirely without the drawing.
 */

function dimensions() {
  return within(screen.getByRole("region", { name: "Dimensions" }));
}

function openings() {
  return within(screen.getByRole("region", { name: "Openings" }));
}

function opening(name: string) {
  return within(openings().getByRole("group", { name }));
}

function widthInput() {
  return dimensions().getByLabelText("Width");
}

function planDescription() {
  return screen.getByRole("img", { name: /^Plan view/ });
}

describe("RoomPlanner dimensions", () => {
  it("opens on the default room, in inches", () => {
    render(<RoomPlanner />);

    // 4.2 m is 165.35 inches.
    expect(widthInput()).toHaveValue(165.35);
    expect(dimensions().getAllByText(`13' 9.4"`)).toHaveLength(1);
  });

  it("edits a dimension and updates the summary and the plan description", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.clear(widthInput());
    await user.type(widthInput(), "120");

    expect(planDescription()).toHaveAccessibleName(/10' 0\.0" wide/);
    // 120 by 141.73 inches is 118.1 square feet.
    expect(screen.getByText("118.1 sq ft")).toBeInTheDocument();
  });

  it("converts the fields when the unit changes, without changing the room", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(screen.getByLabelText("Centimeters"));

    expect(widthInput()).toHaveValue(420);
    expect(dimensions().getByLabelText("Depth")).toHaveValue(360);
    expect(screen.getByText("15.12 m²")).toBeInTheDocument();
  });

  it("refuses an out-of-range dimension and says why", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    // Pasted rather than typed: typing arrives one digit at a time, and "200"
    // is a legitimate width on the way to an illegitimate "2000".
    await user.clear(widthInput());
    await user.paste("2000");

    expect(widthInput()).toBeInvalid();
    expect(dimensions().getByText(`At most 98' 5.1".`)).toBeInTheDocument();
    // The room itself is untouched, so the plan still shows the last good width.
    expect(planDescription()).toHaveAccessibleName(/13' 9\.4" wide/);
  });

  it("treats an emptied field as incomplete rather than as zero", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.clear(widthInput());

    expect(dimensions().getByText("Enter a number.")).toBeInTheDocument();
    expect(planDescription()).toHaveAccessibleName(/13' 9\.4" wide/);
  });

  it("keeps wall thickness out of the floor area", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    const before = screen.getByText("162.8 sq ft");
    expect(before).toBeInTheDocument();

    await user.clear(dimensions().getByLabelText("Wall thickness"));
    await user.paste("12");

    expect(screen.getByText("162.8 sq ft")).toBeInTheDocument();
  });
});

describe("RoomPlanner openings", () => {
  it("describes the default door and window in the plan", () => {
    render(<RoomPlanner />);

    expect(planDescription()).toHaveAccessibleName(
      /a door 2' 8\.0" wide on the south wall/,
    );
    expect(planDescription()).toHaveAccessibleName(
      /a window 4' 0\.0" wide on the north wall/,
    );
  });

  it("adds an opening of a standard size, centered on the wall", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(screen.getByRole("button", { name: "Add passage" }));

    // 36 inches, the walkway minimum, centered on the 4.2 m north wall.
    expect(opening("Passage 1").getByLabelText("Width")).toHaveValue(36);
    expect(opening("Passage 1").getByLabelText("Center")).toHaveValue(82.68);
    expect(planDescription()).toHaveAccessibleName(
      /an open passage 3' 0\.0" wide on the north wall/,
    );
  });

  it("removes an opening", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(screen.getByRole("button", { name: "Remove window 1" }));

    expect(planDescription()).toHaveAccessibleName(/1 opening:/);
    expect(planDescription()).not.toHaveAccessibleName(/window/);
  });

  it("keeps an opening on the wall when it is moved to a shorter one", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    // The window is centered at 2.1 m, past the middle of the 3.6 m east wall.
    await user.selectOptions(
      opening("Window 1").getByLabelText("Window 1 wall"),
      "east",
    );

    expect(opening("Window 1").queryByRole("alert")).not.toBeInTheDocument();
    expect(planDescription()).toHaveAccessibleName(
      /a window 4' 0\.0" wide on the east wall/,
    );
  });

  it("reports an opening that no longer fits after the room shrinks", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    // The door is centered 0.9 m along the south wall; a 1 m room cuts it off.
    await user.clear(widthInput());
    await user.paste("40");

    expect(opening("Door 1").getByRole("alert")).toHaveTextContent(
      /runs past the end of a 3' 4\.0" wall/,
    );
  });

  it("offers a hinge and a swing for doors only", () => {
    render(<RoomPlanner />);

    expect(
      opening("Door 1").getByLabelText("Door 1 hinge"),
    ).toBeInTheDocument();
    expect(
      opening("Window 1").queryByLabelText("Window 1 hinge"),
    ).not.toBeInTheDocument();
  });
});

describe("RoomPlanner furniture", () => {
  function furniture() {
    return within(screen.getByRole("region", { name: "Furniture" }));
  }

  /** The catalogue is part of the same project, so it can be seeded directly. */
  function seedCatalogue() {
    useProjectStore.getState().setProducts([
      {
        id: "rug",
        name: "Rug",
        retailer: "",
        productUrl: "",
        priceCents: 34900,
        purchaseStatus: "considering",
        footprint: { widthMeters: 2.4384, depthMeters: 1.524 },
        heightMeters: 0.01,
      },
    ]);
  }

  it("offers the catalogue, and says when it is empty", () => {
    render(<RoomPlanner />);

    expect(furniture().getByText(/catalogue is empty/)).toBeInTheDocument();
    expect(furniture().getByText(/Nothing placed yet/)).toBeInTheDocument();
  });

  it("places a product in the room", async () => {
    const user = userEvent.setup();
    seedCatalogue();
    render(<RoomPlanner />);

    await user.click(
      screen.getByRole("button", { name: "Place Rug in the room" }),
    );

    expect(
      furniture().queryByText(/Nothing placed yet/),
    ).not.toBeInTheDocument();
    expect(planDescription()).toHaveAccessibleName(/1 piece placed: Rug/);
  });

  it("places the same product twice, as two copies of one thing", async () => {
    const user = userEvent.setup();
    seedCatalogue();
    render(<RoomPlanner />);

    const place = () =>
      user.click(screen.getByRole("button", { name: "Place Rug in the room" }));
    await place();
    await place();

    expect(furniture().getByText("2 in the room")).toBeInTheDocument();
    expect(planDescription()).toHaveAccessibleName(/2 pieces placed/);
    // Two placements, still one product.
    expect(useProjectStore.getState().project.products).toHaveLength(1);
  });

  it("gives each copy its own spot rather than stacking them", async () => {
    const user = userEvent.setup();
    seedCatalogue();
    render(<RoomPlanner />);

    const place = () =>
      user.click(screen.getByRole("button", { name: "Place Rug in the room" }));
    await place();
    await place();

    const [first, second] = useProjectStore.getState().project.instances;
    expect(first?.position).not.toEqual(second?.position);
  });

  it("takes a piece back out of the room", async () => {
    const user = userEvent.setup();
    seedCatalogue();
    render(<RoomPlanner />);

    await user.click(
      screen.getByRole("button", { name: "Place Rug in the room" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Take Rug out of the room" }),
    );

    expect(furniture().getByText(/Nothing placed yet/)).toBeInTheDocument();
    expect(planDescription()).toHaveAccessibleName(/Nothing placed in it yet/);
  });

  it("shows each placed piece at its product's dimensions", async () => {
    const user = userEvent.setup();
    seedCatalogue();
    render(<RoomPlanner />);

    await user.click(
      screen.getByRole("button", { name: "Place Rug in the room" }),
    );

    expect(furniture().getByText(`8' 0.0" × 5' 0.0"`)).toBeInTheDocument();
  });
});

describe("RoomPlanner moving furniture", () => {
  function furniture() {
    return within(screen.getByRole("region", { name: "Furniture" }));
  }

  function seedCatalogue() {
    useProjectStore.getState().setProducts([
      {
        id: "rug",
        name: "Rug",
        retailer: "",
        productUrl: "",
        priceCents: 34900,
        purchaseStatus: "considering",
        footprint: { widthMeters: 2.4384, depthMeters: 1.524 },
        heightMeters: 0.01,
      },
    ]);
  }

  /**
   * Places one rug and returns it selected, which is how it lands. The canvas
   * cannot be dragged here — jsdom gives it no size and so no projection — so
   * these cover the two ways in that do not need the drawing. The drag itself
   * is checked in a real browser by `e2e/plan.spec.ts`.
   */
  async function placeRug(user: ReturnType<typeof userEvent.setup>) {
    seedCatalogue();
    render(<RoomPlanner />);
    await user.click(
      screen.getByRole("button", { name: "Place Rug in the room" }),
    );
  }

  function placement() {
    return within(furniture().getByRole("group", { name: "Where Rug sits" }));
  }

  function placedInstance() {
    return useProjectStore.getState().project.instances[0];
  }

  it("selects a piece as it lands, and opens where it sits", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    // The default room is 4.2 m by 3.6 m, so the middle is 82.68 by 70.87 in.
    expect(furniture().getByRole("button", { name: "Rug" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(placement().getByLabelText("From west")).toHaveValue(82.68);
    expect(placement().getByLabelText("From north")).toHaveValue(70.87);
    expect(placement().getByLabelText("Turn")).toHaveValue(0);
  });

  it("puts a piece down again when its name is pressed a second time", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    await user.click(furniture().getByRole("button", { name: "Rug" }));

    expect(
      furniture().queryByRole("group", { name: "Where Rug sits" }),
    ).not.toBeInTheDocument();
  });

  it("moves a piece by typing a position", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    await user.clear(placement().getByLabelText("From west"));
    await user.paste("24");

    // 24 inches is 0.6096 m, from the west wall to the center of the rug.
    expect(placedInstance()?.position.xMeters).toBeCloseTo(0.6096, 10);
    expect(planDescription()).toHaveAccessibleName(
      /2' 0\.0" from the west wall/,
    );
  });

  it("refuses a position off the floor and leaves the piece where it was", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    await user.clear(placement().getByLabelText("From north"));
    await user.paste("400");

    expect(placement().getByLabelText("From north")).toBeInvalid();
    expect(placedInstance()?.position.zMeters).toBeCloseTo(1.8, 10);
  });

  it("nudges the selected piece with an arrow key", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    furniture().getByRole("button", { name: "Rug" }).focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");

    // Two 5 cm steps east of the middle of a 4.2 m room.
    expect(placedInstance()?.position.xMeters).toBeCloseTo(2.2, 10);
  });

  it("takes a finer step with Shift held", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    furniture().getByRole("button", { name: "Rug" }).focus();
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");

    expect(placedInstance()?.position.zMeters).toBeCloseTo(1.79, 10);
  });

  it("turns a piece by typing degrees", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    await user.clear(placement().getByLabelText("Turn"));
    await user.paste("90");

    expect(placedInstance()?.rotationRadians).toBeCloseTo(Math.PI / 2, 10);
    expect(planDescription()).toHaveAccessibleName(/turned 90°/);
  });

  it("turns a piece with the bracket keys", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    furniture().getByRole("button", { name: "Rug" }).focus();
    await user.keyboard("]");
    expect(placement().getByLabelText("Turn")).toHaveValue(15);

    // "[[" is how user-event types one bracket: a single one opens a key code.
    await user.keyboard("[[");
    await user.keyboard("[[");

    // Anticlockwise past zero reads as 345°, not as a negative angle.
    expect(placement().getByRole("status")).toHaveTextContent(/turned 345°/);
  });

  it("says where the piece sits, for anyone who cannot see it move", async () => {
    const user = userEvent.setup();
    await placeRug(user);

    furniture().getByRole("button", { name: "Rug" }).focus();
    await user.keyboard("{ArrowDown}");

    expect(placement().getByRole("status")).toHaveTextContent(
      `Rug is 6' 10.7" from the west wall and 6' 0.8" from the north wall, turned 0°.`,
    );
  });

  it("tells two copies of one product apart", async () => {
    const user = userEvent.setup();
    await placeRug(user);
    await user.click(
      screen.getByRole("button", { name: "Place Rug in the room" }),
    );

    // The second is the one that was just placed, so it is the selected one.
    expect(furniture().getByRole("button", { name: "Rug 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      furniture().getByRole("group", { name: "Where Rug 2 sits" }),
    ).toBeInTheDocument();
  });
});

describe("RoomPlanner fit", () => {
  /**
   * A sectional and a coffee table, the two pieces the real room turns on. The
   * sectional is 2.4 m by 1.6 m and the table is 0.9 m square.
   */
  function seedCatalogue() {
    useProjectStore.getState().setProducts([
      {
        id: "sectional",
        name: "Sectional",
        retailer: "",
        productUrl: "",
        priceCents: 199900,
        purchaseStatus: "considering",
        footprint: { widthMeters: 2.4, depthMeters: 1.6 },
        heightMeters: 0.85,
      },
      {
        id: "table",
        name: "Coffee table",
        retailer: "",
        productUrl: "",
        priceCents: 39900,
        purchaseStatus: "considering",
        footprint: { widthMeters: 0.9, depthMeters: 0.9 },
        heightMeters: 0.4,
      },
    ]);
  }

  function fit() {
    return within(screen.getByRole("region", { name: "Plan" }));
  }

  /** Puts both pieces in the room, clear of each other. */
  function seedLayout() {
    seedCatalogue();
    useProjectStore.getState().setInstances([
      {
        id: "i1",
        productId: "sectional",
        position: { xMeters: 1.3, zMeters: 0.85 },
        rotationRadians: 0,
      },
      // Level with the sectional, but well to the east of it: moving it west
      // is then the one thing that puts the two into each other.
      {
        id: "i2",
        productId: "table",
        position: { xMeters: 3.5, zMeters: 0.85 },
        rotationRadians: 0,
      },
    ]);
  }

  it("says so when everything fits", () => {
    seedLayout();
    render(<RoomPlanner />);

    expect(fit().getByText(/Everything fits/)).toBeInTheDocument();
  });

  it("flags both pieces in words, and says by how much", async () => {
    const user = userEvent.setup();
    seedLayout();
    render(<RoomPlanner />);

    // Push the coffee table into the sectional: its west edge lands at 1.65 m
    // and the sectional reaches 2.5 m, so 0.85 m of each other.
    await user.click(screen.getByRole("button", { name: "Coffee table" }));
    await user.clear(
      within(
        screen.getByRole("group", { name: "Where Coffee table sits" }),
      ).getByLabelText("From west"),
    );
    await user.paste("82.68");

    expect(
      fit().getByText(`Sectional overlaps Coffee table by 2' 9.5".`),
    ).toBeInTheDocument();
  });

  it("reports a piece pushed through a wall, and which wall", async () => {
    const user = userEvent.setup();
    seedLayout();
    render(<RoomPlanner />);

    await user.click(screen.getByRole("button", { name: "Sectional" }));
    await user.clear(
      within(
        screen.getByRole("group", { name: "Where Sectional sits" }),
      ).getByLabelText("From west"),
    );
    await user.paste("24");

    // Centered 0.6096 m from the west wall, a 2.4 m piece reaches 0.59 m past.
    expect(
      fit().getByText(`Sectional crosses the west wall by 1' 11.2".`),
    ).toBeInTheDocument();
  });

  it("clears an overlap when the piece is nudged back out of the way", async () => {
    const user = userEvent.setup();
    seedLayout();
    render(<RoomPlanner />);

    await user.click(screen.getByRole("button", { name: "Coffee table" }));
    const table = within(
      screen.getByRole("group", { name: "Where Coffee table sits" }),
    );
    await user.clear(table.getByLabelText("From west"));
    await user.paste("82.68");
    expect(fit().getByText(/Sectional overlaps/)).toBeInTheDocument();

    await user.clear(table.getByLabelText("From west"));
    await user.paste("140");

    // Specific: the all-clear line contains the word "overlaps" itself.
    expect(fit().queryByText(/Sectional overlaps/)).not.toBeInTheDocument();
    expect(fit().getByText(/Everything fits/)).toBeInTheDocument();
  });

  it("reads the shortfall in the reader's own unit", async () => {
    const user = userEvent.setup();
    seedLayout();
    render(<RoomPlanner />);

    await user.click(screen.getByLabelText("Centimeters"));
    await user.click(screen.getByRole("button", { name: "Coffee table" }));
    await user.clear(
      within(
        screen.getByRole("group", { name: "Where Coffee table sits" }),
      ).getByLabelText("From west"),
    );
    await user.paste("210");

    expect(
      fit().getByText(`Sectional overlaps Coffee table by 85.0 cm.`),
    ).toBeInTheDocument();
  });
});

describe("RoomPlanner walkways", () => {
  function walkways() {
    return within(screen.getByRole("region", { name: "Walkways" }));
  }

  function fit() {
    return within(screen.getByRole("region", { name: "Plan" }));
  }

  /** A sectional in the catalogue, placed clear of the middle of the room. */
  function seedSectional() {
    useProjectStore.getState().setProducts([
      {
        id: "sofa",
        name: "Sectional",
        retailer: "",
        productUrl: "",
        priceCents: 199900,
        purchaseStatus: "considering",
        footprint: { widthMeters: 2.4, depthMeters: 1.6 },
        heightMeters: 0.85,
      },
    ]);
    useProjectStore.getState().setInstances([
      {
        id: "i1",
        productId: "sofa",
        position: { xMeters: 1.2, zMeters: 1.8 },
        rotationRadians: 0,
      },
    ]);
  }

  it("has no routes to begin with, and says what one is for", () => {
    render(<RoomPlanner />);

    expect(walkways().getByText(/No routes yet/)).toBeInTheDocument();
  });

  it("adds a route at the widths the guest room rule asks for", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(walkways().getByRole("button", { name: "Add a route" }));

    expect(walkways().getByLabelText("Needs at least")).toHaveValue(36);
    expect(walkways().getByLabelText("Would rather have")).toHaveValue(42);
  });

  it("says nothing about a route nothing is standing in", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(walkways().getByRole("button", { name: "Add a route" }));

    expect(fit().getByText(/Everything fits/)).toBeInTheDocument();
  });

  it("reports the width left and the shortfall when a sofa narrows a route", async () => {
    const user = userEvent.setup();
    seedSectional();
    render(<RoomPlanner />);

    await user.click(walkways().getByRole("button", { name: "Add a route" }));

    // The default route runs down the middle of the 4.2 m room, so its
    // preferred corridor starts at 2.1 − 21" = 1.567 m. The sectional reaches
    // 2.4 m, which is 32.8 inches into a 42 inch route: 9.2 left, well under
    // the 36 it needs.
    const message = fit().getByText(/is down to/);
    expect(message).toHaveTextContent(/short of the 3' 0\.0" it needs/);
    expect(message).toHaveTextContent(/In the way: Sectional/);
  });

  it("calls a route that clears the minimum but misses the preferred tight", async () => {
    const user = userEvent.setup();
    seedSectional();
    render(<RoomPlanner />);

    await user.click(walkways().getByRole("button", { name: "Add a route" }));

    // Pull the sectional west until only two inches of the route are lost:
    // the corridor's west edge is at 1.567 m, so the sofa's east edge has to
    // land at 1.618 m, which puts its center at 0.418 m.
    await user.clear(walkways().getByLabelText("Route start from west"));
    await user.paste("82.68");
    await user.click(screen.getByRole("button", { name: "Sectional" }));
    await user.clear(
      within(
        screen.getByRole("group", { name: "Where Sectional sits" }),
      ).getByLabelText("From west"),
    );
    await user.paste("16.46");

    const message = fit().getByText(/is down to/);
    expect(message).toHaveTextContent(/under the 3' 6\.0" you asked for/);
  });

  it("names the route the way its owner named it", async () => {
    const user = userEvent.setup();
    seedSectional();
    render(<RoomPlanner />);

    await user.click(walkways().getByRole("button", { name: "Add a route" }));
    await user.clear(walkways().getByLabelText("Name"));
    await user.type(walkways().getByLabelText("Name"), "To the guest room");

    expect(
      fit().getByText(/^To the guest room is down to/),
    ).toBeInTheDocument();
  });

  it("refuses a route with both ends in the same place, and says why", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(walkways().getByRole("button", { name: "Add a route" }));
    await user.clear(walkways().getByLabelText("Route end from north"));
    await user.paste("0");

    expect(walkways().getByRole("alert")).toHaveTextContent(
      /Both ends are in nearly the same place/,
    );
  });

  it("removes a route", async () => {
    const user = userEvent.setup();
    seedSectional();
    render(<RoomPlanner />);

    await user.click(walkways().getByRole("button", { name: "Add a route" }));
    expect(fit().getByText(/is down to/)).toBeInTheDocument();

    await user.click(walkways().getByRole("button", { name: "Remove Route" }));

    expect(walkways().getByText(/No routes yet/)).toBeInTheDocument();
    expect(fit().getByText(/Everything fits/)).toBeInTheDocument();
  });
});
