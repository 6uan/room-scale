import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ListDrawer } from "./list-drawer";

describe("the list drawer", () => {
  it("shows the list, and keeps a way to print it", () => {
    render(<ListDrawer onClose={() => {}} />);

    expect(
      screen.getByRole("dialog", { name: "Shopping list" }),
    ).toBeInTheDocument();
    // The plan is behind this rather than gone, so printing is still a page.
    expect(
      screen.getByRole("link", { name: "Print the list" }),
    ).toHaveAttribute("href", "/overview");
  });

  it("closes on the button and on Escape", async () => {
    const onClose = vi.fn();
    const { unmount } = render(<ListDrawer onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    render(<ListDrawer onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
