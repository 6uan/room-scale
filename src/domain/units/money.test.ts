import { describe, expect, it } from "vitest";
import {
  centsFromDecimalString,
  decimalStringFromCents,
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

  it("writes cents back as plain decimal text", () => {
    expect(decimalStringFromCents(129999)).toBe("1299.99");
    expect(decimalStringFromCents(1250)).toBe("12.50");
    expect(decimalStringFromCents(5)).toBe("0.05");
    expect(decimalStringFromCents(0)).toBe("0.00");
    expect(decimalStringFromCents(-810)).toBe("-8.10");
  });

  it("round-trips every price through text and back", () => {
    for (const cents of [0, 5, 99, 100, 1250, 129999, -810]) {
      expect(centsFromDecimalString(decimalStringFromCents(cents))).toBe(cents);
    }
  });
});
