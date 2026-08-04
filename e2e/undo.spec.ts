import { expect, test, type Page } from "@playwright/test";
import { openWithLivingRoom } from "./fixtures/living-room";

function contents(page: Page) {
  return page.getByRole("complementary", { name: "Contents" });
}

function details(page: Page) {
  return page.getByRole("complementary", { name: "Details" });
}

/** "Add room" arms the plan; a click on it drops one. See workspace.spec. */
async function addRoom(page: Page) {
  await contents(page).getByRole("button", { name: "Add room" }).click();
  const box = await page.getByRole("img", { name: /^Plan view/ }).boundingBox();
  if (box === null) {
    throw new Error("the plan has no box to point at");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function undoButton(page: Page) {
  return page.getByRole("button", { name: "Undo" });
}

test.describe("taking it back", () => {
  test("has nothing to undo on a project nobody has touched", async ({
    page,
  }) => {
    await openWithLivingRoom(page);

    await expect(undoButton(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  test("brings a deleted room back", async ({ page }) => {
    await openWithLivingRoom(page);
    await addRoom(page);
    const room = contents(page).getByRole("button", { name: "Room 2" });
    await expect(room).toBeVisible();

    // Selected on the plan side rather than in a field, so Delete is the
    // workspace's key rather than an input's.
    await room.click();
    await page
      .getByRole("main", { name: "Plan" })
      .click({ position: { x: 5, y: 5 } });
    await contents(page).getByRole("button", { name: "Room 2" }).click();
    await page.keyboard.press("Delete");
    await expect(room).toHaveCount(0);

    await undoButton(page).click();

    await expect(room).toBeVisible();
  });

  test("takes a typed dimension back to what it was", async ({ page }) => {
    await openWithLivingRoom(page);
    await contents(page).getByRole("button", { name: "Living room" }).click();
    const width = details(page).getByLabel("Living room width");
    const before = await width.inputValue();

    await width.fill("200");
    await expect(width).toHaveValue("200");

    // From the button rather than the key: focus is in the field, and a field's
    // own undo is the browser's to handle.
    await undoButton(page).click();

    await expect(width).toHaveValue(before);
  });

  test("takes a scrubbed dimension back in one step", async ({ page }) => {
    await openWithLivingRoom(page);
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
    await page.mouse.move(box.x + box.width / 2 + 12, y, { steps: 4 });
    await page.mouse.up();

    await expect(width).toHaveValue("180");
    await undoButton(page).click();
    await expect(width).toHaveValue("168");
  });

  test("puts back what was taken back", async ({ page }) => {
    await openWithLivingRoom(page);
    await addRoom(page);
    await expect(
      contents(page).getByRole("button", { name: "Room 2" }),
    ).toBeVisible();

    await undoButton(page).click();
    await expect(
      contents(page).getByRole("button", { name: "Room 2" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Redo" }).click();

    await expect(
      contents(page).getByRole("button", { name: "Room 2" }),
    ).toBeVisible();
  });

  test("shows what the keys do, and closes again", async ({ page }) => {
    await openWithLivingRoom(page);

    await page.getByRole("button", { name: "Keys" }).click();

    const guide = page.getByRole("dialog", { name: "What the keys do" });
    await expect(guide).toBeVisible();
    await expect(guide.getByText("Takes back the last change.")).toBeVisible();

    await guide.getByRole("button", { name: "Close" }).click();

    await expect(guide).toHaveCount(0);
  });

  test("opens the guide from the keyboard", async ({ page }) => {
    await openWithLivingRoom(page);
    // The workspace is held back until storage has been read, and a key
    // pressed before it mounts lands on nothing.
    await expect(page.getByRole("button", { name: "Keys" })).toBeVisible();

    await page.keyboard.press("?");

    await expect(
      page.getByRole("dialog", { name: "What the keys do" }),
    ).toBeVisible();
  });
});
