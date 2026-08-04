import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Disclosure } from "./disclosure";

describe("a folded-away setting", () => {
  function renderOne() {
    return render(
      <Disclosure label="Wall defaults" summary="8 in shell, 4.5 in partitions">
        <p>the controls</p>
      </Disclosure>,
    );
  }

  it("reads out its value while it is shut", () => {
    renderOne();

    const button = screen.getByRole("button", { name: /^Wall defaults/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent("8 in shell, 4.5 in partitions");
    // Shut means shut: the controls are not in the document at all.
    expect(screen.queryByText("the controls")).not.toBeInTheDocument();
  });

  it("keeps its name when it opens, rather than becoming its own opposite", async () => {
    renderOne();

    await userEvent.click(
      screen.getByRole("button", { name: /^Wall defaults/ }),
    );

    const button = screen.getByRole("button", { name: /^Wall defaults/ });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("the controls")).toBeInTheDocument();
    // Still carries the value, so opening it never costs you the answer.
    expect(button).toHaveTextContent("8 in shell, 4.5 in partitions");
  });
});
