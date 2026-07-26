import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureCard } from "./feature-card";

describe("FeatureCard", () => {
  it("renders its title as a heading and its description", () => {
    render(
      <ul>
        <FeatureCard
          title="Clearance zones"
          description="Mark the walkways that must stay open."
        />
      </ul>,
    );

    expect(
      screen.getByRole("heading", { name: "Clearance zones" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Mark the walkways that must stay open."),
    ).toBeInTheDocument();
  });
});
