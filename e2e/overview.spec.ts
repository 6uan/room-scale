import { expect, test, type Locator, type Page } from "@playwright/test";

function contents(page: Page) {
  return page.getByRole("complementary", { name: "Contents" });
}

function details(page: Page) {
  return page.getByRole("complementary", { name: "Details" });
}

function plan(page: Page) {
  return page.getByRole("main", { name: "Plan" });
}

/** The same figures whether they are read in the drawer or on the page. */
function totalFor(scope: Page | Locator, label: string) {
  return scope.getByRole("term").filter({ hasText: label }).locator("+ dd");
}

/** A sectional and two pillows, entered and placed in the workspace. */
async function furnish(page: Page) {
  await page.goto("/");

  for (const piece of [
    { name: "Sectional", width: "94.5", depth: "63", price: "1999.00" },
    { name: "Olive pillow", width: "20", depth: "20", price: "45.00" },
  ]) {
    await contents(page).getByRole("button", { name: "New product" }).click();
    await details(page).getByLabel("Name").fill(piece.name);
    await details(page).getByLabel("Width").fill(piece.width);
    await details(page).getByLabel("Depth").fill(piece.depth);
    await details(page).getByLabel("Price").fill(piece.price);
    await details(page).getByRole("button", { name: "Add product" }).click();
  }

  await contents(page)
    .getByRole("button", { name: "Place Sectional in the room" })
    .click();
  // Two of them: one product, two placements.
  const pillow = contents(page).getByRole("button", {
    name: "Place Olive pillow in the room",
  });
  await pillow.click();
  await pillow.click();
  await page.waitForTimeout(500);
}

test.describe("the overview", () => {
  test("opens over the plan and prices what is in the room", async ({
    page,
  }) => {
    await furnish(page);

    const opener = page.getByRole("button", { name: "Shopping list" });
    await opener.click();
    await expect(opener).toHaveAttribute("aria-pressed", "true");

    // The list arrives without the plan going anywhere.
    const list = page.getByRole("dialog", { name: "Shopping list" });
    await expect(plan(page)).toBeVisible();
    // One sectional at $1,999.00 and two pillows at $45.00 each.
    await expect(totalFor(list, "Everything in the room")).toHaveText(
      "$2,089.00",
    );
    await expect(
      list.getByRole("row", { name: /Olive pillow/ }).getByText("$90.00"),
    ).toBeVisible();
  });

  test("closes again, leaving the plan where it was", async ({ page }) => {
    await page.goto("/");

    const opener = page.getByRole("button", { name: "Shopping list" });
    await opener.click();
    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("dialog", { name: "Shopping list" }),
    ).toBeHidden();
    await expect(opener).toHaveAttribute("aria-pressed", "false");
  });

  test("still has a page of its own to print", async ({ page }) => {
    await furnish(page);

    await page.getByRole("button", { name: "Shopping list" }).click();
    await page
      .getByRole("dialog", { name: "Shopping list" })
      .getByRole("link", { name: "Print the list" })
      .click();

    await expect(page).toHaveURL(/\/overview$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Shopping list" }),
    ).toBeVisible();
    await expect(totalFor(page, "Everything in the room")).toHaveText(
      "$2,089.00",
    );
  });

  test("changes what is still to buy when something is marked as owned", async ({
    page,
  }) => {
    await furnish(page);
    await page.goto("/overview");

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

  test("follows the room: taking a piece out changes the bill", async ({
    page,
  }) => {
    await furnish(page);
    await page.goto("/overview");
    await expect(totalFor(page, "Everything in the room")).toHaveText(
      "$2,089.00",
    );

    await page.getByRole("link", { name: "Back to the plan" }).click();
    await contents(page)
      .getByRole("button", { name: "Olive pillow 2" })
      .click();
    await details(page)
      .getByRole("button", { name: "Take Olive pillow 2 out of the room" })
      .click();
    await page.waitForTimeout(500);

    await page.goto("/overview");
    await expect(totalFor(page, "Everything in the room")).toHaveText(
      "$2,044.00",
    );
  });

  test("prints as a list without the controls", async ({ page }) => {
    await furnish(page);
    await page.goto("/overview");

    await page.emulateMedia({ media: "print" });

    await expect(page.getByLabel("Sectional status")).toBeHidden();
    await expect(
      page
        .getByRole("row", { name: /Sectional/ })
        .getByText("Considering")
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to the plan" }),
    ).toBeHidden();
  });
});
