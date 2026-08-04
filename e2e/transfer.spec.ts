import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

function contents(page: Page) {
  return page.getByRole("complementary", { name: "Contents" });
}

function details(page: Page) {
  return page.getByRole("complementary", { name: "Details" });
}

function transfer(page: Page) {
  return page.getByRole("region", { name: "Take it elsewhere" });
}

/**
 * Saving and opening live behind the gear on the plan now, rather than under
 * the shopping list — the overview is a page you print, not one you work in.
 */
async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
}

/** A rug in the catalogue, placed in the room, priced. */
async function furnish(page: Page) {
  await page.goto("/");
  await contents(page).getByRole("button", { name: "New product" }).click();
  await details(page).getByLabel("Name").fill("Rug, the big one");
  await details(page).getByLabel("Width").fill("96");
  await details(page).getByLabel("Depth").fill("60");
  await details(page).getByLabel("Price").fill("349.00");
  await details(page).getByRole("button", { name: "Add product" }).click();
  await contents(page)
    .getByRole("button", { name: "Place Rug, the big one in the room" })
    .click();
  await page.waitForTimeout(500);
}

test.describe("taking the data elsewhere", () => {
  test("saves the project, clears it, and opens it again unchanged", async ({
    page,
  }) => {
    await furnish(page);
    await openSettings(page);

    const saving = page.waitForEvent("download");
    await transfer(page)
      .getByRole("button", { name: "Save the project" })
      .click();
    const file = await (await saving).path();

    // Cleared the way a new machine would be: nothing in storage at all.
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("roomscale");
        request.onsuccess = resolve;
        request.onerror = resolve;
        request.onblocked = resolve;
      });
    });
    await page.goto("/overview");
    await expect(page.getByText(/Nothing is in the room yet/)).toBeVisible();

    await page.goto("/");
    await openSettings(page);
    await transfer(page).getByLabel("Project file").setInputFiles(file);

    // Back, to the piece and the price it had.
    await expect(transfer(page).getByRole("status")).toContainText(/Opened/);
    await page.goto("/overview");
    await expect(
      page.getByRole("row", { name: /Rug, the big one/ }),
    ).toBeVisible();
    await expect(page.getByText("$349.00").first()).toBeVisible();
  });

  test("saves the list as a spreadsheet a spreadsheet can add up", async ({
    page,
  }) => {
    await furnish(page);
    await openSettings(page);

    const saving = page.waitForEvent("download");
    await transfer(page)
      .getByRole("button", { name: "Save the list as a spreadsheet" })
      .click();
    const download = await saving;
    const csv = readFileSync((await download.path()) ?? "", "utf8");

    expect(download.suggestedFilename()).toBe("roomscale-checklist.csv");
    // A name with a comma keeps its own field, and money stays a number.
    expect(csv).toContain('"Rug, the big one"');
    expect(csv).toContain(",349.00,");
    expect(csv).not.toContain("$");
    expect(csv.trimEnd().split("\r\n").at(-1)).toContain("Total,");
  });

  test("refuses a file that is not a project, and leaves what is here alone", async ({
    page,
  }) => {
    await furnish(page);
    await openSettings(page);

    await transfer(page)
      .getByLabel("Project file")
      .setInputFiles({
        name: "notes.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"hello":"world"}'),
      });

    await expect(transfer(page).getByRole("alert")).toContainText(
      /not a RoomScale project/,
    );
    // What was here has been left alone: the rug is still in the room.
    await page.goto("/overview");
    await expect(
      page.getByRole("row", { name: /Rug, the big one/ }),
    ).toBeVisible();
  });
});
