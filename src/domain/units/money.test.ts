import { describe, expect, it } from "vitest";
import {
  centsFromDecimalString,
  formatCents,
  isCents,
  sumCents,
} from "./money";

describe("money", () => {
  it("parses decimal strings into integer cents", () => {
    expect(centsFromDecimalString("1299.99")).toBe(129999);
    expect(centsFromDecimalString("$1,299.99")).toBe(129999);
    expect(centsFromDecimalString("12.5")).toBe(1250);
    expect(centsFromDecimalString("0")).toBe(0);
    expect(centsFromDecimalString("-8.10")).toBe(-810);
  });

  it("rejects input it cannot represent exactly", () => {
    expect(centsFromDecimalString("12.345")).toBeNull();
    expect(centsFromDecimalString("")).toBeNull();
    expect(centsFromDecimalString("free")).toBeNull();
  });

  it("sums without floating-point drift", () => {
    const prices = Array.from({ length: 10 }, () => 1299);
    expect(sumCents(prices)).toBe(12990);
    expect(isCents(sumCents(prices))).toBe(true);
  });

  it("formats cents for display", () => {
    expect(formatCents(129999)).toBe("$1,299.99");
    expect(formatCents(0)).toBe("$0.00");
  });
});
