import { expect, test, type Page } from "@playwright/test";
import { openWithLivingRoom } from "./fixtures/living-room";

/**
 * The shell thickness the plan pads its fitted view by, in inches.
 *
 * `fittedRect` frames the apartment plus its fattest wall all round, so every
 * pixel worked out below depends on this. It is the apartment's exterior
 * default — the partitions are thinner and never set the frame.
 */
const SHELL_INCHES = 8;

function contents(page: Page) {
  return page.getByRole("complementary", { name: "Contents" });
}

function details(page: Page) {
  return page.getByRole("complementary", { name: "Details" });
}

function plan(page: Page) {
  return page.getByRole("main", { name: "Plan" });
}

function planImage(page: Page) {
  return page.getByRole("img", { name: /^Plan view/ });
}

/**
 * Adds a room the way the workspace does now: "Add room" turns the plan into a
 * drawing surface, and a click on it drops one there. One room per press, so
 * there is nothing to turn off afterwards.
 */
async function addRoom(page: Page) {
  await contents(page).getByRole("button", { name: "Add room" }).click();
  const box = await planImage(page).boundingBox();
  if (box === null) {
    throw new Error("the plan has no box to point at");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Opens the arrangements table.
 *
 * Everything to do with an arrangement lives behind one button carrying the
 * name of the one you are working under — switching, renaming, duplicating,
 * deleting. There is no longer a name field and a menu both printing it.
 */
async function openArrangements(page: Page) {
  const trigger = page.getByRole("button", { name: "Arrangements" });
  // Idempotent: the trigger toggles, so opening one that is already open
  // would shut it. Several tests reach for the table more than once.
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  return page.getByRole("dialog", { name: "Arrangements" });
}

/** Enters a product through the inspector, the way the workspace does it. */
async function addProduct(
  page: Page,
  fields: { name: string; width: string; depth: string; price?: string },
) {
  await contents(page).getByRole("button", { name: "New product" }).click();
  const form = details(page);
  await form.getByLabel("Name").fill(fields.name);
  await form.getByLabel("Width").fill(fields.width);
  await form.getByLabel("Depth").fill(fields.depth);
  if (fields.price !== undefined) {
    await form.getByLabel("Price").fill(fields.price);
  }
  await form.getByRole("button", { name: "Add product" }).click();
  // The Place button, specifically: the row also carries a button that opens
  // the product for editing, and both are named after it.
  await expect(
    contents(page).getByRole("button", {
      name: `Place ${fields.name} in the room`,
    }),
  ).toBeVisible();
}

test.describe("the workspace", () => {
  test("opens on three panels and a room somebody measured", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    await expect(
      contents(page).getByRole("button", { name: "Living room" }),
    ).toBeVisible();
    await expect(planImage(page)).toBeVisible();
    // Nothing selected: the panel on the right is the apartment itself.
    await expect(
      details(page).getByRole("region", { name: "Apartment" }),
    ).toBeVisible();
  });

  test("opens a new project on an empty floor, and says what to do with it", async ({
    page,
  }) => {
    await page.goto("/");

    // No fictional living room: nothing in the list, nothing on the plan.
    await expect(
      contents(page).getByRole("button", { name: /room/i }),
    ).toHaveCount(1);
    await expect(planImage(page)).toHaveAccessibleName(/no rooms in it yet/);

    // And the plan itself names both ways in rather than leaving a blank grid.
    const invitation = plan(page);
    await expect(invitation.getByText("Nothing measured yet")).toBeVisible();
    await expect(
      invitation.getByRole("button", { name: "Add room" }),
    ).toBeVisible();
    await expect(invitation.getByLabel("Add plan image")).toBeAttached();
  });

  test("takes the invitation, and it goes once there is a room", async ({
    page,
  }) => {
    await page.goto("/");
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    const invite = plan(page).getByRole("button", { name: "Add room" });
    await invite.click();
    await expect(invite).toHaveAttribute("aria-pressed", "true");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(
      contents(page).getByRole("button", { name: "Room 1" }),
    ).toBeVisible();
    // Gone without being dismissed: a plan with something on it explains
    // itself.
    await expect(plan(page).getByText("Nothing measured yet")).toBeHidden();
  });

  test("selects a room from the list and edits it on the right", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    await contents(page).getByRole("button", { name: "Living room" }).click();

    const inspector = details(page).getByRole("region", {
      name: "Living room",
    });
    await expect(inspector).toBeVisible();
    await inspector.getByLabel("Living room width").fill("120");

    await expect(planImage(page)).toHaveAccessibleName(/10' 0\.0" wide/);
    await expect(
      plan(page).getByText(
        "Drag or resize the room here, or type its X/Y and W/D",
      ),
    ).toBeVisible();
  });

  test("renames a room directly in the apartment list", async ({ page }) => {
    await openWithLivingRoom(page);

    const room = contents(page).getByRole("button", { name: "Living room" });
    await room.click();
    await room.click();
    await expect(contents(page).getByRole("textbox")).toHaveCount(0);

    await room.dblclick();
    const name = contents(page).getByRole("textbox", {
      name: "Rename Living room",
    });
    await expect(name).toBeFocused();
    await expect
      .poll(() =>
        name.evaluate((input: HTMLInputElement) => ({
          start: input.selectionStart,
          end: input.selectionEnd,
        })),
      )
      .toEqual({ start: 11, end: 11 });
    await name.fill("Great room");
    await name.press("Enter");

    await expect(
      contents(page).getByRole("button", { name: "Great room" }),
    ).toBeVisible();
    await expect(
      details(page).getByRole("region", { name: "Great room" }),
    ).toBeVisible();
  });

  test("adds a room, and it appears in the list and the plan", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    await addRoom(page);

    await expect(
      contents(page).getByRole("button", { name: "Room 2" }),
    ).toBeVisible();
    await expect(planImage(page)).toHaveAccessibleName(/holding 2 rooms/);
    // Added means selected, so it can be sized straight away.
    await expect(
      details(page).getByRole("region", { name: "Room 2" }),
    ).toBeVisible();
  });

  test("enters a product and places it in the room", async ({ page }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Rug", width: "96", depth: "60" });

    await contents(page)
      .getByRole("button", { name: "Place Rug in the room" })
      .click();

    await expect(planImage(page)).toHaveAccessibleName(/1 piece placed: Rug/);
    // Placed means selected, and the inspector is now that piece.
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeVisible();
  });

  test("moves a placed piece by typing, and the plan follows", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Rug", width: "96", depth: "60" });
    await contents(page)
      .getByRole("button", { name: "Place Rug in the room" })
      .click();

    await details(page).getByLabel("From west").fill("24");

    await expect(planImage(page)).toHaveAccessibleName(
      /2' 0\.0" from the west wall/,
    );
  });

  test("reports what does not fit, under the plan", async ({ page }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Sectional", width: "94.5", depth: "63" });
    await contents(page)
      .getByRole("button", { name: "Place Sectional in the room" })
      .click();

    // The room runs from -84 to 84 inches, so a 94.5 inch sofa centred at -60
    // reaches -107 and goes through the west wall.
    await details(page).getByLabel("From west").fill("-60");

    await expect(
      plan(page).getByText(
        /Sectional crosses the west wall of the Living room/,
      ),
    ).toBeVisible();
  });

  test("keeps everything across a reload", async ({ page }) => {
    await openWithLivingRoom(page);
    await addProduct(page, {
      name: "Olive tree",
      width: "24",
      depth: "24",
      price: "129.00",
    });
    await contents(page)
      .getByRole("button", { name: "Place Olive tree in the room" })
      .click();
    await page.waitForTimeout(500);

    await page.reload();

    await expect(planImage(page)).toHaveAccessibleName(/1 piece placed/);
    await expect(
      contents(page)
        .getByRole("button", { name: /Olive tree/ })
        .first(),
    ).toBeVisible();
  });
});

test.describe("editing the product behind a piece", () => {
  test("reaches the product from the piece standing in the room", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addProduct(page, {
      name: "Rug",
      width: "96",
      depth: "60",
      price: "349.00",
    });
    await contents(page)
      .getByRole("button", { name: "Place Rug in the room" })
      .click();

    // The piece is selected; its size and price belong to the product.
    await expect(details(page).getByText("$349.00")).toBeVisible();
    await details(page).getByRole("button", { name: "Edit Rug" }).click();

    // Now editing the product itself, and a change reaches the plan.
    await details(page).getByLabel("Width").fill("48");
    await details(page).getByRole("button", { name: "Save changes" }).click();

    await expect(planImage(page)).toHaveAccessibleName(/4' 0\.0" by 5' 0\.0"/);
  });
});

test.describe("the plan as a canvas", () => {
  async function planCentre(page: Page) {
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  async function placeRug(page: Page) {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Rug", width: "96", depth: "60" });
    await contents(page)
      .getByRole("button", { name: "Place Rug in the room" })
      .click();
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeVisible();
  }

  test("drags a piece across the plan", async ({ page }) => {
    await placeRug(page);
    const centre = await planCentre(page);
    const before = await details(page).getByLabel("From west").inputValue();

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 60, centre.y, { steps: 10 });
    await page.mouse.up();

    expect(
      Number(await details(page).getByLabel("From west").inputValue()),
    ).toBeGreaterThan(Number(before));
  });

  test("zooms toward the pointer without moving the furniture", async ({
    page,
  }) => {
    await placeRug(page);
    const centre = await planCentre(page);
    const before = await details(page).getByLabel("From west").inputValue();

    await page.mouse.move(centre.x, centre.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -400);
    await page.keyboard.up("Control");

    await expect(details(page).getByLabel("From west")).toHaveValue(before);
    // Anchored at the pointer, so the rug is still under the middle.
    await page.mouse.click(centre.x, centre.y);
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeVisible();
  });

  test("ignores the wheel until the plan is clicked into", async ({ page }) => {
    await placeRug(page);
    const centre = await planCentre(page);

    // Hovering is not entering: a stray swipe over the plan leaves it alone.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, 200);

    await expect(planImage(page)).not.toBeFocused();
    // Still where it was, so the rug is still under the middle.
    await page.mouse.click(centre.x, centre.y);
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeVisible();
  });

  test("pans on a plain scroll once clicked into, and fits again with 0", async ({
    page,
  }) => {
    await placeRug(page);
    const centre = await planCentre(page);

    await page.mouse.click(centre.x, centre.y);
    await expect(planImage(page)).toBeFocused();
    await page.mouse.wheel(0, 200);

    // The drawing moved up with the scroll, so the rug is 200 pixels higher.
    await page.mouse.click(centre.x, centre.y - 200);
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeVisible();

    await page.keyboard.press("0");
    await page.mouse.click(centre.x, centre.y);
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeVisible();
  });
});

test.describe("workspace navigation", () => {
  test("sends the old pages to where their work moved", async ({ page }) => {
    for (const [from, heading] of [
      ["/plan", "RoomScale"],
      ["/furniture", "RoomScale"],
      ["/checklist", "Shopping list"],
    ] as const) {
      await page.goto(from);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
    }
  });

  test("has a document title", async ({ page }) => {
    await openWithLivingRoom(page);
    await expect(page).toHaveTitle(/RoomScale/);
  });
});

test.describe("comparing layouts", () => {
  /** Two products in the catalogue, one of them placed. */
  async function withASofa(page: Page) {
    await openWithLivingRoom(page);
    await addProduct(page, {
      name: "Sectional",
      width: "94.5",
      depth: "63",
      price: "1999.00",
    });
    await addProduct(page, {
      name: "Loveseat",
      width: "60",
      depth: "38",
      price: "899.00",
    });
    await contents(page)
      .getByRole("button", { name: "Place Sectional in the room" })
      .click();
  }

  test("duplicates an arrangement and keeps both", async ({ page }) => {
    await withASofa(page);

    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Duplicate First try" })
      .click();

    // The copy is the one being worked on, and it holds the same furniture.
    await expect(
      page.getByRole("button", { name: "Arrangements" }),
    ).toContainText("Second try");
    await expect(planImage(page)).toHaveAccessibleName(
      /1 piece placed: Sectional/,
    );
    // Both are in the table, and only the copy — the one being worked on —
    // carries what can be done to an arrangement.
    const table = await openArrangements(page);
    await expect(
      table.getByRole("button", { name: /^First try/ }),
    ).toBeVisible();
    await expect(
      table.getByRole("button", { name: /^Second try/ }),
    ).toBeVisible();
    await expect(table.getByRole("button", { name: /^Rename/ })).toHaveCount(1);
    await expect(
      table.getByRole("button", { name: "Rename Second try" }),
    ).toBeVisible();
  });

  test("changes one arrangement without touching the other", async ({
    page,
  }) => {
    await withASofa(page);
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Duplicate First try" })
      .click();

    // In the copy, swap the sectional for the loveseat.
    await contents(page)
      .getByRole("button", { name: "Sectional", exact: true })
      .click();
    await details(page)
      .getByRole("button", { name: "Take Sectional out of the room" })
      .click();
    await contents(page)
      .getByRole("button", { name: "Place Loveseat in the room" })
      .click();
    await expect(planImage(page)).toHaveAccessibleName(
      /1 piece placed: Loveseat/,
    );

    // The first arrangement still has the sectional in it.
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: /^First try/ })
      .click();
    await expect(planImage(page)).toHaveAccessibleName(
      /1 piece placed: Sectional/,
    );
  });

  test("names an arrangement, and the name sticks across a reload", async ({
    page,
  }) => {
    await withASofa(page);
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Duplicate First try" })
      .click();

    const table = await openArrangements(page);
    await table.getByRole("button", { name: "Rename Second try" }).click();
    await table.getByLabel("Layout name").fill("Loveseat instead");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.reload();

    await expect(
      page.getByRole("button", { name: "Arrangements" }),
    ).toContainText("Loveseat instead");
  });

  test("prices each arrangement, so they can be weighed against each other", async ({
    page,
  }) => {
    await withASofa(page);
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Duplicate First try" })
      .click();
    await contents(page)
      .getByRole("button", { name: "Sectional", exact: true })
      .click();
    await details(page)
      .getByRole("button", { name: "Take Sectional out of the room" })
      .click();
    await contents(page)
      .getByRole("button", { name: "Place Loveseat in the room" })
      .click();
    await page.waitForTimeout(500);

    await page.goto("/overview");

    // The cheaper arrangement is named as such rather than left to arithmetic.
    const comparison = page.getByRole("row", { name: /First try/ });
    await expect(comparison).toContainText("$1,999.00");
    await expect(page.getByRole("row", { name: /Second try/ })).toContainText(
      "$899.00",
    );
    await expect(page.getByText("least")).toBeVisible();
  });

  test("deletes an arrangement, but never the last one", async ({ page }) => {
    await openWithLivingRoom(page);

    // One arrangement: its row offers no way to delete it.
    await expect(
      (await openArrangements(page)).getByRole("button", { name: /^Delete/ }),
    ).toBeHidden();

    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Duplicate First try" })
      .click();
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Delete Second try" })
      .click();

    await expect(
      page.getByRole("button", { name: "Arrangements" }),
    ).toContainText("First try");
    await expect(
      (await openArrangements(page)).getByRole("button", { name: /^Delete/ }),
    ).toBeHidden();
  });

  test("names the arrangement once, not twice", async ({ page }) => {
    await openWithLivingRoom(page);

    // The header used to hold a name field and a menu that both printed it,
    // at two different heights, beside a third control at a third height.
    await expect(page.getByLabel("Layout name")).toBeHidden();
    const trigger = page.getByRole("button", { name: "Arrangements" });
    await expect(trigger).toContainText("First try");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    // The price is beside the name in the table, which is what makes a second
    // arrangement a comparison rather than a bookmark.
    const table = await openArrangements(page);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(
      table.getByRole("button", { name: /^First try/ }),
    ).toContainText("$0.00");

    await page.keyboard.press("Escape");
    await expect(table).toBeHidden();
  });
});

test.describe("laying the apartment out", () => {
  test("places, lists, selects, moves, and resizes an opening on the plan", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    await details(page).getByRole("button", { name: "Add door" }).click();
    await expect(
      plan(page).getByText("Click the wall for the door. Esc to stop."),
    ).toBeVisible();

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const scale = Math.min(
      (box.width - padding * 2) / metres(168 + SHELL_INCHES * 2),
      (box.height - padding * 2) / metres(144 + SHELL_INCHES * 2),
    );
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // Clear of the existing centered north window: 36" from the west corner.
    const north = {
      x: middle.x + metres(-84 + 36) * scale,
      y: middle.y - metres(72) * scale,
    };

    await page.mouse.click(north.x, north.y);

    const row = contents(page).getByRole("button", { name: "Door 2" });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    const opening = details(page).getByRole("region", {
      name: "Living room door 2",
    });
    await expect(opening).toBeVisible();
    await expect(opening.getByLabel("Living room door 2 wall")).toHaveValue(
      "north",
    );
    await expect(opening.getByLabel("Center")).toHaveValue("36");
    await expect(opening.getByLabel("Width")).toHaveValue("32");

    // A measured number stays exact and moves the selected opening's readout.
    await opening.getByLabel("Center").fill("40");
    await expect(opening.getByLabel("Center")).toHaveValue("40");
    await expect(plan(page).getByText(`x -3' 8.0"`)).toBeVisible();

    // Selection is also on the canvas, through the gap cut in the wall.
    await planImage(page).press("Escape");
    const typedCenter = {
      x: middle.x + metres(-84 + 40) * scale,
      y: north.y,
    };
    await page.mouse.click(typedCenter.x, typedCenter.y);
    await expect(opening).toBeVisible();

    // Drag the whole opening along its wall.
    await page.mouse.move(typedCenter.x, typedCenter.y);
    await page.mouse.down();
    await page.mouse.move(typedCenter.x + 24, typedCenter.y, { steps: 6 });
    await page.mouse.up();
    const movedCenter = Number(await opening.getByLabel("Center").inputValue());
    expect(movedCenter).toBeGreaterThan(40);
    expect(movedCenter % 1).toBe(0);

    // Drag its end jamb. The start stays put, so width and center both grow.
    const beforeWidth = Number(await opening.getByLabel("Width").inputValue());
    const endJamb = {
      x: middle.x + metres(-84 + movedCenter + beforeWidth / 2) * scale,
      y: north.y,
    };
    await page.mouse.move(endJamb.x, endJamb.y);
    await page.mouse.down();
    await page.mouse.move(endJamb.x + 24, endJamb.y, { steps: 6 });
    await page.mouse.up();

    expect(
      Number(await opening.getByLabel("Width").inputValue()),
    ).toBeGreaterThan(beforeWidth);
    expect(
      Number(await opening.getByLabel("Center").inputValue()),
    ).toBeGreaterThan(movedCenter);
  });

  test("snaps a room against its neighbour, sharing one wall", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);

    // The living room runs to 84 inches and the wall is 4.5 thick, so sharing
    // it means 88.5. Typing 87 is near enough to mean it.
    const room = details(page).getByRole("region", { name: "Room 2" });
    await room.getByLabel("Room 2 X position").fill("87");

    await expect(room.getByLabel("Room 2 X position")).toHaveValue("88.5");
  });

  test("builds an L-shaped room from a second editable rectangle", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const room = details(page).getByRole("region", { name: "Living room" });
    await room.getByRole("button", { name: "Add section" }).click();

    await expect(room.getByLabel("Living room section 2 width")).toBeVisible();
    await expect(
      contents(page).getByRole("button", { name: "Section 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(planImage(page)).toHaveAccessibleName(
      /built from 2 rectangles/,
    );

    // Sections toggle independently without turning into separate rooms.
    await contents(page).getByRole("button", { name: "Section 1" }).click();
    await expect(
      room.getByRole("button", { name: "Select Living room section 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    await contents(page).getByRole("button", { name: "Section 2" }).click();

    // The selected section gets the same canvas handles as an ordinary
    // rectangle. Drag its east handle and only Section 2 grows.
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const inches = (value: number) => value * 0.0254;
    const wall = inches(SHELL_INCHES);
    const partTwoWest = 0;
    const partTwoNorth = 72 - 0.1 / 0.0254;
    const partTwoWidth = 126;
    const partTwoDepth = 72;
    const bounds = {
      west: -84,
      north: -72,
      east: partTwoWest + partTwoWidth,
      south: partTwoNorth + partTwoDepth,
    };
    const scale = Math.min(
      (box.width - 80) / (inches(bounds.east - bounds.west) + wall * 2),
      (box.height - 80) / (inches(bounds.south - bounds.north) + wall * 2),
    );
    const center = {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
    const floorCenter = {
      x: (bounds.west + bounds.east) / 2,
      y: (bounds.north + bounds.south) / 2,
    };
    const pointOnPlan = (xInches: number, yInches: number) => ({
      x: center.x + inches(xInches - floorCenter.x) * scale,
      y: center.y + inches(yInches - floorCenter.y) * scale,
    });

    // Double-click drills into either rectangle directly from whole-room
    // selection, so editing a compound room does not depend on the layer list.
    await contents(page).getByRole("button", { name: "Living room" }).click();
    const partOneOnly = pointOnPlan(-50, 0);
    await page.mouse.dblclick(partOneOnly.x, partOneOnly.y);
    await expect(
      room.getByRole("button", { name: "Select Living room section 1" }),
    ).toHaveAttribute("aria-pressed", "true");

    const partTwoOnly = pointOnPlan(100, 100);
    await page.mouse.dblclick(partTwoOnly.x, partTwoOnly.y);
    await expect(
      room.getByRole("button", { name: "Select Living room section 2" }),
    ).toHaveAttribute("aria-pressed", "true");

    const eastHandle = {
      x: center.x + inches(partTwoWest + partTwoWidth - floorCenter.x) * scale,
      y:
        center.y +
        inches(partTwoNorth + partTwoDepth / 2 - floorCenter.y) * scale,
    };

    await page.mouse.move(eastHandle.x, eastHandle.y);
    await page.mouse.down();
    await page.mouse.move(eastHandle.x + 40, eastHandle.y, { steps: 6 });
    await page.mouse.up();

    expect(
      Number(await room.getByLabel("Living room section 2 width").inputValue()),
    ).toBeGreaterThan(partTwoWidth);
    await expect(room.getByLabel("Living room section 1 width")).toHaveValue(
      "168",
    );
  });

  test("turns a section to an exact typed angle, which survives a reload", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const room = details(page).getByRole("region", { name: "Living room" });
    await room
      .getByRole("spinbutton", { name: "Living room angle" })
      .fill("45");

    // A turn changes no measurement: the tape still reads the same sizes.
    await expect(room.getByLabel("Living room width")).toHaveValue("168");
    await expect(plan(page).getByText("168.0 sq ft")).toBeVisible();

    await page.reload();
    await contents(page).getByRole("button", { name: "Living room" }).click();
    await expect(
      details(page)
        .getByRole("region", { name: "Living room" })
        .getByRole("spinbutton", { name: "Living room angle" }),
    ).toHaveValue("45");
  });

  test("turns one section without turning its neighbour", async ({ page }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();
    const room = details(page).getByRole("region", { name: "Living room" });
    await room.getByRole("button", { name: "Add section" }).click();

    await room
      .getByRole("spinbutton", { name: "Living room section 2 angle" })
      .fill("45");

    await expect(
      room.getByRole("spinbutton", { name: "Living room section 2 angle" }),
    ).toHaveValue("45");
    await expect(
      room.getByRole("spinbutton", { name: "Living room section 1 angle" }),
    ).toHaveValue("0");
  });

  test("rotates a section by dragging the round handle past its north wall", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const inches = (value: number) => value * 0.0254;
    const wall = inches(SHELL_INCHES);
    const scale = Math.min(
      (box.width - 80) / (inches(168) + wall * 2),
      (box.height - 80) / (inches(144) + wall * 2),
    );
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const toPixel = (xInches: number, yInches: number) => ({
      x: centre.x + inches(xInches) * scale,
      y: centre.y + inches(yInches) * scale,
    });

    // The round handle floats past the middle of the north wall — the wall
    // band plus its fixed clearance — and the drag spins the section about
    // its center, so the target is the handle swung 45° about that.
    const handle = {
      x: toPixel(0, -72).x,
      y: toPixel(0, -72).y - wall * scale - 18,
    };
    const pivot = toPixel(0, 0);
    const eighth = Math.PI / 4;
    const target = {
      x:
        pivot.x +
        (handle.x - pivot.x) * Math.cos(eighth) -
        (handle.y - pivot.y) * Math.sin(eighth),
      y:
        pivot.y +
        (handle.x - pivot.x) * Math.sin(eighth) +
        (handle.y - pivot.y) * Math.cos(eighth),
    };

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();

    const room = details(page).getByRole("region", { name: "Living room" });
    await expect(
      room.getByRole("spinbutton", { name: "Living room angle" }),
    ).toHaveValue("45");
    // A turn is not a resize: the tape still reads the same everywhere.
    await expect(room.getByLabel("Living room width")).toHaveValue("168");
    await expect(plan(page).getByText("168.0 sq ft")).toBeVisible();
  });

  test("removes an opening from the room's own panel, keeping the room selected", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const room = details(page).getByRole("region", { name: "Living room" });
    await expect(planImage(page)).toHaveAccessibleName(/a window/);

    await room
      .getByRole("button", { name: "Remove Living room window 1" })
      .click();

    // The window is gone everywhere, and the room is still being edited.
    await expect(planImage(page)).not.toHaveAccessibleName(/a window/);
    await expect(
      contents(page).getByRole("button", { name: "Window 1" }),
    ).toHaveCount(0);
    await expect(room).toBeVisible();
    await expect(
      room.getByRole("button", { name: "Remove Living room door 1" }),
    ).toBeVisible();
  });

  test("traces the listing: an image is dropped, scaled by one line, and kept", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    // The Apartment panel takes the image and goes straight to calibration.
    const apartment = details(page).getByRole("region", { name: "Apartment" });
    await apartment
      .locator('input[type="file"]')
      .setInputFiles("e2e/fixtures/plan.png");
    await expect(
      plan(page).getByText(/Drag a line along a wall you know/),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "The floor plan being traced" }),
    ).toBeVisible();

    // One line dragged across the plan…
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(centre.x - 60, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 60, centre.y, { steps: 6 });
    await page.mouse.up();

    // …is given its real length, and the image takes its scale from it.
    await apartment.getByLabel(/real length/).fill("120");
    await apartment.getByRole("button", { name: "Apply scale" }).click();
    await expect(apartment.getByLabel(/real length/)).toHaveCount(0);

    // The image survives a reload, and hides without being lost.
    await page.reload();
    const image = page.getByRole("img", {
      name: "The floor plan being traced",
    });
    await expect(image).toBeVisible();
    await details(page)
      .getByRole("region", { name: "Apartment" })
      .getByRole("button", { name: "Hide image" })
      .click();
    await expect(image).toHaveCount(0);
  });

  test("keeps shell and partition walls as two typed numbers", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    // Nothing selected: the apartment's own settings. The two walls are folded
    // away behind one line that reads them out, because they are set once and
    // read often — so the summary has to carry the numbers.
    const apartment = details(page).getByRole("region", { name: "Apartment" });
    const defaults = apartment.getByRole("button", { name: /^Wall defaults/ });
    await expect(defaults).toHaveAttribute("aria-expanded", "false");
    await expect(defaults).toContainText("8 in shell, 4.5 in partitions");

    await defaults.click();
    await apartment.getByLabel("Exterior wall thickness").fill("9");
    await expect(apartment.getByLabel("Exterior wall thickness")).toHaveValue(
      "9",
    );
    await expect(apartment.getByLabel("Interior wall thickness")).toHaveValue(
      "4.5",
    );
    await expect(defaults).toContainText("9 in shell, 4.5 in partitions");

    await page.reload();
    const reopened = details(page).getByRole("region", { name: "Apartment" });
    await reopened.getByRole("button", { name: /^Wall defaults/ }).click();
    await expect(reopened.getByLabel("Exterior wall thickness")).toHaveValue(
      "9",
    );
  });

  test("counts the floor up only once there is a floor to count", async ({
    page,
  }) => {
    // Four figures reading zero teach nobody anything about an empty project,
    // and neither does "0.0 sq ft" in the corner of an empty plan.
    await page.goto("/");
    const empty = details(page).getByRole("region", { name: "Apartment" });
    await expect(empty.getByText("Floor area")).toBeHidden();
    await expect(plan(page).getByText("sq ft")).toBeHidden();

    // With a room on the floor, every one of them is a fact about something.
    await openWithLivingRoom(page);
    const measured = details(page).getByRole("region", { name: "Apartment" });
    await expect(measured.getByText("Floor area")).toBeVisible();
    await expect(
      measured.getByRole("term").filter({ hasText: "Rooms" }),
    ).toBeVisible();
    await expect(plan(page).getByText("sq ft")).toBeVisible();
  });

  test("lets one room be built out of something else, and hands it back", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();
    const room = details(page).getByRole("region", { name: "Living room" });

    // Folded away, saying what this room's walls are and where they came from.
    const walls = room.getByRole("button", { name: /^Walls/ });
    await expect(walls).toHaveAttribute("aria-expanded", "false");
    await expect(walls).toContainText("8 in shell, 4.5 in partitions");
    await expect(walls).toContainText("from the apartment");

    await walls.click();
    const partition = room.getByLabel("Living room interior wall thickness");
    // Opened onto the inherited number, not an empty box.
    await expect(partition).toHaveValue("4.5");

    await partition.fill("7");
    await expect(walls).toContainText("8 in shell, 7 in partitions");
    await expect(walls).not.toContainText("from the apartment");
    // The apartment's own default is untouched by one room measuring itself.
    await contents(page).getByRole("button", { name: "Living room" }).click();
    await page.reload();
    await contents(page).getByRole("button", { name: "Living room" }).click();
    await expect(
      details(page)
        .getByRole("region", { name: "Living room" })
        .getByRole("button", { name: /^Walls/ }),
    ).toContainText("8 in shell, 7 in partitions");

    // And handed back, it reads the apartment's again.
    const reopened = details(page).getByRole("region", { name: "Living room" });
    await reopened.getByRole("button", { name: /^Walls/ }).click();
    await reopened
      .getByRole("button", {
        name: "Use the apartment's interior wall thickness",
      })
      .click();
    await expect(
      reopened.getByRole("button", { name: /^Walls/ }),
    ).toContainText("8 in shell, 4.5 in partitions");
  });

  test("opens a wall into a railing that refuses a door", async ({ page }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const room = details(page).getByRole("region", { name: "Living room" });
    await room
      .getByRole("button", { name: "Living room north wall open" })
      .click();
    await expect(
      room.getByRole("button", { name: "Living room north wall open" }),
    ).toHaveAttribute("aria-pressed", "true");

    // The default window sits on the north wall, which is now a railing, and
    // its own inspector says exactly what went wrong.
    await contents(page).getByRole("button", { name: "Window 1" }).click();
    await expect(
      details(page).getByText(
        "This wall is open — there is no wall to cut it through.",
      ),
    ).toBeVisible();

    await page.reload();
    await contents(page).getByRole("button", { name: "Living room" }).click();
    await expect(
      details(page)
        .getByRole("region", { name: "Living room" })
        .getByRole("button", { name: "Living room north wall open" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("snaps a scrubbed width to a neighbouring room's shared wall", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);

    // Put Room 2 east of the living room. Its west face is at 100", so the
    // living room shares that wall when its east face reaches 95.5".
    await details(page).getByLabel("Room 2 X position").fill("100");
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const inspector = details(page);
    const width = inspector.getByLabel("Living room width");
    const scrubber = inspector.getByRole("slider", {
      name: "W drag handle",
    });
    const box = await scrubber.boundingBox();
    if (box === null) {
      throw new Error("the width scrubber has no box to drag");
    }

    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    // 168" + 12" would be 180"; within the four-inch threshold, it lands on
    // the exact 179.5" width that shares Room 2's wall.
    await page.mouse.move(box.x + box.width / 2 + 12, y);
    await page.mouse.up();

    await expect(width).toHaveValue("179.5");
  });

  test("snaps a canvas resize to the same neighbouring wall", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);
    await details(page).getByLabel("Room 2 X position").fill("100");
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    // Drawing Room 2 pins the view that existed when the gesture began, so the
    // handle remains on the original one-room projection while Room 2 is moved.
    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const across = metres(168 + SHELL_INCHES * 2);
    const down = metres(144 + SHELL_INCHES * 2);
    const scale = Math.min(
      (box.width - padding * 2) / across,
      (box.height - padding * 2) / down,
    );
    const eastHandle = {
      x: box.x + box.width / 2 + metres(84) * scale,
      y: box.y + box.height / 2,
    };

    await page.mouse.move(eastHandle.x, eastHandle.y);
    await page.mouse.down();
    // A raw twelve-inch move reaches 180", then shares Room 2's west wall at
    // the exact 179.5" room width.
    await page.mouse.move(eastHandle.x + metres(12) * scale, eastHandle.y);
    await page.mouse.up();

    await expect(details(page).getByLabel("Living room width")).toHaveValue(
      "179.5",
    );
  });

  test("leaves a room where it was put when nothing is near", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);

    const room = details(page).getByRole("region", { name: "Room 2" });
    await room.getByLabel("Room 2 X position").fill("200");

    await expect(room.getByLabel("Room 2 X position")).toHaveValue("200");
  });

  test("takes a negative position, so the apartment grows either way", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);

    const room = details(page).getByRole("region", { name: "Room 2" });
    await room.getByLabel("Room 2 X position").fill("-300");

    await expect(room.getByLabel("Room 2 X position")).toHaveValue("-300");
    await expect(planImage(page)).toHaveAccessibleName(/holding 2 rooms/);
  });

  test("selects a room by clicking the plan, and drags it", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // The living room is the only thing on the plan, and it is in the middle.
    await page.mouse.click(centre.x, centre.y);
    await expect(
      details(page).getByRole("region", { name: "Living room" }),
    ).toBeVisible();

    // A one-rectangle room has no redundant Section 1 editing level, even when
    // the canvas receives the double-click used to drill into compound rooms.
    await page.mouse.dblclick(centre.x, centre.y);
    await expect(
      contents(page).getByRole("button", { name: "Living room" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      contents(page).getByRole("button", { name: "Section 1" }),
    ).toHaveCount(0);

    const before = await details(page)
      .getByLabel("Living room X position")
      .inputValue();

    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 120, centre.y, { steps: 10 });
    await page.mouse.up();

    expect(
      Number(
        await details(page).getByLabel("Living room X position").inputValue(),
      ),
    ).toBeGreaterThan(Number(before));
  });

  test("reads out the selection's corner, and what the floor adds up to", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    // A fourteen by twelve foot room is 168 square feet.
    await expect(plan(page).getByText("168.0 sq ft")).toBeVisible();
    // Nothing selected, nothing to give coordinates for.
    await expect(plan(page).getByText("x —")).toBeVisible();

    await contents(page).getByRole("button", { name: "Living room" }).click();

    // Its north-west corner: the room is centred, so half of 168 by half of 144.
    await expect(plan(page).getByText(`x -7' 0.0"`)).toBeVisible();
    await expect(plan(page).getByText(`y -6' 0.0"`)).toBeVisible();
  });

  test("resizes a room by dragging its wall, landing on whole inches", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const room = details(page).getByRole("region", { name: "Living room" });
    await expect(room.getByLabel("Living room width")).toHaveValue("168");

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    // Where the east wall is drawn. The plan fits the apartment plus a wall
    // all round into the panel less its padding, at one scale for both axes —
    // the same arithmetic createPlanProjection does.
    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const across = metres(168) + metres(SHELL_INCHES) * 2;
    const down = metres(144) + metres(SHELL_INCHES) * 2;
    const scale = Math.min(
      (box.width - padding * 2) / across,
      (box.height - padding * 2) / down,
    );
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const handle = {
      x: middle.x + (metres(168) / 2) * scale,
      y: middle.y,
    };

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 60, handle.y, { steps: 8 });
    await page.mouse.up();

    const width = Number(
      await room.getByLabel("Living room width").inputValue(),
    );
    // Sixty pixels is worth a fixed number of inches, and the room grew by
    // that and no more. It used to grow by far more: the plan was still
    // fitting itself, so every inch of room zoomed the view out and moved the
    // floor out from under a pointer that had not itself moved.
    const expected = 168 + 60 / scale / 0.0254;
    expect(width).toBeGreaterThan(expected - 2);
    expect(width).toBeLessThan(expected + 2);
    // Whole inches, not the seven decimals a pixel would give.
    expect(width % 1).toBe(0);
    // The east wall moved; the west one did not.
    await expect(room.getByLabel("Living room X position")).toHaveValue("-84");
  });

  test("draws a room by dragging a rectangle on the plan", async ({ page }) => {
    await openWithLivingRoom(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    await contents(page).getByRole("button", { name: "Add room" }).click();

    // Below and right of the living room, which is centred: clear of it, so
    // the size that comes out is the size that was dragged. Big enough that
    // neither side lands on the minimum a room is allowed to be — clamped in
    // both directions, a rectangle is a square and proves nothing.
    const from = { x: box.x + 40, y: box.y + box.height - 130 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 160, from.y + 90, { steps: 8 });
    await page.mouse.up();

    await expect(
      contents(page).getByRole("button", { name: "Room 2" }),
    ).toBeVisible();
    await expect(planImage(page)).toHaveAccessibleName(/holding 2 rooms/);

    // Drawn means selected, so the numbers are there to be corrected.
    const room = details(page).getByRole("region", { name: "Room 2" });
    await expect(room).toBeVisible();
    // It took its size from the drag rather than from a default: a room
    // dropped without drawing is a square, and this one is wider than deep.
    const width = Number(await room.getByLabel("Room 2 width").inputValue());
    const depth = Number(await room.getByLabel("Room 2 depth").inputValue());
    expect(width).toBeGreaterThan(depth);
  });

  test("stops drawing after one room, so the next drag adjusts it", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    await contents(page).getByRole("button", { name: "Add room" }).click();

    const from = { x: box.x + 60, y: box.y + box.height - 100 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y + 60, { steps: 6 });
    await page.mouse.up();

    // Out of the mode: the button is no longer lit, so the next drag adjusts
    // the room rather than drawing another one.
    await expect(
      contents(page).getByRole("button", { name: "Add room" }),
    ).toHaveAttribute("aria-pressed", "false");

    const room = details(page).getByRole("region", { name: "Room 2" });
    const west = Number(
      await room.getByLabel("Room 2 X position").inputValue(),
    );

    // The drag straight afterwards moves the room that was just drawn. It used
    // to draw another one on top of it, which is what anybody trying to nudge
    // a room into place ran into first.
    const middle = { x: from.x + 40, y: from.y + 30 };
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x + 50, middle.y, { steps: 6 });
    await page.mouse.up();

    await expect(planImage(page)).toHaveAccessibleName(/holding 2 rooms/);
    expect(
      Number(await room.getByLabel("Room 2 X position").inputValue()),
    ).toBeGreaterThan(west);
  });

  test("stops drawing on Escape, and the button says so", async ({ page }) => {
    await openWithLivingRoom(page);
    const add = contents(page).getByRole("button", { name: "Add room" });

    // The mode shows as a lit button rather than as changed wording, so the
    // control keeps the one name it is found by.
    await add.click();
    await expect(add).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("Escape");

    await expect(add).toHaveAttribute("aria-pressed", "false");
    // Nothing was drawn, so nothing was added.
    await expect(planImage(page)).toHaveAccessibleName(/holding 1 room/);
  });

  test("drops a room where it is clicked, rather than east of everything", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    await contents(page).getByRole("button", { name: "Add room" }).click();
    // A click, not a drag: the usual size, centred where it was put.
    await page.mouse.click(box.x + 60, box.y + box.height - 60);

    const room = details(page).getByRole("region", { name: "Room 2" });
    // Ten feet square, which is what createRoom gives, rather than a drag.
    await expect(room.getByLabel("Room 2 width")).toHaveValue("120");
    await expect(room.getByLabel("Room 2 depth")).toHaveValue("120");
    // West and north of the living room's own corner, which is where it was
    // clicked — the old behaviour put every new room east of everything.
    expect(
      Number(await room.getByLabel("Room 2 X position").inputValue()),
    ).toBeLessThan(-84);
  });

  test("drags the west wall without the plan running away from the pointer", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const room = details(page).getByRole("region", { name: "Living room" });
    await expect(room.getByLabel("Living room width")).toHaveValue("168");

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const across = metres(168) + metres(SHELL_INCHES) * 2;
    const down = metres(144) + metres(SHELL_INCHES) * 2;
    const scale = Math.min(
      (box.width - padding * 2) / across,
      (box.height - padding * 2) / down,
    );
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const handle = { x: middle.x - (metres(168) / 2) * scale, y: middle.y };

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x - 60, handle.y, { steps: 8 });
    await page.mouse.up();

    // The west wall is the one that used to run away. It is the apartment's
    // own north-west corner, so dragging it moved the corner the whole
    // projection was built against — which moved the drawing, which moved the
    // floor out from under a pointer that had not itself moved, which dragged
    // the wall further west again. Sixty pixels is sixty pixels now.
    const grew = 60 / scale / 0.0254;
    const width = Number(
      await room.getByLabel("Living room width").inputValue(),
    );
    expect(width).toBeGreaterThan(168 + grew - 2);
    expect(width).toBeLessThan(168 + grew + 2);

    // The west wall moved by what the room gained; the east one did not move.
    const west = Number(
      await room.getByLabel("Living room X position").inputValue(),
    );
    expect(west).toBeGreaterThan(-84 - grew - 2);
    expect(west).toBeLessThan(-84 - grew + 2);
    expect(west + width).toBeGreaterThan(82);
    expect(west + width).toBeLessThan(86);
  });

  test("will not let the apartment be panned off the screen", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // Clicked into, so the wheel belongs to the plan, then swiped hard enough
    // to send the apartment into the next county.
    await page.mouse.click(middle.x, middle.y);
    for (let push = 0; push < 12; push += 1) {
      await page.mouse.wheel(-600, -600);
    }

    // Still drawn. Asking the canvas what it is showing is the only honest
    // question here: every number beside it comes from the project rather than
    // from the view, so all of them would keep reading true with the plan
    // three screens away.
    const drawn = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return -1;
      }
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let alpha = 3; alpha < data.length; alpha += 4) {
        if ((data[alpha] ?? 0) > 0) {
          painted += 1;
        }
      }
      return painted;
    });

    expect(drawn).toBeGreaterThan(0);
  });

  test("says with the pointer what it is about to move", async ({ page }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const scale = Math.min(
      (box.width - padding * 2) / (metres(168) + metres(SHELL_INCHES) * 2),
      (box.height - padding * 2) / (metres(144) + metres(SHELL_INCHES) * 2),
    );
    const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cursor = () =>
      planImage(page).evaluate((element) => getComputedStyle(element).cursor);

    // Over the room itself: something to move.
    await page.mouse.move(middle.x, middle.y);
    expect(await cursor()).toBe("move");

    // Over the east wall's handle: something to stretch, and which way.
    await page.mouse.move(middle.x + (metres(168) / 2) * scale, middle.y);
    expect(await cursor()).toBe("ew-resize");

    // Over its south-east corner: the other kind of stretch.
    await page.mouse.move(
      middle.x + (metres(168) / 2) * scale,
      middle.y + (metres(144) / 2) * scale,
    );
    expect(await cursor()).toBe("nwse-resize");

    // Off the apartment altogether: a hand, because a drag there pans.
    await page.mouse.move(box.x + 8, box.y + 8);
    expect(await cursor()).toBe("grab");
  });

  test("opens on numbers somebody could have measured", async ({ page }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const room = details(page).getByRole("region", { name: "Living room" });
    // Fourteen by twelve feet, eight foot ceiling — not 165.35 by 141.73.
    await expect(room.getByLabel("Living room width")).toHaveValue("168");
    await expect(room.getByLabel("Living room depth")).toHaveValue("144");
    await expect(room.getByLabel("Living room height")).toHaveValue("96");
  });
});
