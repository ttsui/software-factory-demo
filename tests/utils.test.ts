import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("combines conditional and nested class names", () => {
    expect(cn("todo", ["active", { selected: true, hidden: false }], undefined))
      .toBe("todo active selected");
  });

  it("resolves conflicting Tailwind utilities using the last value", () => {
    expect(cn("p-2 text-red-500", "p-4 text-blue-500"))
      .toBe("p-4 text-blue-500");
  });

  it("preserves distinct variants", () => {
    expect(cn("p-2 hover:p-4", "p-6")).toBe("hover:p-4 p-6");
  });

  it("handles empty inputs", () => {
    expect(cn()).toBe("");
    expect(cn(null, false, undefined, "")).toBe("");
  });
});
