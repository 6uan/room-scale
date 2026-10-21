import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "@/domain/project";
import { clearProject, saveProject } from "@/persistence";
import { resetProjectStore } from "@/state/project-store";
import { ProjectSwitcher } from "./project-switcher";

/**
 * Against `fake-indexeddb`, as the gate tests are. A write made here stands
 * in for one made in another tab: the switcher sees both the same way, as a
 * change to the table it is watching.
 */
beforeEach(async () => {
  resetProjectStore();
  await clearProject();
});

afterEach(async () => {
  await clearProject();
});

describe("ProjectSwitcher", () => {
  it("lists a project written to storage while the menu is open", async () => {
    const user = userEvent.setup();
    render(<ProjectSwitcher />);
    await user.click(screen.getByRole("button", { name: "Projects" }));
    expect(screen.getByRole("dialog", { name: "Projects" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /Elsewhere/ }),
    ).not.toBeInTheDocument();

    await saveProject(createProject("Elsewhere"), "other");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Elsewhere/ })).toBeVisible(),
    );
  });
});
