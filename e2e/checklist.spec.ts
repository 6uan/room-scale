import { expect, test, type Page } from "@playwright/test";

/** A sectional and a pillow in the catalogue, then placed in the room. */
async function furnishTheRoom(page: Page) {
  await page.goto("/furniture");
  const form = page.getByRole("region", { name: /Add a product/ });

  for (const piece of [
    { name: "Sectional", width: "94.5", depth: "63", price: "1999.00" },
    { name: "Olive pillow", width: "20", depth: "20", price: "45.00" },
  ]) {
    await form.getByLabel("Name").fill(piece.name);
    await form.getByLabel("Width").fill(piece.width);
    await form.getByLabel("Depth").fill(piece.depth);
    await form.getByLabel("Price").fill(piece.price);
    await page.getByRole("button", { name: "Add product" }).click();
    await expect(
      page.getByRole("row", { name: new RegExp(piece.name) }).first(),
    ).toBeVisible();
  }

  // Two products added inside one save gap: the second is written by the
  // trailing timer, and navigating faster than a person could would lose it.
  await page.waitForTimeout(500);

  await page.goto("/plan");
  await page
    .getByRole("button", { name: "Place Sectional in the room" })
    .click();
  await page
    .getByRole("button", { name: "Place Olive pillow in the room" })
    .click();
  await page
    .getByRole("button", { name: "Place Olive pillow in the room" })
    .click();
  await page.waitForTimeout(500);
}

function totalFor(page: Page, label: string) {
  return page.getByRole("term").filter({ hasText: label }).locator("+ dd");
}

test.describe("the checklist", () => {
  test("is reachable from the room and says what there is to buy", async ({
    page,
  }) => {
    await furnishTheRoom(page);

    await page.getByRole("link", { name: "Checklist" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "The list" }),
    ).toBeVisible();
    // One sectional at $1,999.00 and two pillows at $45.00 each.
    await expect(totalFor(page, "Everything in the room")).toHaveText(
      "$2,089.00",
    );
    await expect(
      page.getByRole("row", { name: /Olive pillow/ }).getByText("$90.00"),
    ).toBeVisible();
  });

  test("changes what is still to buy when something is marked as owned", async ({
    page,
  }) => {
    await furnishTheRoom(page);
    await page.goto("/checklist");

    await expect(totalFor(page, "Still to buy")).toHaveText("$2,089.00");

    await page.getByLabel("Sectional status").selectOption("owned");

    await expect(totalFor(page, "Ordered or already owned")).toHaveText(
      "$1,999.00",
    );
    await expect(totalFor(page, "Still to buy")).toHaveText("$90.00");
    // What the room costs is a fact about the room, not about the shopping.
    await expect(totalFor(page, "Everything in the room")).toHaveText(
      "$2,089.00",
    );
  });

  test("keeps a purchase status across a reload, and shows it in the catalogue", async ({
    page,
  }) => {
    await furnishTheRoom(page);
    await page.goto("/checklist");

    await page.getByLabel("Olive pillow status").selectOption("ordered");
    await page.waitForTimeout(500);
    await page.reload();

    await expect(page.getByLabel("Olive pillow status")).toHaveValue("ordered");
    await page.goto("/furniture");
    await expect(
      page.getByRole("row", { name: /Olive pillow/ }).getByText("Ordered"),
    ).toBeVisible();
  });

  test("follows the room: taking a piece out changes the bill", async ({
    page,
  }) => {
    await furnishTheRoom(page);
    await page.goto("/checklist");
    await expect(totalFor(page, "Everything in the room")).toHaveText(
      "$2,089.00",
    );

    await page.goto("/plan");
    await page
      .getByRole("button", { name: "Take Olive pillow 2 out of the room" })
      .click();
    await page.waitForTimeout(500);

    await page.goto("/checklist");
    await expect(totalFor(page, "Everything in the room")).toHaveText(
      "$2,044.00",
    );
  });

  test("prints as a list without the controls", async ({ page }) => {
    await furnishTheRoom(page);
    await page.goto("/checklist");

    await page.emulateMedia({ media: "print" });

    // The status dropdown gives way to the word it was showing, and the
    // navigation goes altogether.
    await expect(page.getByLabel("Sectional status")).toBeHidden();
    // Filtered to the visible one: the dropdown's own <option> carries the
    // same word, and it is still in the markup, just not shown.
    await expect(
      page
        .getByRole("row", { name: /Sectional/ })
        .getByText("Considering")
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Room" })).toBeHidden();
    await expect(totalFor(page, "Everything in the room")).toBeVisible();
  });
});
