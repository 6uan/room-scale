import { expect, test, type Page } from "@playwright/test";

function form(page: Page) {
  return page.getByRole("region", { name: /Add a product/ });
}

function catalogue(page: Page) {
  return page.getByRole("region", { name: "Catalogue" });
}

test.describe("furniture catalogue", () => {
  test("starts empty", async ({ page }) => {
    await page.goto("/furniture");

    await expect(
      page.getByRole("heading", { level: 1, name: "The furniture" }),
    ).toBeVisible();
    await expect(catalogue(page).getByText(/Nothing yet/)).toBeVisible();
  });

  test("adds a product with its price, size, and link", async ({ page }) => {
    await page.goto("/furniture");

    await form(page).getByLabel("Name").fill("L-shaped sectional");
    await form(page).getByLabel("Width").fill("112");
    await form(page).getByLabel("Depth").fill("65");
    await form(page).getByLabel("Height").fill("34");
    await form(page).getByLabel("Price").fill("1999.00");
    await form(page).getByLabel("Retailer").fill("Article");
    await form(page)
      .getByLabel("Product link")
      .fill("https://www.article.com/product/1234");
    await page.getByRole("button", { name: "Add product" }).click();

    const row = catalogue(page).getByRole("row", { name: /sectional/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("$1,999.00")).toBeVisible();
    await expect(row.getByText(`9' 4.0" × 5' 5.0" × 2' 10.0"`)).toBeVisible();
    await expect(
      row.getByRole("link", { name: /Open L-shaped sectional/ }),
    ).toHaveAttribute("href", "https://www.article.com/product/1234");
  });

  test("refuses a product with no name", async ({ page }) => {
    await page.goto("/furniture");

    await page.getByRole("button", { name: "Add product" }).click();

    await expect(
      page.getByText("Give it a name you will recognize in a list."),
    ).toBeVisible();
    await expect(catalogue(page).getByText(/Nothing yet/)).toBeVisible();
  });

  test("switches the unit dimensions are read in", async ({ page }) => {
    await page.goto("/furniture");

    await form(page).getByLabel("Name").fill("Rug");
    await form(page).getByLabel("Width").fill("96");
    await form(page).getByLabel("Depth").fill("60");
    await page.getByRole("button", { name: "Add product" }).click();

    await page.getByLabel("Centimeters").check();

    await expect(
      catalogue(page).getByRole("row", { name: /Rug/ }),
    ).toContainText("243.8 cm × 152.4 cm");
  });

  test("links to the room and back", async ({ page }) => {
    await page.goto("/furniture");

    // Exact, or "Room" also matches the "RoomScale" link beside it.
    await page.getByRole("link", { name: "Room", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "The room" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Furniture", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "The furniture" }),
    ).toBeVisible();
  });
});

test.describe("filling a product in from a pasted page", () => {
  const PASTED = [
    "Skip to main content",
    "Belffin Modular Sectional Sleeper Sofa Bed with Storage Chaise",
    "$949.99",
    "Item Dimensions 52.8 x 125.8 x 36.4 inches",
  ].join("\n");

  test("reads a pasted page into the form, then saves once confirmed", async ({
    page,
  }) => {
    await page.goto("/furniture");

    await page.getByText("Paste from a product page").click();
    await page.getByRole("textbox", { name: /select all of it/ }).fill(PASTED);
    await page.getByRole("button", { name: "Fill the form" }).click();

    await expect(form(page).getByLabel("Name")).toHaveValue(
      "Belffin Modular Sectional Sleeper Sofa Bed with Storage Chaise",
    );
    await expect(form(page).getByLabel("Price")).toHaveValue("949.99");
    await expect(
      page.getByText(/listed three sizes without saying which was which/),
    ).toBeVisible();

    // Still nothing saved until the form is submitted as normal.
    await expect(catalogue(page).getByText(/Nothing yet/)).toBeVisible();

    await page.getByRole("button", { name: "Add product" }).click();
    await expect(
      catalogue(page).getByRole("row", { name: /Belffin/ }),
    ).toBeVisible();
  });

  test("says so rather than inventing anything when it can read nothing", async ({
    page,
  }) => {
    await page.goto("/furniture");

    await page.getByText("Paste from a product page").click();
    await page.getByRole("textbox", { name: /select all of it/ }).fill("?? --");
    await page.getByRole("button", { name: "Fill the form" }).click();

    await expect(page.getByText(/Nothing could be read/)).toBeVisible();
    await expect(form(page).getByLabel("Name")).toHaveValue("");
  });
});
