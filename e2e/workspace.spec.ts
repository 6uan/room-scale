import { expect, test, type Page } from "@playwright/test";
import {
  openWithLivingRoom,
  openWithUnreadableProject,
} from "./fixtures/living-room";

/**
 * The wall thickness the plan pads its fitted view by, in inches.
 *
 * `fittedRect` frames the apartment plus its fattest wall all round, so every
 * pixel worked out below depends on this. There is one wall thickness now, so
 * this is simply it — the seeded project's, which is what the fixture stores.
 */
const WALL_INCHES = 4.5;

/**
 * The strip on the plan's right kept clear for the details panel. The
 * apartment is fitted into the rest, so every position worked out from the
 * plan's box leaves this much off its width.
 */
const PLAN_RESERVE = 320;

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
  await page.mouse.click(
    box.x + (box.width - PLAN_RESERVE) / 2,
    box.y + box.height / 2,
  );
}

/**
 * Opens the arrangements table.
 *
 * Everything to do with an arrangement lives behind one button carrying the
 * name of the one you are working under — switching, renaming, duplicating,
 * deleting. There is no longer a name field and a menu both printing it.
 */
async function openArrangements(page: Page) {
  const trigger = page.getByRole("button", { name: "Layouts" });
  // Idempotent: the trigger toggles, so opening one that is already open
  // would shut it. Several tests reach for the table more than once.
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  return page.getByRole("dialog", { name: "Layouts" });
}

/**
 * Places a product from the list: pressing its row arms it, and the click on
 * the plan says where. `offset` moves the click off the middle so two pieces
 * placed in a row do not land on top of each other.
 */
async function placeFromList(page: Page, name: string, offset = 0) {
  await contents(page)
    .getByRole("button", { name: `Place ${name} in the room` })
    .click();
  const box = await planImage(page).boundingBox();
  if (box === null) {
    throw new Error("the plan has no box to point at");
  }
  await page.mouse.click(
    box.x + (box.width - PLAN_RESERVE) / 2 + offset,
    box.y + box.height / 2 + offset,
  );
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
  await form.getByLabel("Length").fill(fields.depth);
  if (fields.price !== undefined) {
    await form.getByLabel("Price").fill(fields.price);
  }
  await form.getByRole("button", { name: "Add product" }).click();
  await expect(
    contents(page).getByRole("button", {
      name: `Place ${fields.name} in the room`,
    }),
  ).toBeVisible();
}

test.describe("the workspace", () => {
  test("opens on the list, the plan, and a room somebody measured", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    await expect(
      contents(page).getByRole("button", { name: "Living room", exact: true }),
    ).toBeVisible();
    await expect(planImage(page)).toBeVisible();
    // Nothing selected: nothing to edit, and no panel on the right. The
    // apartment's own settings are behind the gear.
    await expect(details(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
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
    await page.mouse.click(
      box.x + (box.width - PLAN_RESERVE) / 2,
      box.y + box.height / 2,
    );

    await expect(
      contents(page).getByRole("button", { name: "Room 1", exact: true }),
    ).toBeVisible();
    // Gone without being dismissed: a plan with something on it explains
    // itself.
    await expect(plan(page).getByText("Nothing measured yet")).toBeHidden();
  });

  test("selects a room from the list and edits it on the right", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const inspector = details(page).getByRole("region", {
      name: "Living room",
    });
    await expect(inspector).toBeVisible();
    await inspector.getByLabel("Living room width").fill("120");

    await expect(planImage(page)).toHaveAccessibleName(/120" wide/);
    await expect(
      plan(page).getByText(
        "Drag or resize the room here, or type its X/Y and W/D",
      ),
    ).toBeVisible();
  });

  test("renames a room directly in the apartment list", async ({ page }) => {
    await openWithLivingRoom(page);

    const room = contents(page).getByRole("button", {
      name: "Living room",
      exact: true,
    });
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
      contents(page).getByRole("button", { name: "Great room", exact: true }),
    ).toBeVisible();
    await expect(
      details(page).getByRole("region", { name: "Great room", exact: true }),
    ).toBeVisible();
  });

  test("adds a room, and it appears in the list and the plan", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    await addRoom(page);

    await expect(
      contents(page).getByRole("button", { name: "Room 2", exact: true }),
    ).toBeVisible();
    await expect(planImage(page)).toHaveAccessibleName(/holding 2 rooms/);
    // Added means selected, so it can be sized straight away.
    await expect(
      details(page).getByRole("region", { name: "Room 2", exact: true }),
    ).toBeVisible();
  });

  test("enters a product and places it in the room", async ({ page }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Rug", width: "96", depth: "60" });

    await placeFromList(page, "Rug");

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
    await placeFromList(page, "Rug");

    await details(page).getByLabel("From west").fill("24");

    await expect(planImage(page)).toHaveAccessibleName(
      /24" from the west wall/,
    );
  });

  test("reports what does not fit, under the plan", async ({ page }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Sectional", width: "94.5", depth: "63" });
    await placeFromList(page, "Sectional");

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
    await placeFromList(page, "Olive tree");
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
    await placeFromList(page, "Rug");

    // The piece is selected; its size and price belong to the product.
    await expect(details(page).getByText("$349.00")).toBeVisible();
    await details(page).getByRole("button", { name: "Edit Rug" }).click();

    // Now editing the product itself, and a change reaches the plan.
    await details(page).getByLabel("Width").fill("48");
    await details(page).getByRole("button", { name: "Save changes" }).click();

    // The form closes and says so, and the change reaches the plan.
    await expect(page.getByRole("status", { name: "" })).toContainText(
      "Saved Rug",
    );
    await expect(planImage(page)).toHaveAccessibleName(/48" by 60"/);
  });
});

test.describe("the plan as a canvas", () => {
  async function planCentre(page: Page) {
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    return {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };
  }

  async function placeRug(page: Page) {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Rug", width: "96", depth: "60" });
    await placeFromList(page, "Rug");
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

  test("lands a piece dragged near a wall flush against it", async ({
    page,
  }) => {
    await placeRug(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const scale = Math.min(
      (box.width - PLAN_RESERVE - padding * 2) / metres(168 + WALL_INCHES * 2),
      (box.height - padding * 2) / metres(144 + WALL_INCHES * 2),
    );
    const centre = await planCentre(page);

    // The rug is 96" wide at the middle of a room whose west wall is 84" out.
    // Dragged until its west edge stops 2" short of that wall, which is the
    // kind of gap a hand leaves and a plan should not keep.
    const stopShortInches = -84 + 48 + 2;
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(
      centre.x + metres(stopShortInches) * scale,
      centre.y,
      {
        steps: 10,
      },
    );
    await page.mouse.up();

    // Flush: its centre is half its width in from the wall.
    await expect(details(page).getByLabel("From west")).toHaveValue("-36");

    // Alt puts it exactly where the pointer says, gap and all.
    await page.mouse.move(centre.x + metres(-36) * scale, centre.y);
    await page.keyboard.down("Alt");
    await page.mouse.down();
    await page.mouse.move(
      centre.x + metres(stopShortInches) * scale,
      centre.y,
      {
        steps: 10,
      },
    );
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect(details(page).getByLabel("From west")).toHaveValue("-34");
  });

  test("holds a piece on the wall until the pointer pulls clearly away", async ({
    page,
  }) => {
    await placeRug(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const scale = Math.min(
      (box.width - PLAN_RESERVE - padding * 2) / metres(168 + WALL_INCHES * 2),
      (box.height - padding * 2) / metres(144 + WALL_INCHES * 2),
    );
    const centre = await planCentre(page);
    const fromWest = details(page).getByLabel("From west");

    // Land flush on the west wall, and keep the button down.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    const flush = centre.x + metres(-84 + 48 + 2) * scale;
    await page.mouse.move(flush, centre.y, { steps: 10 });
    await expect(fromWest).toHaveValue("-36");

    // A dozen pixels back is a hand's tremor, not a decision: still flush.
    await page.mouse.move(flush + 12, centre.y, { steps: 4 });
    await expect(fromWest).toHaveValue("-36");

    // Forty is a decision, and the piece follows the pointer again.
    await page.mouse.move(flush + 40, centre.y, { steps: 4 });
    await page.mouse.up();
    expect(Number(await fromWest.inputValue())).toBeGreaterThan(-36);
  });

  test("types a piece's gap to a wall, and reads it back", async ({ page }) => {
    await placeRug(page);
    // The rug is 96" wide in the middle of a room whose west wall is 84" out,
    // so it starts 36" off that wall.
    await expect(details(page).getByLabel("Gap to west wall")).toHaveValue(
      "36",
    );

    await details(page).getByLabel("Gap to west wall").fill("6");

    // Six inches off the wall: its centre is the wall, plus the gap, plus
    // half its width.
    await expect(details(page).getByLabel("From west")).toHaveValue("-30");
    await expect(details(page).getByLabel("Gap to east wall")).toHaveValue(
      "66",
    );
  });

  test("selects two pieces with a rectangle and moves them as one", async ({
    page,
  }) => {
    await placeRug(page);
    const rugBefore = Number(
      await details(page).getByLabel("From west").inputValue(),
    );
    await addProduct(page, { name: "Lamp", width: "12", depth: "12" });
    await placeFromList(page, "Lamp", 90);
    const lampBefore = Number(
      await details(page).getByLabel("From west").inputValue(),
    );
    const centre = await planCentre(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    // From open floor outside the room, across both pieces.
    await page.mouse.move(box.x + 8, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(centre.x + 130, centre.y + 130, { steps: 8 });
    await page.mouse.up();
    await expect(
      details(page).getByRole("heading", { name: "2 pieces" }),
    ).toBeVisible();

    // Dragging one drags both, by the same amount.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x - 60, centre.y, { steps: 10 });
    await page.mouse.up();
    await expect(
      details(page).getByRole("heading", { name: "2 pieces" }),
    ).toBeVisible();

    await page.mouse.click(centre.x - 60, centre.y);
    const rugWest = Number(
      await details(page).getByLabel("From west").inputValue(),
    );
    await page.mouse.click(centre.x + 30, centre.y + 90);
    const lampWest = Number(
      await details(page).getByLabel("From west").inputValue(),
    );
    // Both went west, and by the same amount.
    expect(rugWest).toBeLessThan(rugBefore);
    expect(lampWest).toBeLessThan(lampBefore);
    expect(rugBefore - rugWest).toBeCloseTo(lampBefore - lampWest, 0);
  });

  test("carries the furniture when the room itself is dragged", async ({
    page,
  }) => {
    await placeRug(page);
    const fromWest = details(page).getByLabel("From west");
    const gapWest = details(page).getByLabel("Gap to west wall");
    const before = Number(await fromWest.inputValue());
    const gapBefore = await gapWest.inputValue();
    const centre = await planCentre(page);

    // Grab the room by its floor, clear of the rug, and slide it east. The
    // rug goes with it: its place on the floor changes, and its distance
    // from the west wall does not.
    await page.mouse.move(centre.x - 250, centre.y - 200);
    await page.mouse.down();
    await page.mouse.move(centre.x - 190, centre.y - 200, { steps: 10 });
    await page.mouse.up();
    await expect(
      details(page).getByRole("region", { name: "Living room", exact: true }),
    ).toBeVisible();

    await page.mouse.click(centre.x + 60, centre.y);
    expect(Number(await fromWest.inputValue())).toBeGreaterThan(before);
    await expect(gapWest).toHaveValue(gapBefore);
  });

  test("takes the room into the group, and moves it with its furniture", async ({
    page,
  }) => {
    await placeRug(page);
    const rugBefore = Number(
      await details(page).getByLabel("From west").inputValue(),
    );
    const centre = await planCentre(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    // A rectangle across the whole plan takes the room and the rug.
    await page.mouse.move(box.x + 8, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(
      details(page).getByRole("heading", { name: "1 room and 1 piece" }),
    ).toBeVisible();

    // Dragging the rug carries the room with it.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 60, centre.y, { steps: 10 });
    await page.mouse.up();

    await page.mouse.click(centre.x + 60, centre.y);
    const rugWest = Number(
      await details(page).getByLabel("From west").inputValue(),
    );
    expect(rugWest).toBeGreaterThan(rugBefore);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    const roomWest = Number(
      await room.getByLabel("Living room X position").inputValue(),
    );
    expect(roomWest - -84).toBeCloseTo(rugWest - rugBefore, 0);

    // Shift and a drag pans rather than selecting, with the hand to say so.
    await page.keyboard.down("Shift");
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x - 40, centre.y - 40, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect(room.getByLabel("Living room X position")).toHaveValue(
      String(roomWest),
    );
  });

  test("says when a piece stops the door from opening", async ({ page }) => {
    // The living room's door is on the south wall, 36" from the west corner,
    // 32" wide, hinged at the west jamb and swinging in. Its swing is the
    // quarter circle north-east of the hinge at 20" from the corner.
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Stool", width: "16", depth: "16" });
    await placeFromList(page, "Stool");
    await details(page).getByLabel("From west").fill("-40");
    await details(page).getByLabel("From north").fill("52");

    await expect(
      page.getByText(/Stool is in the swing of Living room door 1/),
    ).toBeVisible();

    // Out of the arc, and the door is free again.
    await details(page).getByLabel("From north").fill("0");
    await expect(page.getByText(/is in the swing of/)).toHaveCount(0);
  });

  test("deletes a placed product from its row's menu, pieces and all", async ({
    page,
  }) => {
    await placeRug(page);
    await expect(planImage(page)).toHaveAccessibleName(/1 piece placed: Rug/);

    await contents(page)
      .getByRole("button", { name: "Place Rug in the room" })
      .click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Rug" });
    await expect(menu.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await menu
      .getByRole("menuitem", { name: "Delete, and take it out of the room" })
      .click();

    // Gone from the list and from the plan, in one step.
    await expect(
      contents(page).getByRole("button", { name: "Place Rug in the room" }),
    ).toHaveCount(0);
    await expect(planImage(page)).not.toHaveAccessibleName(/piece placed/);
    await page.keyboard.press("Control+z");
    await expect(planImage(page)).toHaveAccessibleName(/1 piece placed: Rug/);
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

  test("pans on two fingers over the plan without clicking into it", async ({
    page,
  }) => {
    await placeRug(page);
    const centre = await planCentre(page);
    // Placing was a click on the plan, which focused it; leave again by
    // way of the list, the way a hand that has gone elsewhere would.
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(planImage(page)).not.toBeFocused();

    // Hovering is enough: a trackpad scroll over the plan moves it.
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.wheel(0, 200);

    // The drawing moved up with the scroll, so the rug is 200 pixels higher,
    // and the plan was not entered by it.
    await expect(planImage(page)).not.toBeFocused();
    await page.mouse.click(centre.x, centre.y - 200);
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeVisible();
  });

  test("zooms on a pinch even before the plan is clicked into", async ({
    page,
  }) => {
    await placeRug(page);
    const centre = await planCentre(page);
    // A point still on the rug at the fitted scale.
    const onRug = { x: centre.x, y: centre.y + 50 };
    await page.mouse.click(onRug.x, onRug.y);
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeVisible();
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(planImage(page)).not.toBeFocused();

    // A trackpad pinch is a wheel with Ctrl held. Out, several times.
    await page.mouse.move(centre.x, centre.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 6; i += 1) {
      await page.mouse.wheel(0, 400);
    }
    await page.keyboard.up("Control");

    // The plan took the zoom without being entered, and the rug has shrunk
    // about the pointer, so the same point is now floor.
    await expect(planImage(page)).not.toBeFocused();
    await page.mouse.click(onRug.x, onRug.y);
    await expect(
      details(page).getByRole("region", { name: "Rug" }),
    ).toBeHidden();
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
    await placeFromList(page, "Sectional");
  }

  test("duplicates an arrangement and keeps both", async ({ page }) => {
    await withASofa(page);

    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Duplicate Layout 1" })
      .click();

    // The copy is the one being worked on, and it holds the same furniture.
    await expect(page.getByRole("button", { name: "Layouts" })).toContainText(
      "Layout 2",
    );
    await expect(planImage(page)).toHaveAccessibleName(
      /1 piece placed: Sectional/,
    );
    // Both are in the table, and only the copy — the one being worked on —
    // carries what can be done to an arrangement.
    const table = await openArrangements(page);
    await expect(
      table.getByRole("button", { name: /^Layout 1/ }),
    ).toBeVisible();
    await expect(
      table.getByRole("button", { name: /^Layout 2/ }),
    ).toBeVisible();
    await expect(table.getByRole("button", { name: /^Rename/ })).toHaveCount(1);
    await expect(
      table.getByRole("button", { name: "Rename Layout 2" }),
    ).toBeVisible();
  });

  test("changes one arrangement without touching the other", async ({
    page,
  }) => {
    await withASofa(page);
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Duplicate Layout 1" })
      .click();

    // In the copy, swap the sectional for the loveseat.
    await contents(page)
      .getByRole("button", { name: "Sectional", exact: true })
      .click();
    await details(page)
      .getByRole("button", { name: "Sectional actions" })
      .click();
    await page
      .getByRole("menuitem", { name: "Take Sectional out of the room" })
      .click();
    await placeFromList(page, "Loveseat");
    await expect(planImage(page)).toHaveAccessibleName(
      /1 piece placed: Loveseat/,
    );

    // The first arrangement still has the sectional in it.
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: /^Layout 1/ })
      .click();
    await expect(planImage(page)).toHaveAccessibleName(
      /1 piece placed: Sectional/,
    );
  });

  test("starts an empty arrangement, and keeps the furnished one", async ({
    page,
  }) => {
    await withASofa(page);

    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "New layout" })
      .click();

    // Nothing placed, under the next name, with the catalogue still there.
    await expect(page.getByRole("button", { name: "Layouts" })).toContainText(
      "Layout 2",
    );
    await expect(planImage(page)).not.toHaveAccessibleName(/piece placed/);
    await expect(
      contents(page).getByRole("button", {
        name: "Place Sectional in the room",
      }),
    ).toBeVisible();

    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: /^Layout 1/ })
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
      .getByRole("button", { name: "Duplicate Layout 1" })
      .click();

    const table = await openArrangements(page);
    await table.getByRole("button", { name: "Rename Layout 2" }).click();
    await table.getByLabel("Layout name").fill("Loveseat instead");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.reload();

    await expect(page.getByRole("button", { name: "Layouts" })).toContainText(
      "Loveseat instead",
    );
  });

  test("prices each arrangement, so they can be weighed against each other", async ({
    page,
  }) => {
    await withASofa(page);
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Duplicate Layout 1" })
      .click();
    await contents(page)
      .getByRole("button", { name: "Sectional", exact: true })
      .click();
    await details(page)
      .getByRole("button", { name: "Sectional actions" })
      .click();
    await page
      .getByRole("menuitem", { name: "Take Sectional out of the room" })
      .click();
    await placeFromList(page, "Loveseat");
    await page.waitForTimeout(500);

    await page.goto("/overview");

    // The cheaper arrangement is named as such rather than left to arithmetic.
    const comparison = page.getByRole("row", { name: /Layout 1/ });
    await expect(comparison).toContainText("$1,999.00");
    await expect(page.getByRole("row", { name: /Layout 2/ })).toContainText(
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
      .getByRole("button", { name: "Duplicate Layout 1" })
      .click();
    await (
      await openArrangements(page)
    )
      .getByRole("button", { name: "Delete Layout 2" })
      .click();

    await expect(page.getByRole("button", { name: "Layouts" })).toContainText(
      "Layout 1",
    );
    await expect(
      (await openArrangements(page)).getByRole("button", { name: /^Delete/ }),
    ).toBeHidden();
  });

  test("names the arrangement once, not twice", async ({ page }) => {
    await openWithLivingRoom(page);

    // The header used to hold a name field and a menu that both printed it,
    // at two different heights, beside a third control at a third height.
    await expect(page.getByLabel("Layout name")).toBeHidden();
    const trigger = page.getByRole("button", { name: "Layouts" });
    await expect(trigger).toContainText("Layout 1");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    // The price is beside the name in the table, which is what makes a second
    // arrangement a comparison rather than a bookmark.
    const table = await openArrangements(page);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(
      table.getByRole("button", { name: /^Layout 1/ }),
    ).toContainText("$0.00");

    await page.keyboard.press("Escape");
    await expect(table).toBeHidden();
  });
});

test.describe("filling a product in from a link", () => {
  async function openImport(page: Page) {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "New product" }).click();
    return details(page);
  }

  test("fetches the page once and fills in what it read, for checking", async ({
    page,
    context,
  }) => {
    const form = await openImport(page);
    const calls: string[] = [];
    await page.route("**/api/import", async (route) => {
      calls.push(route.request().postDataJSON().url);
      await route.fulfill({
        json: {
          status: "read",
          extracted: {
            name: {
              value: 'Abisko 94.5" Velvet Right Sectional',
              sourceText: 'Abisko 94.5" Velvet Right Sectional',
            },
            priceCents: { value: 169900, sourceText: "price: 1699" },
            widthMeters: { value: 2.4003, sourceText: '94.5"W' },
            depthMeters: { value: 1.6129, sourceText: '63.5"D' },
            heightMeters: { value: 0.7112, sourceText: '28"H' },
            dimensionOrderIsAssumed: false,
          },
        },
      });
    });

    // The link is the first field, and pasting into it is the fetch.
    const address = "https://www.article.com/product/22588/abisko";
    const link = form.getByLabel("Product link");
    await expect(form.getByRole("textbox").first()).toHaveAccessibleName(
      "Product link",
    );
    await link.click();
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate((text) => navigator.clipboard.writeText(text), address);
    await page.keyboard.press("ControlOrMeta+V");

    // One fetch, of the one address, on the one press.
    await expect(form.getByRole("status")).toContainText("Read 5 values");
    expect(calls).toEqual([address]);

    // The form is filled, not the catalogue: nothing is saved until it is
    // checked and added, and the link is carried over as well.
    await expect(form.getByLabel("Name")).toHaveValue(
      'Abisko 94.5" Velvet Right Sectional',
    );
    await expect(form.getByLabel("Price")).toHaveValue("1699.00");
    await expect(form.getByLabel("Width")).toHaveValue("94.5");
    await expect(form.getByLabel("Length")).toHaveValue("63.5");
    await expect(form.getByLabel("Product link")).toHaveValue(address);
    await expect(form.getByLabel("Retailer")).toHaveValue("Article");
    await expect(
      contents(page).getByRole("button", { name: /Place Abisko/ }),
    ).toHaveCount(0);
  });

  test("says when a page could not be read, instead of guessing", async ({
    page,
  }) => {
    const form = await openImport(page);
    await page.route("**/api/import", (route) =>
      route.fulfill({
        json: { status: "read", extracted: { dimensionOrderIsAssumed: false } },
      }),
    );
    await form
      .getByLabel("Product link")
      .fill("https://www.target.com/p/tv-stand/-/A-1");
    await form.getByRole("button", { name: "Fetch the page" }).click();

    await expect(form.getByRole("status")).toContainText(
      "Nothing could be read from that",
    );
    await expect(form.getByLabel("Name")).toHaveValue("");
  });

  test("the endpoint refuses an address on this machine", async ({
    page,
    request,
  }) => {
    const form = await openImport(page);
    const answer = await request.post("/api/import", {
      data: { url: "http://localhost:3000/" },
    });
    expect(await answer.json()).toMatchObject({ status: "refused" });

    await form.getByLabel("Product link").fill("http://localhost:3000/");
    await form.getByLabel("Product link").press("Enter");
    await expect(form.getByRole("status")).toContainText(
      "not a web address this can fetch",
    );
  });
});

test.describe("the perspective view", () => {
  test("stands the rooms up, and the plan comes back for drawing", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await page.getByRole("button", { name: "Perspective" }).click();

    // The same apartment, described the same way: one room, its height
    // stated, because the picture is never the only way to know a number.
    const scene = page.getByRole("img", { name: /^Perspective view/ });
    await expect(scene).toBeVisible();
    await expect(scene).toHaveAttribute(
      "aria-label",
      /holding 1 room: Living room 96" high\./,
    );
    await expect(page.getByRole("main", { name: "Perspective" })).toBeVisible();
    await expect(scene.locator("canvas")).toBeVisible();

    // Walls are see-through until asked to be solid.
    const seeThrough = page.getByRole("button", { name: "See-through walls" });
    const solid = page.getByRole("button", { name: "Solid walls" });
    await expect(seeThrough).toHaveAttribute("aria-pressed", "true");
    await solid.click();
    await expect(solid).toHaveAttribute("aria-pressed", "true");
    await expect(seeThrough).toHaveAttribute("aria-pressed", "false");
    const auto = page.getByRole("button", { name: "Auto walls" });
    await auto.click();
    await expect(auto).toHaveAttribute("aria-pressed", "true");
    await expect(solid).toHaveAttribute("aria-pressed", "false");

    // Arming a drawing mode is an edit, and edits happen on the plan.
    await contents(page).getByRole("button", { name: "Add room" }).click();
    await expect(page.getByRole("main", { name: "Plan" })).toBeVisible();
    await expect(planImage(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("main", { name: "Perspective" })).toBeVisible();

    await page.getByRole("button", { name: "Perspective" }).click();
    await expect(page.getByRole("main", { name: "Plan" })).toBeVisible();
  });

  test("stands each placed piece up at its product's size", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Sofa", width: "84", depth: "36" });
    await placeFromList(page, "Sofa");
    await page.getByRole("button", { name: "Perspective" }).click();

    // Said in words as well as drawn: a box is the product's footprint,
    // stood up to its height, and nothing else.
    const scene = page.getByRole("img", { name: /^Perspective view/ });
    await expect(scene).toHaveAttribute(
      "aria-label",
      /1 piece standing: Sofa, 84" by 36", [\d.]+" high\./,
    );
  });

  test("says so when there is nothing to stand up yet", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Perspective" }).click();
    await expect(
      page.getByRole("img", {
        name: "Perspective view of an apartment with no rooms in it yet.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Draw the rooms on the plan first"),
    ).toBeVisible();
  });
});

test.describe("more than one project", () => {
  async function openProjects(page: Page) {
    const trigger = page.getByRole("button", { name: "Projects" });
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
    return page.getByRole("dialog", { name: "Projects" });
  }

  test("starts a second project empty, and keeps the first", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await expect(page.getByRole("button", { name: "Projects" })).toContainText(
      "Project 1",
    );

    await (
      await openProjects(page)
    )
      .getByRole("button", { name: "New project" })
      .click();

    // A new apartment, not a copy: no rooms, under its own name.
    await expect(page.getByRole("button", { name: "Projects" })).toContainText(
      "Project 2",
    );
    await expect(contents(page).getByText("Living room")).toHaveCount(0);

    // Both are listed, and the first comes back with its room, even after a
    // reload — which is what makes it a second project rather than a reset.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByRole("button", { name: "Projects" })).toContainText(
      "Project 2",
    );
    await (
      await openProjects(page)
    )
      .getByRole("button", { name: /^Project 1/ })
      .click();
    await expect(page.getByRole("button", { name: "Projects" })).toContainText(
      "Project 1",
    );
    await expect(contents(page).getByText("Living room")).toBeVisible();
  });

  test("lists a project made in another tab, while the menu is open", async ({
    page,
    context,
  }) => {
    await openWithLivingRoom(page);
    const table = await openProjects(page);
    await expect(table.getByRole("button", { name: /^Project 2/ })).toHaveCount(
      0,
    );

    const other = await context.newPage();
    await other.goto("/");
    await (
      await openProjects(other)
    )
      .getByRole("button", { name: "New project" })
      .click();
    await expect(other.getByRole("button", { name: "Projects" })).toContainText(
      "Project 2",
    );

    // Storage was written in the other tab; this one follows without the
    // menu being closed and opened again.
    await expect(
      table.getByRole("button", { name: /^Project 2/ }),
    ).toBeVisible();
    await other.close();
  });

  test("renames a project, and the name sticks across a reload", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const table = await openProjects(page);
    await table.getByRole("button", { name: "Rename Project 1" }).click();
    await table.getByLabel("Project name").fill("The two-bedroom");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.reload();

    await expect(page.getByRole("button", { name: "Projects" })).toContainText(
      "The two-bedroom",
    );
  });

  test("deletes a project and lands on the other one", async ({ page }) => {
    await openWithLivingRoom(page);
    await (
      await openProjects(page)
    )
      .getByRole("button", { name: "New project" })
      .click();

    await (
      await openProjects(page)
    )
      .getByRole("button", { name: "Delete Project 2" })
      .click();

    // No question first: the way back is the Undo on the message instead.
    await expect(page.getByRole("button", { name: "Projects" })).toContainText(
      "Project 1",
    );
    await expect(contents(page).getByText("Living room")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Deleted Project 2");
    const table = await openProjects(page);
    await expect(table.getByRole("button", { name: /^Project 2/ })).toHaveCount(
      0,
    );
    await page.keyboard.press("Escape");

    // Once the message has gone, so has the project: a reload does not
    // bring it back.
    await expect(page.getByRole("status")).toBeHidden({ timeout: 8000 });
    await page.reload();
    await expect(
      (await openProjects(page)).getByRole("button", { name: /^Project 2/ }),
    ).toHaveCount(0);
  });

  test("brings a deleted project back with Undo", async ({ page }) => {
    await openWithLivingRoom(page);
    await (
      await openProjects(page)
    )
      .getByRole("button", { name: "New project" })
      .click();
    await (
      await openProjects(page)
    )
      .getByRole("button", { name: "Delete Project 2" })
      .click();

    await page.getByRole("button", { name: "Undo deleting Project 2" }).click();

    await expect(page.getByRole("status")).toBeHidden();
    await expect(
      (await openProjects(page)).getByRole("button", { name: /^Project 2/ }),
    ).toHaveCount(1);
  });
});

test.describe("laying the apartment out", () => {
  test("places, lists, selects, moves, and resizes an opening on the plan", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

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
      (box.width - PLAN_RESERVE - padding * 2) / metres(168 + WALL_INCHES * 2),
      (box.height - padding * 2) / metres(144 + WALL_INCHES * 2),
    );
    const middle = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };
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
    await expect(
      opening
        .getByRole("group", { name: "Living room door 2 wall" })
        .getByRole("button", { name: "North wall (top)" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Read along the wall: 20" of wall, a 32" door, and the rest.
    const startGap = opening.getByLabel("Gap from the start corner", {
      exact: true,
    });
    const endGap = opening.getByLabel("Gap to the end corner", { exact: true });
    await expect(startGap).toHaveValue("20");
    await expect(opening.getByLabel("Width", { exact: true })).toHaveValue(
      "32",
    );
    await expect(endGap).toHaveValue("116");

    // A measured gap stays exact, moves the door, and the far gap follows.
    await startGap.fill("24");
    await expect(startGap).toHaveValue("24");
    await expect(endGap).toHaveValue("112");
    await expect(plan(page).getByText(`x -44"`)).toBeVisible();

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
    const movedStart = Number(await startGap.inputValue());
    expect(movedStart).toBeGreaterThan(24);
    expect(movedStart % 1).toBe(0);

    // Drag its end jamb. The start stays put, so the width grows into the
    // gap beyond it.
    const beforeWidth = Number(
      await opening.getByLabel("Width", { exact: true }).inputValue(),
    );
    const beforeEnd = Number(await endGap.inputValue());
    const movedCenter = movedStart + beforeWidth / 2;
    const endJamb = {
      x: middle.x + metres(-84 + movedCenter + beforeWidth / 2) * scale,
      y: north.y,
    };
    await page.mouse.move(endJamb.x, endJamb.y);
    await page.mouse.down();
    await page.mouse.move(endJamb.x + 24, endJamb.y, { steps: 6 });
    await page.mouse.up();

    expect(
      Number(await opening.getByLabel("Width", { exact: true }).inputValue()),
    ).toBeGreaterThan(beforeWidth);
    expect(Number(await endGap.inputValue())).toBeLessThan(beforeEnd);
    expect(Number(await startGap.inputValue())).toBe(movedStart);
  });

  test("snaps a room against its neighbour, sharing one wall", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);

    // The living room runs to 84 inches and the wall is 4.5 thick, so sharing
    // it means 88.5. Typing 87 is near enough to mean it.
    const room = details(page).getByRole("region", {
      name: "Room 2",
      exact: true,
    });
    await room.getByLabel("Room 2 X position").fill("87");

    await expect(room.getByLabel("Room 2 X position")).toHaveValue("88.5");
  });

  test("lists a door cut in a shared wall under both rooms", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);
    const room = details(page).getByRole("region", {
      name: "Room 2",
      exact: true,
    });
    // Below the living room, sharing its south wall: the wall the door is
    // in. 72 and 4.5 make 76.5; 76 is near enough to mean it.
    await room.getByLabel("Room 2 X position").fill("-84");
    await room.getByLabel("Room 2 Y position").fill("76");
    await expect(room.getByLabel("Room 2 Y position")).toHaveValue("76.5");

    // The living room's door, listed under Room 2 as well, and it is the
    // same door: selecting it opens the living room's.
    const shared = contents(page).getByRole("button", {
      name: "Door 1 · Living room",
    });
    await expect(shared).toBeVisible();
    await shared.click();
    await expect(
      details(page).getByRole("region", { name: "Living room door 1" }),
    ).toBeVisible();

    // Moved away, Room 2 has no door of its own to show.
    await contents(page)
      .getByRole("button", { name: "Room 2", exact: true })
      .click();
    await room.getByLabel("Room 2 Y position").fill("120");
    await expect(shared).toHaveCount(0);
  });

  test("groups two sections into one closet, walled round its outline", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const roomRow = contents(page).getByRole("button", {
      name: "Living room",
      exact: true,
    });
    await roomRow.click();
    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const inches = (value: number) => value * 0.0254;
    const wall = inches(WALL_INCHES);
    const scale = Math.min(
      (box.width - PLAN_RESERVE - 80) / (inches(168) + 2 * wall),
      (box.height - 80) / (inches(144) + 2 * wall),
    );
    const center = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };
    const at = (xInches: number, yInches: number) => ({
      x: center.x + inches(xInches) * scale,
      y: center.y + inches(yInches) * scale,
    });
    const drawSection = async (
      from: [number, number],
      to: [number, number],
    ) => {
      await roomRow.click();
      await room.getByRole("button", { name: "Add section" }).click();
      const a = at(...from);
      const b = at(...to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 8 });
      await page.mouse.up();
    };
    // Two small rectangles side by side in the room's south-east corner.
    await drawSection([0, 0], [36, 48]);
    await drawSection([36, 0], [60, 24]);
    const row = (name: string) =>
      contents(page).getByRole("button", { name, exact: true });
    await expect(row("Section 3")).toBeVisible();

    // Grouped from the list: one row for the pair, and the pair under it.
    await row("Section 3").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Group with Section 2" }).click();
    await expect(row("Group 1")).toBeVisible();
    await expect(row("Section 2")).toBeVisible();
    await expect(row("Section 3")).toBeVisible();

    // Named like a room, and the pair's walls stand round their outline:
    // the plan now reads them as a closet with walls, not two patches.
    await row("Group 1").dblclick();
    await contents(page).getByLabel("Rename Group 1").fill("Closet");
    await page.keyboard.press("Enter");
    await expect(row("Closet")).toBeVisible();

    // Folded like a room, and the panel's chips list the closet once, with
    // its own sections on a row of their own.
    await contents(page)
      .getByRole("button", { name: "Collapse Closet" })
      .click();
    await expect(row("Section 2")).toBeHidden();
    await contents(page).getByRole("button", { name: "Expand Closet" }).click();
    await expect(row("Section 2")).toBeVisible();
    await row("Closet").click();
    await expect(row("Closet")).toHaveAttribute("aria-pressed", "true");
    await expect(row("Section 2")).toHaveAttribute("aria-pressed", "false");
    await expect(
      room.getByRole("button", { name: "Select Living room Closet" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      room.getByRole("group", { name: "Group sections" }),
    ).toBeVisible();

    // Picked up by either of its sections, the group moves as one and the
    // room stays where it was. The panel shows the first section's fields.
    const sectionX = room.getByLabel("Living room section 2 X position");
    const roomX = room.getByLabel("Living room section 1 X position");
    await roomRow.click();
    const roomBefore = await roomX.inputValue();
    await row("Closet").click();
    const sectionBefore = Number(await sectionX.inputValue());
    const grab = at(48, 12);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 60, grab.y, { steps: 8 });
    await page.mouse.up();
    await expect(row("Closet")).toHaveAttribute("aria-pressed", "true");
    expect(Number(await sectionX.inputValue())).toBeGreaterThan(sectionBefore);
    await roomRow.click();
    await expect(roomX).toHaveValue(roomBefore);

    // One section selected on its own moves on its own: the other stays.
    await row("Section 3").click();
    const otherX = room.getByLabel("Living room section 2 X position");
    const ownX = room.getByLabel("Living room section 3 X position");
    const ownBefore = Number(await ownX.inputValue());
    await row("Section 2").click();
    const otherBefore = await otherX.inputValue();
    await row("Section 3").click();
    // Where the third section is now: it went east with the group.
    const hold = { x: grab.x + 60, y: grab.y };
    await page.mouse.move(hold.x, hold.y);
    await page.mouse.down();
    await page.mouse.move(hold.x + 40, hold.y, { steps: 8 });
    await page.mouse.up();
    expect(Number(await ownX.inputValue())).toBeGreaterThan(ownBefore);
    await row("Section 2").click();
    await expect(otherX).toHaveValue(otherBefore);

    // The group survives a reload, and comes apart on request.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(row("Closet")).toBeVisible();
    await row("Closet").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Ungroup" }).click();
    await expect(row("Closet")).toHaveCount(0);
    await expect(row("Section 2")).toBeVisible();
  });

  test("draws a second rectangle into a room and edits it on its own", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    // The living room alone, which is what the plan is fitted to. The new
    // rectangle is drawn inside it, so these bounds — and this projection —
    // hold before and after.
    const inches = (value: number) => value * 0.0254;
    const wall = inches(WALL_INCHES);
    const bounds = { west: -84, north: -72, east: 84, south: 72 };
    const scale = Math.min(
      (box.width - PLAN_RESERVE - 80) /
        (inches(bounds.east - bounds.west) + wall * 2),
      (box.height - 80) / (inches(bounds.south - bounds.north) + wall * 2),
    );
    const center = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
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

    // Arming the tool does not add anything by itself: the rectangle is drawn
    // where it goes, rather than dropped at a guess and moved by typing.
    await room.getByRole("button", { name: "Add section" }).click();
    await expect(
      room.getByRole("button", { name: "Add section" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Nothing added yet: the room is still the one rectangle it was, so it has
    // no second one to describe.
    await expect(room.getByLabel("Living room section 2 width")).toBeHidden();

    const partTwoWest = 0;
    const partTwoNorth = 0;
    const partTwoWidth = 48;
    const partTwoDepth = 48;
    const from = pointOnPlan(partTwoWest, partTwoNorth);
    const to = pointOnPlan(
      partTwoWest + partTwoWidth,
      partTwoNorth + partTwoDepth,
    );
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();

    await expect(room.getByLabel("Living room section 2 width")).toBeVisible();
    await expect(
      contents(page).getByRole("button", { name: "Section 2" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(planImage(page)).toHaveAccessibleName(
      /built from 2 rectangles/,
    );

    // The first rectangle is the room's own row; only the added section has
    // a row of its own, and the panel's own chips reach the first.
    await expect(
      contents(page).getByRole("button", { name: "Section 1" }),
    ).toHaveCount(0);
    await contents(page).getByRole("button", { name: "Section 2" }).click();
    await room
      .getByRole("button", { name: "Select Living room section 1" })
      .click();
    await expect(
      room.getByRole("button", { name: "Select Living room section 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    await contents(page).getByRole("button", { name: "Section 2" }).click();

    // Double-click drills into either rectangle directly from whole-room
    // selection, so editing a compound room does not depend on the layer list.
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const partOneOnly = pointOnPlan(-50, 0);
    await page.mouse.dblclick(partOneOnly.x, partOneOnly.y);
    await expect(
      room.getByRole("button", { name: "Select Living room section 1" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Inside both rectangles, where the later one takes the press.
    const partTwoOnly = pointOnPlan(24, 24);
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

    // Section 1 is untouched, which is read by switching to it: the panel
    // describes the selected section rather than every section at once.
    await room
      .getByRole("button", { name: "Select Living room section 1" })
      .click();
    await expect(room.getByLabel("Living room section 1 width")).toHaveValue(
      "168",
    );
  });

  test("turns a section to an exact typed angle, which survives a reload", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    await room
      .getByRole("spinbutton", { name: "Living room angle" })
      .fill("45");

    // A turn changes no measurement: the tape still reads the same sizes.
    await expect(room.getByLabel("Living room width")).toHaveValue("168");
    await expect(plan(page).getByText("168.0 sq ft")).toBeVisible();

    await page.reload();
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(
      details(page)
        .getByRole("region", { name: "Living room", exact: true })
        .getByRole("spinbutton", { name: "Living room angle" }),
    ).toHaveValue("45");
  });

  test("turns one section without turning its neighbour", async ({ page }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    // Arm the tool, then press the plan without dragging: one rectangle of the
    // usual size, where the pointer went down. Where exactly does not matter
    // here — the angles do.
    await room.getByRole("button", { name: "Add section" }).click();
    await page.mouse.click(
      box.x + (box.width - PLAN_RESERVE) / 2,
      box.y + box.height / 2,
    );
    await expect(room.getByLabel("Living room section 2 width")).toBeVisible();

    await room
      .getByRole("spinbutton", { name: "Living room section 2 angle" })
      .fill("45");

    await expect(
      room.getByRole("spinbutton", { name: "Living room section 2 angle" }),
    ).toHaveValue("45");

    // The panel describes one section at a time, so reading the neighbour
    // means switching to it — which is the point of the check: switching back
    // has to find section 1 exactly as it was left.
    await room
      .getByRole("button", { name: "Select Living room section 1" })
      .click();
    await expect(
      room.getByRole("spinbutton", { name: "Living room section 1 angle" }),
    ).toHaveValue("0");
  });

  test("rotates a section by dragging the round handle past its north wall", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const inches = (value: number) => value * 0.0254;
    const wall = inches(WALL_INCHES);
    const scale = Math.min(
      (box.width - PLAN_RESERVE - 80) / (inches(168) + wall * 2),
      (box.height - 80) / (inches(144) + wall * 2),
    );
    const centre = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };
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

    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    await expect(
      room.getByRole("spinbutton", { name: "Living room angle" }),
    ).toHaveValue("45");
    // A turn is not a resize: the tape still reads the same everywhere.
    await expect(room.getByLabel("Living room width")).toHaveValue("168");
    await expect(plan(page).getByText("168.0 sq ft")).toBeVisible();
  });

  test("deletes an opening from its own panel's menu, by name, and undoes it", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Window 1", exact: true })
      .click();
    await expect(planImage(page)).toHaveAccessibleName(/a window/);

    await details(page)
      .getByRole("button", { name: "Living room window 1 actions" })
      .click();
    await page
      .getByRole("menuitem", { name: "Delete Living room window 1" })
      .click();

    // The window is gone everywhere, and the door beside it is not.
    await expect(planImage(page)).not.toHaveAccessibleName(/a window/);
    await expect(
      contents(page).getByRole("button", { name: "Window 1" }),
    ).toHaveCount(0);
    await expect(
      contents(page).getByRole("button", { name: "Door 1", exact: true }),
    ).toBeVisible();

    // No confirmation was asked for, because this is what takes it back.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(planImage(page)).toHaveAccessibleName(/a window/);
  });

  test("traces the listing: an image is dropped, resized by a corner, and kept", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    // The apartment's settings take the image and put it under the grid.
    const settings = async () => {
      const dialog = page.getByRole("dialog", { name: "Settings" });
      if (!(await dialog.isVisible())) {
        await page.getByRole("button", { name: "Settings" }).click();
      }
      return dialog;
    };
    const apartment = await settings();
    await apartment
      .getByLabel("Add plan image")
      .setInputFiles("e2e/fixtures/plan.png");
    const image = page.getByRole("img", {
      name: "The floor plan being traced",
    });
    await expect(image).toBeVisible();

    // Its size is a number, and it is the number the corner drags.
    const width = apartment.getByLabel("Underlay width");
    const dropped = Number(await width.inputValue());
    expect(dropped).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(apartment).toBeHidden();

    // The south-east corner, pulled away from the image, makes it bigger.
    const box = await image.boundingBox();
    if (box === null) {
      throw new Error("the underlay has no box to point at");
    }
    await page.mouse.move(box.x + box.width, box.y + box.height);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 80, box.y + box.height + 60, {
      steps: 8,
    });
    await page.mouse.up();

    // The proportions are kept, so the image is never a drawing that lies
    // about one axis: it grew on both.
    const grown = await image.boundingBox();
    expect(grown?.width ?? 0).toBeGreaterThan(box.width);
    expect(grown?.height ?? 0).toBeGreaterThan(box.height);
    await settings();
    await expect
      .poll(async () => Number(await width.inputValue()))
      .toBeGreaterThan(dropped);

    // A typed width is the exact path, and the top-left corner stays put.
    await width.fill("240");
    await expect(width).toHaveValue("240");

    // The image survives a reload, and hides without being lost.
    await page.reload();
    await expect(
      page.getByRole("img", { name: "The floor plan being traced" }),
    ).toBeVisible();
    await (
      await settings()
    )
      .getByRole("button", { name: "Hide image" })
      .click();
    await expect(image).toHaveCount(0);
  });

  test("keeps the apartment's wall thickness as one typed number", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    // The apartment's own settings, behind the gear. The wall is folded away
    // behind one line that reads it out, because it is set once and read
    // often — so the summary has to carry the number.
    await page.getByRole("button", { name: "Settings" }).click();
    const apartment = page.getByRole("dialog", { name: "Settings" });
    const walls = apartment.getByRole("button", { name: /^Wall thickness/ });
    await expect(walls).toHaveAttribute("aria-expanded", "false");
    await expect(walls).toContainText(`4.5"`);

    await walls.click();
    const thickness = apartment.getByLabel("Wall thickness");
    await thickness.fill("9");
    await expect(thickness).toHaveValue("9");
    await expect(walls).toContainText(`9" walls`);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.reload();
    await page.getByRole("button", { name: "Settings" }).click();
    const reopened = page.getByRole("dialog", { name: "Settings" });
    await reopened.getByRole("button", { name: /^Wall thickness/ }).click();
    await expect(reopened.getByLabel("Wall thickness")).toHaveValue("9");
  });

  test("counts the floor up only once there is a floor to count, and keeps the panel for what is selected", async ({
    page,
  }) => {
    // "0.0 sq ft" in the corner of an empty plan teaches nobody anything.
    await page.goto("/");
    await expect(plan(page).getByText("sq ft")).toBeHidden();
    // Nothing selected, nothing to edit: there is no panel, and the plan has
    // the width. The apartment's own settings are behind the gear.
    await expect(details(page)).toHaveCount(0);

    await openWithLivingRoom(page);
    await expect(plan(page).getByText("sq ft")).toBeVisible();
    await expect(details(page)).toHaveCount(0);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(details(page)).toBeVisible();
    await planImage(page).press("Escape");
    await expect(details(page)).toHaveCount(0);
  });

  test("lets one room be built out of something else, and hands it back", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });

    // Folded away, saying what this room's walls are and where they came from.
    // "Wall thickness", not "Walls": the footprint above has a row of sides
    // by that name, and one panel cannot have two controls with one name.
    const walls = room.getByRole("button", { name: /^Wall thickness/ });
    await expect(walls).toHaveAttribute("aria-expanded", "false");
    await expect(walls).toContainText(`4.5"`);
    await expect(walls).toContainText("from the apartment");

    await walls.click();
    const thickness = room.getByLabel("Living room wall thickness");
    // Opened onto the inherited number, not an empty box.
    await expect(thickness).toHaveValue("4.5");

    await thickness.fill("7");
    await expect(walls).toContainText(`7"`);
    await expect(walls).not.toContainText("from the apartment");
    // Typed once, it stays this room's: the apartment's own default no longer
    // reaches it, and it survives a reload.
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await page.reload();
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(
      details(page)
        .getByRole("region", { name: "Living room", exact: true })
        .getByRole("button", { name: /^Wall thickness/ }),
    ).toContainText(`7"`);

    // And handed back, it reads the apartment's again.
    const reopened = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    await reopened.getByRole("button", { name: /^Wall thickness/ }).click();
    await reopened
      .getByRole("button", { name: "Use the apartment's wall thickness" })
      .click();
    await expect(
      reopened.getByRole("button", { name: /^Wall thickness/ }),
    ).toContainText(`4.5"`);
  });

  test("turns a wall into a railing that refuses a door, then into a divider", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    // Each side is its own switch; its name carries which it is now.
    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    await room
      .getByRole("button", { name: "Living room north wall, walled" })
      .click();
    await expect(
      room.getByRole("button", { name: "Living room north wall, open" }),
    ).toBeVisible();

    // The default window sits on the north wall, which is now a railing, and
    // its own inspector says exactly what went wrong.
    await contents(page).getByRole("button", { name: "Window 1" }).click();
    await expect(
      details(page).getByText(
        "This wall is open — there is no wall to cut it through.",
      ),
    ).toBeVisible();

    await page.reload();
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const reopened = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    await expect(
      reopened.getByRole("button", { name: "Living room north wall, open" }),
    ).toBeVisible();

    // And back to a wall.
    await reopened
      .getByRole("button", { name: "Living room north wall, open" })
      .click();
    await expect(
      reopened.getByRole("button", {
        name: "Living room north wall, walled",
      }),
    ).toBeVisible();
    await page.reload();
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(
      details(page)
        .getByRole("region", { name: "Living room", exact: true })
        .getByRole("button", { name: "Living room north wall, walled" }),
    ).toBeVisible();
  });

  test("snaps a scrubbed width to a neighbouring room's shared wall", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);

    // Put Room 2 east of the living room. Its west face is at 100", so the
    // living room shares that wall when its east face reaches 95.5".
    await details(page).getByLabel("Room 2 X position").fill("100");
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

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
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    // Drawing Room 2 pins the view that existed when the gesture began, so the
    // handle remains on the original one-room projection while Room 2 is moved.
    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const across = metres(168 + WALL_INCHES * 2);
    const down = metres(144 + WALL_INCHES * 2);
    const scale = Math.min(
      (box.width - PLAN_RESERVE - padding * 2) / across,
      (box.height - padding * 2) / down,
    );
    const eastHandle = {
      x: box.x + (box.width - PLAN_RESERVE) / 2 + metres(84) * scale,
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

    const room = details(page).getByRole("region", {
      name: "Room 2",
      exact: true,
    });
    await room.getByLabel("Room 2 X position").fill("200");

    await expect(room.getByLabel("Room 2 X position")).toHaveValue("200");
  });

  test("takes a negative position, so the apartment grows either way", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);

    const room = details(page).getByRole("region", {
      name: "Room 2",
      exact: true,
    });
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
    const centre = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };

    // The living room is the only thing on the plan, and it is in the middle.
    await page.mouse.click(centre.x, centre.y);
    await expect(
      details(page).getByRole("region", { name: "Living room", exact: true }),
    ).toBeVisible();

    // A one-rectangle room has no redundant Section 1 editing level, even when
    // the canvas receives the double-click used to drill into compound rooms.
    await page.mouse.dblclick(centre.x, centre.y);
    await expect(
      contents(page).getByRole("button", { name: "Living room", exact: true }),
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

    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    // Its north-west corner: the room is centred, so half of 168 by half of 144.
    await expect(plan(page).getByText(`x -84"`)).toBeVisible();
    await expect(plan(page).getByText(`y -72"`)).toBeVisible();
  });

  test("resizes a room by dragging its wall, landing on whole inches", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
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
    const across = metres(168) + metres(WALL_INCHES) * 2;
    const down = metres(144) + metres(WALL_INCHES) * 2;
    const scale = Math.min(
      (box.width - PLAN_RESERVE - padding * 2) / across,
      (box.height - padding * 2) / down,
    );
    const middle = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };
    const handle = {
      x: middle.x + (metres(168) / 2) * scale,
      y: middle.y,
    };

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 60, handle.y, { steps: 8 });
    // Said while the wall moves, the way a room being drawn is.
    await expect(page.getByLabel("Room being drawn")).toContainText("Width");
    await page.mouse.up();
    await expect(page.getByLabel("Room being drawn")).toHaveCount(0);

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

  test("says how big the room will be while it is being dragged out", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    await contents(page).getByRole("button", { name: "Add room" }).click();
    const from = { x: box.x + 40, y: box.y + box.height - 130 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 160, from.y + 90, { steps: 8 });

    // Mid-drag: a width and a depth in the reading unit, wider than deep.
    const readout = page.getByLabel("Room being drawn");
    await expect(readout).toBeVisible();
    const text = (await readout.textContent()) ?? "";
    const match = /^Width([\d.]+)"Length([\d.]+)"$/.exec(text);
    expect(match, text).not.toBeNull();
    const [, wi, di] = match ?? [];
    const width = Number(wi);
    const depth = Number(di);
    expect(width).toBeGreaterThan(depth);

    await page.mouse.up();
    await expect(readout).toHaveCount(0);
    // And the room that landed is the one that was read out, to the inch.
    const room = details(page).getByRole("region", {
      name: "Room 2",
      exact: true,
    });
    expect(
      Number(await room.getByLabel("Room 2 width").inputValue()),
    ).toBeCloseTo(width, 1);
    expect(
      Number(await room.getByLabel("Room 2 length").inputValue()),
    ).toBeCloseTo(depth, 1);
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
      contents(page).getByRole("button", { name: "Room 2", exact: true }),
    ).toBeVisible();
    await expect(planImage(page)).toHaveAccessibleName(/holding 2 rooms/);

    // Drawn means selected, so the numbers are there to be corrected.
    const room = details(page).getByRole("region", {
      name: "Room 2",
      exact: true,
    });
    await expect(room).toBeVisible();
    // It took its size from the drag rather than from a default: a room
    // dropped without drawing is a square, and this one is wider than deep.
    const width = Number(await room.getByLabel("Room 2 width").inputValue());
    const depth = Number(await room.getByLabel("Room 2 length").inputValue());
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

    const room = details(page).getByRole("region", {
      name: "Room 2",
      exact: true,
    });
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

    const room = details(page).getByRole("region", {
      name: "Room 2",
      exact: true,
    });
    // Ten feet square, which is what createRoom gives, rather than a drag.
    await expect(room.getByLabel("Room 2 width")).toHaveValue("120");
    await expect(room.getByLabel("Room 2 length")).toHaveValue("120");
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
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    await expect(room.getByLabel("Living room width")).toHaveValue("168");

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }

    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const across = metres(168) + metres(WALL_INCHES) * 2;
    const down = metres(144) + metres(WALL_INCHES) * 2;
    const scale = Math.min(
      (box.width - PLAN_RESERVE - padding * 2) / across,
      (box.height - padding * 2) / down,
    );
    const middle = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };
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
    const middle = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };

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
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const metres = (inches: number) => inches * 0.0254;
    const padding = 40;
    const scale = Math.min(
      (box.width - PLAN_RESERVE - padding * 2) /
        (metres(168) + metres(WALL_INCHES) * 2),
      (box.height - padding * 2) / (metres(144) + metres(WALL_INCHES) * 2),
    );
    const middle = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };
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
    // Open floor is where a drag draws the selection rectangle, so it is the
    // plain arrow; the hand only comes with Shift held, which is what pans.
    await page.mouse.move(box.x + 8, box.y + 8);
    expect(await cursor()).toBe("default");
    await page.keyboard.down("Shift");
    await page.mouse.move(box.x + 10, box.y + 10);
    expect(await cursor()).toBe("grab");
    await page.keyboard.up("Shift");
  });

  test("says a stored project could not be read, in a bar that stays out of the way", async ({
    page,
  }) => {
    await openWithUnreadableProject(page);

    // Filtered by what it says: Next puts a route announcer of its own on the
    // page with the same role, and it is empty.
    const notice = page
      .getByRole("alert")
      .filter({ hasText: /could not be opened/ });
    await expect(notice).toBeVisible();

    // A strip, not a panel. The number is generous — this guards against it
    // going back to a bordered card with a paragraph in it, rather than
    // pinning a pixel height that a font change would break.
    const bar = await notice.boundingBox();
    expect(bar?.height ?? 0).toBeLessThan(48);

    // It sits above the toolbar rather than pushing the workspace aside, and
    // the plan underneath is usable straight away.
    const toolbar = await page
      .getByRole("button", { name: "Shopping list" })
      .boundingBox();
    expect(bar?.y ?? 0).toBeLessThan(toolbar?.y ?? 0);
    await expect(plan(page)).toBeVisible();

    // And it can be closed, because there is nothing to do about it.
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(notice).toHaveCount(0);
    await expect(plan(page)).toBeVisible();
  });

  test("takes a room size typed the way a tape reads it", async ({ page }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });

    await room.getByLabel("Living room width").fill("11' 6\"");
    // Feet and inches in, inches stored, and the room read back in feet.
    await expect(room.getByText(/^138" ×/)).toBeVisible();
    await planImage(page).press("Escape");
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(room.getByLabel("Living room width")).toHaveValue("138");
  });

  test("opens on numbers somebody could have measured", async ({ page }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();

    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    // Fourteen by twelve feet, eight foot ceiling — not 165.35 by 141.73.
    await expect(room.getByLabel("Living room width")).toHaveValue("168");
    await expect(room.getByLabel("Living room length")).toHaveValue("144");
    await expect(room.getByLabel("Living room height")).toHaveValue("96");
  });
});

test.describe("a piece's own name", () => {
  test("renames one copy in the list, and the rest keep the product's name", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Lamp", width: "12", depth: "12" });
    await placeFromList(page, "Lamp");
    await placeFromList(page, "Lamp", 60);
    const row = (name: string) =>
      contents(page).getByRole("button", { name, exact: true });

    await row("Lamp 1").dblclick();
    await contents(page).getByLabel("Rename Lamp 1").fill("Bedside");
    await page.keyboard.press("Enter");

    // Named, and the other is just the lamp again: there is one unnamed.
    await expect(row("Bedside")).toBeVisible();
    await expect(row("Lamp")).toBeVisible();
    await row("Bedside").click();
    await expect(
      details(page).getByRole("heading", { name: "Bedside" }),
    ).toBeVisible();
    await expect(details(page).getByLabel("Name")).toHaveValue("Bedside");

    // The name is part of the layout, so it is still there after a reload.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(row("Bedside")).toBeVisible();

    // Blank in the inspector hands the product's name back.
    await row("Bedside").click();
    await details(page).getByLabel("Name").fill("");
    await expect(row("Lamp 1")).toBeVisible();
  });
});

test.describe("an opening's own name", () => {
  test("renames a door in the list, and the panel follows", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const row = (name: string) =>
      contents(page).getByRole("button", { name, exact: true });

    await row("Door 1").dblclick();
    await contents(page).getByLabel("Rename Door 1").fill("Front door");
    await page.keyboard.press("Enter");

    await expect(row("Front door")).toBeVisible();
    await row("Front door").click();
    await expect(
      details(page).getByRole("heading", { name: "Front door" }),
    ).toBeVisible();
    await expect(details(page).getByLabel("Name")).toHaveValue("Front door");
  });
});

test.describe("groups in the list", () => {
  test("groups a range of pieces, picks them up as one, and ungroups", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Lamp", width: "12", depth: "12" });
    await placeFromList(page, "Lamp");
    await placeFromList(page, "Lamp", 60);
    await placeFromList(page, "Lamp", 120);
    const row = (name: string) =>
      contents(page).getByRole("button", { name, exact: true });

    // Shift picks the range from the first lamp to the third.
    await row("Lamp 1").click();
    await row("Lamp 3").click({ modifiers: ["Shift"] });
    await expect(row("Lamp 2")).toHaveAttribute("aria-pressed", "true");

    await row("Lamp 2").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Group 3 pieces" }).click();

    // The group is a row of its own, and it is what is now selected.
    const group = row("Group 1");
    await expect(group).toHaveAttribute("aria-pressed", "true");
    await expect(details(page).getByText("3 pieces")).toBeVisible();

    // One piece on its own, then the group again by its row.
    await row("Lamp 1").click();
    await expect(group).toHaveAttribute("aria-pressed", "false");
    await group.click();
    await expect(row("Lamp 3")).toHaveAttribute("aria-pressed", "true");

    // Renamed in place, like a room.
    await group.dblclick();
    await contents(page).getByLabel("Rename Group 1").fill("Lamps");
    await page.keyboard.press("Enter");
    await expect(row("Lamps")).toBeVisible();

    // Folded up to its row, and opened again.
    await contents(page)
      .getByRole("button", { name: "Collapse Lamps" })
      .click();
    await expect(row("Lamp 2")).toBeHidden();
    await contents(page).getByRole("button", { name: "Expand Lamps" }).click();
    await expect(row("Lamp 2")).toBeVisible();

    // The group survives a reload: it is part of the layout.
    await page.waitForTimeout(500);
    await page.reload();
    await expect(row("Lamps")).toBeVisible();

    await row("Lamps").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Ungroup" }).click();
    await expect(row("Lamps")).toBeHidden();
    await expect(row("Lamp 2")).toBeVisible();
  });

  test("drags a piece into a group, and out of it again", async ({ page }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Lamp", width: "12", depth: "12" });
    await placeFromList(page, "Lamp");
    await placeFromList(page, "Lamp", 60);
    await placeFromList(page, "Lamp", 120);
    const row = (name: string) =>
      contents(page).getByRole("button", { name, exact: true });
    await row("Lamp 1").click();
    await row("Lamp 2").click({ modifiers: ["Shift"] });
    await row("Lamp 1").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Group 2 pieces" }).click();
    /** How many the group holds, read off the inspector when it is picked. */
    const groupHolds = async (count: string) => {
      await row("Group 1").click();
      await expect(details(page).getByText(`${count} pieces`)).toBeVisible();
    };

    // Dropped on the group's row: in, at the end.
    await row("Lamp 3").dragTo(row("Group 1"));
    await groupHolds("3");

    // Dropped among the loose pieces, it has left. Undo brings it back in,
    // as one step.
    await placeFromList(page, "Lamp", -60);
    await row("Lamp 3").dragTo(row("Lamp 4"));
    await groupHolds("2");
    await page.getByRole("button", { name: "Undo" }).click();
    await groupHolds("3");
  });

  test("lands a dragged group flush on the wall, by its outline", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Lamp", width: "12", depth: "12" });
    await placeFromList(page, "Lamp");
    await placeFromList(page, "Lamp", 60);
    const row = (name: string) =>
      contents(page).getByRole("button", { name, exact: true });
    const fromWest = async (name: string) => {
      await row(name).click();
      return Number(await details(page).getByLabel("From west").inputValue());
    };
    const gapEast = async (name: string) => {
      await row(name).click();
      return Number(
        await details(page).getByLabel("Gap to east wall").inputValue(),
      );
    };

    // Sixty pixels between the two lamps says how many pixels an inch is.
    const pixelsPerInch =
      60 / ((await fromWest("Lamp 2")) - (await fromWest("Lamp 1")));
    const shortOfWall = await gapEast("Lamp 2");

    await row("Lamp 1").click();
    await row("Lamp 2").click({ modifiers: ["Shift"] });
    await row("Lamp 1").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Group 2 pieces" }).click();

    // Drag by the first lamp until the second's east edge is one inch short
    // of the wall: the group's outline is what snaps, so it lands flush.
    const box = await planImage(page).boundingBox();
    if (box === null) {
      throw new Error("the plan has no box to point at");
    }
    const centre = {
      x: box.x + (box.width - PLAN_RESERVE) / 2,
      y: box.y + box.height / 2,
    };
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(
      centre.x + (shortOfWall - 1) * pixelsPerInch,
      centre.y,
      { steps: 10 },
    );
    await page.mouse.up();

    expect(await gapEast("Lamp 2")).toBe(0);
  });

  test("drags a group above a loose piece", async ({ page }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Lamp", width: "12", depth: "12" });
    await placeFromList(page, "Lamp");
    await placeFromList(page, "Lamp", 60);
    await placeFromList(page, "Lamp", 120);
    const row = (name: string) =>
      contents(page).getByRole("button", { name, exact: true });
    // The second and third lamps, so the group starts under the first.
    await row("Lamp 2").click();
    await row("Lamp 3").click({ modifiers: ["Shift"] });
    await row("Lamp 2").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Group 2 pieces" }).click();
    /** The rows in the order they are drawn. */
    const order = () =>
      contents(page)
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons
            .map((one) => one.textContent ?? "")
            .filter((text) => text !== ""),
        );
    const before = await order();
    expect(before.indexOf("Lamp 1")).toBeLessThan(before.indexOf("Group 1"));

    // Dropped on the first lamp's row, the whole group lands above it.
    await row("Group 1").dragTo(row("Lamp 1"));
    await expect
      .poll(async () => {
        const after = await order();
        return after.indexOf("Group 1") < after.indexOf("Lamp 1");
      })
      .toBe(true);
  });

  test("adds to the selection with the command key", async ({ page }) => {
    await openWithLivingRoom(page);
    await addProduct(page, { name: "Lamp", width: "12", depth: "12" });
    await placeFromList(page, "Lamp");
    await placeFromList(page, "Lamp", 60);
    await placeFromList(page, "Lamp", 120);
    const row = (name: string) =>
      contents(page).getByRole("button", { name, exact: true });

    await row("Lamp 1").click();
    await row("Lamp 3").click({ modifiers: ["ControlOrMeta"] });
    await expect(row("Lamp 1")).toHaveAttribute("aria-pressed", "true");
    await expect(row("Lamp 2")).toHaveAttribute("aria-pressed", "false");
    await expect(row("Lamp 3")).toHaveAttribute("aria-pressed", "true");
    await expect(details(page).getByText("2 pieces")).toBeVisible();
  });
});

test.describe("reading lengths", () => {
  test("reads a product in inches beside a room in feet and inches, and switches products together", async ({
    page,
  }) => {
    await openWithLivingRoom(page, "/", "feet-and-inches");
    await addProduct(page, { name: "Sofa", width: "84", depth: "36" });
    const place = contents(page).getByRole("button", {
      name: "Place Sofa in the room",
    });

    // What you buy reads as the shop prints it; the room as the tape does.
    await expect(place).toContainText(`84" × 36"`);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(
      details(page).getByLabel("Living room width", { exact: true }),
    ).toHaveValue(`14' 0"`);

    // The product's own toggle turns every product to feet and inches.
    await place.click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
    await details(page)
      .getByRole("button", { name: "Feet and inches" })
      .click();
    await expect(
      details(page).getByLabel("Width", { exact: true }),
    ).toHaveValue(`7' 0"`);
    await expect(place).toContainText(`7' 0" × 3' 0"`);
  });

  test("reads feet and inches in fields as on labels, steps with the arrow keys, and remembers inches", async ({
    page,
  }) => {
    await openWithLivingRoom(page, "/", "feet-and-inches");
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const width = details(page).getByLabel("Living room width", {
      exact: true,
    });

    // One format: the field reads the way the plan's labels do.
    await expect(width).toHaveValue(`14' 0"`);

    // An inch with ↑, ten with Shift.
    await width.focus();
    await page.keyboard.press("ArrowUp");
    await expect(width).toHaveValue(`14' 1"`);
    await page.keyboard.press("Shift+ArrowUp");
    await expect(width).toHaveValue(`14' 11"`);

    // Inches alone, chosen once, for every field and label after.
    await page.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("dialog", { name: "Settings" })
      .locator("label")
      .filter({ hasText: /^Inches/ })
      .click();
    await expect(page.getByRole("radio", { name: /^Inches/ })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(width).toHaveValue("179");

    // A preference of this browser's, so it is there after a reload. Read
    // as a format, not a number: the width's own save is on a timer this
    // test has no business racing.
    await page.waitForTimeout(300);
    await page.reload();
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    await expect(
      details(page).getByLabel("Living room width", { exact: true }),
    ).toHaveValue(/^\d+(\.\d+)?$/);
  });
});

test.describe("the apartment list and the panel", () => {
  test("drags a room to another place in the list, and undoes it", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await addRoom(page);
    const rooms = contents(page).getByRole("button", {
      name: /^(Living room|Room 2)$/,
    });
    await expect(rooms).toHaveText(["Living room", "Room 2"]);

    await contents(page)
      .getByRole("button", { name: "Room 2", exact: true })
      .dragTo(
        contents(page).getByRole("button", {
          name: "Living room",
          exact: true,
        }),
      );
    await expect(rooms).toHaveText(["Room 2", "Living room"]);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rooms).toHaveText(["Living room", "Room 2"]);
  });

  test("keeps the plan's readings clear of the details panel", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    const readout = plan(page).locator("p", { hasText: /^x / });
    const planBox = await plan(page).boundingBox();
    const closed = await readout.boundingBox();
    if (planBox === null || closed === null) {
      throw new Error("the plan and its readout should be on screen");
    }
    // Nothing selected: in the plan's own corner.
    expect(closed.x + closed.width).toBeGreaterThan(
      planBox.x + planBox.width - 40,
    );

    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const panel = await details(page).boundingBox();
    const open = await readout.boundingBox();
    if (panel === null || open === null) {
      throw new Error("the panel and the readout should both be on screen");
    }
    // Panel open: beside it, not under it.
    expect(open.x + open.width).toBeLessThanOrEqual(panel.x);
    expect(open.x + open.width).toBeGreaterThan(panel.x - 40);
  });
});

test.describe("whole inches", () => {
  test("rounds a room to the nearest whole inch from its menu, without resizing it", async ({
    page,
  }) => {
    await openWithLivingRoom(page);
    await contents(page)
      .getByRole("button", { name: "Living room", exact: true })
      .click();
    const room = details(page).getByRole("region", {
      name: "Living room",
      exact: true,
    });
    const x = room.getByLabel("Living room X position", { exact: true });
    const width = room.getByLabel("Living room width", { exact: true });

    await x.fill("-83.6");
    await x.press("Tab");
    await expect(x).toHaveValue("-83.6");

    await details(page)
      .getByRole("button", { name: "Living room actions" })
      .click();
    await page.getByRole("menuitem", { name: "Round to whole inches" }).click();
    await expect(x).toHaveValue("-84");
    await expect(width).toHaveValue("168");

    // One step back puts it where it was.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(x).toHaveValue("-83.6");
  });
});
