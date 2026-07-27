import { expect, test, type Page } from "@playwright/test";

function dimensions(page: Page) {
  return page.getByRole("region", { name: "Dimensions" });
}

function planImage(page: Page) {
  return page.getByRole("img", { name: /^Plan view/ });
}

test.describe("room plan", () => {
  test("describes the default room in both the fields and the summary", async ({
    page,
  }) => {
    await page.goto("/plan");

    await expect(
      page.getByRole("heading", { level: 1, name: "The room" }),
    ).toBeVisible();
    await expect(dimensions(page).getByLabel("Width")).toHaveValue("165.35");
    await expect(page.getByText("162.8 sq ft")).toBeVisible();
  });

  test("draws the plan on a sized canvas", async ({ page }) => {
    await page.goto("/plan");

    await expect(planImage(page)).toBeVisible();

    // The drawing only happens once the element has been measured, so a
    // backing store with real pixels is the evidence that it ran.
    const backingWidth = await planImage(page).evaluate(
      (element) => (element as HTMLCanvasElement).width,
    );
    expect(backingWidth).toBeGreaterThan(0);
  });

  test("switches display units without changing the room", async ({ page }) => {
    await page.goto("/plan");

    await page.getByLabel("Centimeters").check();

    await expect(dimensions(page).getByLabel("Width")).toHaveValue("420");
    await expect(dimensions(page).getByLabel("Depth")).toHaveValue("360");
    await expect(page.getByText("15.12 m²")).toBeVisible();
  });

  test("edits a dimension through the numeric field alone", async ({
    page,
  }) => {
    await page.goto("/plan");

    await dimensions(page).getByLabel("Width").fill("120");

    await expect(planImage(page)).toHaveAccessibleName(/10' 0\.0" wide/);
  });

  test("adds and removes an opening", async ({ page }) => {
    await page.goto("/plan");

    await expect(planImage(page)).toHaveAccessibleName(/2 openings/);

    await page.getByRole("button", { name: "Add passage" }).click();
    await expect(planImage(page)).toHaveAccessibleName(
      /an open passage 3' 0\.0" wide on the north wall/,
    );

    await page.getByRole("button", { name: "Remove passage 1" }).click();
    await expect(planImage(page)).toHaveAccessibleName(/2 openings/);
  });

  test("moves an opening to another wall", async ({ page }) => {
    await page.goto("/plan");

    const window = page.getByRole("group", { name: "Window 1" });
    await window.getByLabel("Window 1 wall").selectOption("east");

    await expect(planImage(page)).toHaveAccessibleName(
      /a window 4' 0\.0" wide on the east wall/,
    );
  });
});

test.describe("saved projects", () => {
  test("keeps the room and the furniture across a reload", async ({ page }) => {
    await page.goto("/plan");
    await dimensions(page).getByLabel("Width").fill("120");

    await page.goto("/furniture");
    await page.getByLabel("Name").fill("Olive tree");
    await page.getByLabel("Price").fill("129.00");
    await page.getByRole("button", { name: "Add product" }).click();

    // Scoped to the table: the running total shows the same figure.
    const olive = page.getByRole("row", { name: /Olive tree/ });
    await expect(olive).toBeVisible();

    // Human latency again: the write is issued at once but is asynchronous,
    // and Playwright can reload before it lands.
    await page.waitForTimeout(250);
    await page.reload();

    // Entered on one page, still there after reloading the other.
    await expect(page.getByRole("row", { name: /Olive tree/ })).toBeVisible();
    await page.goto("/plan");
    await expect(dimensions(page).getByLabel("Width")).toHaveValue("120");
  });

  test("shares the display unit between both pages", async ({ page }) => {
    await page.goto("/furniture");
    await page.getByLabel("Centimeters").check();

    // A write is issued straight away, but it is asynchronous, and Playwright
    // can navigate within a millisecond or two of the click — faster than a
    // person could. The pause stands in for human latency rather than papering
    // over a wait the application needs.
    await page.waitForTimeout(250);

    await page.goto("/plan");
    await expect(page.getByLabel("Centimeters")).toBeChecked();
  });
});

test.describe("placing furniture", () => {
  async function addRug(page: Page) {
    await page.goto("/furniture");
    await page.getByLabel("Name").fill("Rug");
    await page.getByLabel("Width").fill("96");
    await page.getByLabel("Depth").fill("60");
    await page.getByRole("button", { name: "Add product" }).click();
    await expect(page.getByRole("row", { name: /Rug/ }).first()).toBeVisible();
  }

  test("places a product in the room and draws it", async ({ page }) => {
    await addRug(page);
    await page.goto("/plan");

    await page.getByRole("button", { name: "Place Rug in the room" }).click();

    await expect(planImage(page)).toHaveAccessibleName(/1 piece placed: Rug/);
    await expect(
      page
        .getByRole("region", { name: "Furniture" })
        .getByText("8' 0.0\" × 5' 0.0\""),
    ).toBeVisible();
  });

  test("keeps placements across a reload", async ({ page }) => {
    await addRug(page);
    await page.goto("/plan");
    await page.getByRole("button", { name: "Place Rug in the room" }).click();
    await expect(planImage(page)).toHaveAccessibleName(/1 piece placed/);

    await page.waitForTimeout(250);
    await page.reload();

    await expect(planImage(page)).toHaveAccessibleName(/1 piece placed: Rug/);
  });

  test("refuses to delete a product that is still in the room", async ({
    page,
  }) => {
    await addRug(page);
    await page.goto("/plan");
    await page.getByRole("button", { name: "Place Rug in the room" }).click();
    await page.waitForTimeout(250);

    await page.goto("/furniture");
    await page.getByRole("button", { name: "Remove Rug" }).click();

    // Scoped: Next's route announcer is also a live region with role="alert".
    await expect(
      page.getByRole("region", { name: "Catalogue" }).getByRole("alert"),
    ).toContainText(/still in the room/);
    await expect(page.getByRole("row", { name: /Rug/ })).toBeVisible();
  });
});

test.describe("moving furniture", () => {
  async function placeRug(page: Page) {
    await page.goto("/furniture");
    await page.getByLabel("Name").fill("Rug");
    await page.getByLabel("Width").fill("96");
    await page.getByLabel("Depth").fill("60");
    await page.getByRole("button", { name: "Add product" }).click();
    await expect(page.getByRole("row", { name: /Rug/ }).first()).toBeVisible();

    await page.goto("/plan");
    await page.getByRole("button", { name: "Place Rug in the room" }).click();
    // It lands in the middle of the room, selected, ready to be moved.
    await expect(placement(page).getByLabel("From west")).toHaveValue("82.68");
  }

  function placement(page: Page) {
    return page.getByRole("group", { name: "Where Rug sits" });
  }

  async function inches(page: Page, label: string) {
    return Number(await placement(page).getByLabel(label).inputValue());
  }

  /** The middle of the canvas, which is where the middle of the room is drawn. */
  async function planCenter(page: Page) {
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    return { box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  test("drags a piece across the room", async ({ page }) => {
    await placeRug(page);
    const { x, y } = await planCenter(page);

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y + 30, { steps: 10 });
    await page.mouse.up();

    // Right and down the plan is east and south: further from both walls.
    expect(await inches(page, "From west")).toBeGreaterThan(82.68);
    expect(await inches(page, "From north")).toBeGreaterThan(70.87);
    await expect(planImage(page)).toHaveAccessibleName(
      /from the west wall and .* from the north wall/,
    );
  });

  test("nudges the same piece with an arrow key after dragging it", async ({
    page,
  }) => {
    await placeRug(page);
    const { x, y } = await planCenter(page);

    await page.mouse.click(x, y);
    // 5 cm east of the middle of a 4.2 m room, in inches.
    await page.keyboard.press("ArrowRight");

    expect(await inches(page, "From west")).toBeCloseTo(84.65, 1);
  });

  test("types a piece into the corner without touching the plan", async ({
    page,
  }) => {
    await placeRug(page);

    await placement(page).getByLabel("From west").fill("48");
    await placement(page).getByLabel("From north").fill("30");
    await placement(page).getByLabel("Turn").fill("90");

    await expect(planImage(page)).toHaveAccessibleName(
      /4' 0\.0" from the west wall and 2' 6\.0" from the north wall, turned 90°/,
    );
  });

  test("puts a piece down when the floor beside it is clicked", async ({
    page,
  }) => {
    await placeRug(page);
    const { box } = await planCenter(page);

    // The very corner of the canvas is outside the room altogether, which is
    // as empty as floor gets.
    await page.mouse.click(box.x + 4, box.y + 4);

    await expect(placement(page)).toBeHidden();
  });
});

test.describe("answering whether it fits", () => {
  /** Two pieces, placed in the middle of the room one after the other. */
  async function placePair(page: Page) {
    await page.goto("/furniture");
    // Scoped to the add form: once a product exists the page has more than one
    // field called Name.
    const form = page.getByRole("region", { name: /Add a product/ });
    for (const piece of [
      { name: "Sectional", width: "94.5", depth: "63" },
      { name: "Coffee table", width: "24", depth: "24" },
    ]) {
      await form.getByLabel("Name").fill(piece.name);
      await form.getByLabel("Width").fill(piece.width);
      await form.getByLabel("Depth").fill(piece.depth);
      await page.getByRole("button", { name: "Add product" }).click();
      await expect(
        page.getByRole("row", { name: new RegExp(piece.name) }).first(),
      ).toBeVisible();
    }

    // Two products added back to back arrive inside one save gap, so the
    // second is written by the trailing timer. Navigating faster than a person
    // could would leave it behind.
    await page.waitForTimeout(500);

    await page.goto("/plan");
    await page
      .getByRole("button", { name: "Place Sectional in the room" })
      .click();
    await page
      .getByRole("button", { name: "Place Coffee table in the room" })
      .click();
  }

  function fit(page: Page) {
    return page.getByRole("region", { name: "Plan" });
  }

  test("reports an overlap in words, with the amount, and clears it again", async ({
    page,
  }) => {
    await placePair(page);

    // Both land near the middle, stepped apart but still into each other.
    await expect(
      fit(page).getByText(/Sectional overlaps Coffee table by/),
    ).toBeVisible();

    // Move the table east: the sectional is centered in a 165 inch room and is
    // 94.5 wide, so it reaches 130, and a 24 inch table centered at 150 starts
    // at 138.
    const table = page.getByRole("group", { name: "Where Coffee table sits" });
    await table.getByLabel("From west").fill("150");

    await expect(fit(page).getByText(/Everything fits/)).toBeVisible();
  });

  test("reports a piece dragged through a wall", async ({ page }) => {
    await placePair(page);

    const table = page.getByRole("group", { name: "Where Coffee table sits" });
    await table.getByLabel("From west").fill("2");

    await expect(
      fit(page).getByText(/Coffee table crosses the west wall by/),
    ).toBeVisible();
  });

  test("clears itself when the piece is turned out of the way", async ({
    page,
  }) => {
    await placePair(page);

    const table = page.getByRole("group", { name: "Where Coffee table sits" });
    await table.getByLabel("From west").fill("152");
    await expect(fit(page).getByText(/Everything fits/)).toBeVisible();

    // Square on, the table reaches 164 of the room's 165 inches. Turned 45° it
    // reaches 17 inches from its center rather than 12, and goes through the
    // wall — the case a bounding box would have reported all along.
    await table.getByLabel("Turn").fill("45");

    await expect(
      fit(page).getByText(/Coffee table crosses the east wall by/),
    ).toBeVisible();
  });
});

test.describe("protected walkways", () => {
  function fit(page: Page) {
    return page.getByRole("region", { name: "Plan" });
  }

  function walkways(page: Page) {
    return page.getByRole("region", { name: "Walkways" });
  }

  /** A sectional, placed where it lands: the middle of the room. */
  async function placeSectional(page: Page) {
    await page.goto("/furniture");
    const form = page.getByRole("region", { name: /Add a product/ });
    await form.getByLabel("Name").fill("Sectional");
    await form.getByLabel("Width").fill("94.5");
    await form.getByLabel("Depth").fill("63");
    await page.getByRole("button", { name: "Add product" }).click();
    await expect(
      page.getByRole("row", { name: /Sectional/ }).first(),
    ).toBeVisible();
    // The write is issued at once but lands asynchronously, and Playwright can
    // navigate faster than a person could.
    await page.waitForTimeout(500);

    await page.goto("/plan");
    await page
      .getByRole("button", { name: "Place Sectional in the room" })
      .click();
  }

  test("reports the width a sofa leaves, and the shortfall", async ({
    page,
  }) => {
    await placeSectional(page);

    await walkways(page).getByRole("button", { name: "Add a route" }).click();

    // The route runs down the middle of the room, where the sofa is standing.
    const message = fit(page).getByText(/is down to/);
    await expect(message).toContainText(`short of the 3' 0.0" it needs`);
    await expect(message).toContainText("In the way: Sectional");
  });

  test("clears the route when it is moved off the sofa", async ({ page }) => {
    await placeSectional(page);
    await walkways(page).getByRole("button", { name: "Add a route" }).click();
    await expect(fit(page).getByText(/is down to/)).toBeVisible();

    // The sofa cannot get out of the way — 94.5 inches of it, and only 61.7
    // either side of a route down the middle of a 165 inch room — so the route
    // moves instead. At 155 inches its corridor starts at 134, east of the
    // sofa's 129.9.
    await walkways(page).getByLabel("Route start from west").fill("155");
    await walkways(page).getByLabel("Route end from west").fill("155");

    await expect(fit(page).getByText(/Everything fits/)).toBeVisible();
  });

  test("keeps a route, and its name, across a reload", async ({ page }) => {
    await page.goto("/plan");
    await walkways(page).getByRole("button", { name: "Add a route" }).click();
    await walkways(page).getByLabel("Name").fill("To the guest room");
    await page.waitForTimeout(500);

    await page.reload();

    await expect(walkways(page).getByLabel("Name")).toHaveValue(
      "To the guest room",
    );
    await expect(walkways(page).getByLabel("Needs at least")).toHaveValue("36");
  });
});
