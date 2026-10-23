import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PriceField } from "./price-field";

function Field({
  startCents,
  onCentsChange,
}: {
  startCents: number;
  onCentsChange: (cents: number) => void;
}) {
  const [cents, setCents] = useState(startCents);
  return (
    <PriceField
      label="Price"
      cents={cents}
      onCentsChange={(next) => {
        setCents(next);
        onCentsChange(next);
      }}
    />
  );
}

describe("PriceField arrow keys", () => {
  it("steps a dollar with ↑ and ↓, ten with Shift, in whole cents", () => {
    const onCentsChange = vi.fn();
    render(<Field startCents={34900} onCentsChange={onCentsChange} />);
    const field = screen.getByRole("textbox", { name: "Price" });

    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(onCentsChange).toHaveBeenLastCalledWith(35000);
    fireEvent.keyDown(field, { key: "ArrowDown", shiftKey: true });
    expect(onCentsChange).toHaveBeenLastCalledWith(34000);
  });

  it("never steps below nothing", () => {
    const onCentsChange = vi.fn();
    render(<Field startCents={500} onCentsChange={onCentsChange} />);

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Price" }), {
      key: "ArrowDown",
      shiftKey: true,
    });
    expect(onCentsChange).toHaveBeenLastCalledWith(0);
  });
});
