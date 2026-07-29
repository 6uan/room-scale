import { expect, test, type Page } from "@playwright/test";

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
  test("opens on three panels and the apartment it starts with", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      contents(page).getByRole("button", { name: "Living room" }),
    ).toBeVisible();
    await expect(planImage(page)).toBeVisible();
    // Nothing selected: the panel on the right is the apartment itself.
    await expect(
      details(page).getByRole("region", { name: "Apartment" }),
    ).toBeVisible();
  });

  test("selects a room from the list and edits it on the right", async ({
    page,
  }) => {
    await page.goto("/");

    await contents(page).getByRole("button", { name: "Living room" }).click();

    const inspector = details(page).getByRole("region", {
      name: "Living room",
    });
    await expect(inspector).toBeVisible();
    await inspector.getByLabel("Living room width").fill("120");

    await expect(planImage(page)).toHaveAccessibleName(/10' 0\.0" wide/);
  });

  test("adds a room, and it appears in the list and the plan", async ({
    page,
  }) => {
    await page.goto("/");

    await contents(page).getByRole("button", { name: "Add room" }).click();

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
    await page.goto("/");
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
    await page.goto("/");
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
    await page.goto("/");
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

  test("adds a route and reports what narrows it", async ({ page }) => {
    await page.goto("/");
    await addProduct(page, { name: "Sectional", width: "94.5", depth: "63" });
    await contents(page)
      .getByRole("button", { name: "Place Sectional in the room" })
      .click();

    await contents(page).getByRole("button", { name: "Add route" }).click();

    await expect(plan(page).getByText(/is down to/)).toBeVisible();
    await expect(
      details(page).getByRole("region", { name: "Route" }),
    ).toBeVisible();
  });

  test("keeps everything across a reload", async ({ page }) => {
    await page.goto("/");
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
    await page.goto("/");
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
    await page.goto("/");
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

test.describe("the routes it keeps", () => {
  test("sends the old pages to where their work moved", async ({ page }) => {
    for (const [from, heading] of [
      ["/plan", "RoomScale"],
      ["/furniture", "RoomScale"],
      ["/checklist", "The list"],
    ] as const) {
      await page.goto(from);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
    }
  });

  test("has a document title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/RoomScale/);
  });
});

test.describe("comparing layouts", () => {
  /** Two products in the catalogue, one of them placed. */
  async function withASofa(page: Page) {
    await page.goto("/");
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

    await page.getByRole("button", { name: "Duplicate" }).click();

    // The copy is the one being worked on, and it holds the same furniture.
    await expect(page.getByLabel("Layout name")).toHaveValue("Second try");
    await expect(planImage(page)).toHaveAccessibleName(
      /1 piece placed: Sectional/,
    );
    await expect(page.getByLabel("Layout", { exact: true })).toHaveValue(
      /layout-2/,
    );
  });

  test("changes one arrangement without touching the other", async ({
    page,
  }) => {
    await withASofa(page);
    await page.getByRole("button", { name: "Duplicate" }).click();

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
    await page.getByLabel("Layout", { exact: true }).selectOption({ index: 0 });
    await expect(planImage(page)).toHaveAccessibleName(
      /1 piece placed: Sectional/,
    );
  });

  test("names an arrangement, and the name sticks across a reload", async ({
    page,
  }) => {
    await withASofa(page);
    await page.getByRole("button", { name: "Duplicate" }).click();

    await page.getByLabel("Layout name").fill("Loveseat instead");
    await page.waitForTimeout(500);
    await page.reload();

    await expect(page.getByLabel("Layout name")).toHaveValue(
      "Loveseat instead",
    );
  });

  test("prices each arrangement, so they can be weighed against each other", async ({
    page,
  }) => {
    await withASofa(page);
    await page.getByRole("button", { name: "Duplicate" }).click();
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
    await page.goto("/");

    // One layout: there is nothing to delete.
    await expect(page.getByRole("button", { name: /^Delete/ })).toBeHidden();

    await page.getByRole("button", { name: "Duplicate" }).click();
    await page.getByRole("button", { name: "Delete Second try" }).click();

    await expect(page.getByLabel("Layout name")).toHaveValue("First try");
    await expect(page.getByRole("button", { name: /^Delete/ })).toBeHidden();
  });
});

test.describe("laying the apartment out", () => {
  test("snaps a room against its neighbour, sharing one wall", async ({
    page,
  }) => {
    await page.goto("/");
    await contents(page).getByRole("button", { name: "Add room" }).click();

    // The living room runs to 84 inches and the wall is 4.5 thick, so sharing
    // it means 88.5. Typing 87 is near enough to mean it.
    const room = details(page).getByRole("region", { name: "Room 2" });
    await room.getByLabel("Room 2 from west").fill("87");

    await expect(room.getByLabel("Room 2 from west")).toHaveValue("88.5");
  });

  test("leaves a room where it was put when nothing is near", async ({
    page,
  }) => {
    await page.goto("/");
    await contents(page).getByRole("button", { name: "Add room" }).click();

    const room = details(page).getByRole("region", { name: "Room 2" });
    await room.getByLabel("Room 2 from west").fill("200");

    await expect(room.getByLabel("Room 2 from west")).toHaveValue("200");
  });

  test("takes a negative position, so the apartment grows either way", async ({
    page,
  }) => {
    await page.goto("/");
    await contents(page).getByRole("button", { name: "Add room" }).click();

    const room = details(page).getByRole("region", { name: "Room 2" });
    await room.getByLabel("Room 2 from west").fill("-300");

    await expect(room.getByLabel("Room 2 from west")).toHaveValue("-300");
    await expect(planImage(page)).toHaveAccessibleName(/holding 2 rooms/);
  });

  test("opens on numbers somebody could have measured", async ({ page }) => {
    await page.goto("/");
    await contents(page).getByRole("button", { name: "Living room" }).click();

    const room = details(page).getByRole("region", { name: "Living room" });
    // Fourteen by twelve feet, eight foot ceiling — not 165.35 by 141.73.
    await expect(room.getByLabel("Living room width")).toHaveValue("168");
    await expect(room.getByLabel("Living room depth")).toHaveValue("144");
    await expect(room.getByLabel("Living room ceiling")).toHaveValue("96");
  });
});
