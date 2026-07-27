import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("explains the product", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "RoomScale" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "What it does" }),
    ).toBeVisible();
    // By role: the hero paragraph says the same thing in a sentence, and
    // Playwright's text matcher would find both.
    await expect(
      page.getByRole("heading", { name: "Find out what does not fit" }),
    ).toBeVisible();
  });

  test("shows the clearance rule in both units", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(`3' 0.0"`)).toBeVisible();
    await expect(page.getByText("91.4 cm")).toBeVisible();
  });

  test("has a document title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/RoomScale/);
  });
});
