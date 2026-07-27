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
