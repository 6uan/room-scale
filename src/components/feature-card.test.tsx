import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureCard } from "./feature-card";

describe("FeatureCard", () => {
  it("renders its title as a heading and its description", () => {
    render(
      <ul>
        <FeatureCard
          title="Exact dimensions"
          description="Enter every measurement as a number."
        />
      </ul>,
    );

    expect(
      screen.getByRole("heading", { name: "Exact dimensions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter every measurement as a number."),
    ).toBeInTheDocument();
  });
});
