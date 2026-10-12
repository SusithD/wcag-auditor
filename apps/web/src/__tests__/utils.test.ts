import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting tailwind classes, last wins", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});

describe("cn with theme tokens", () => {
  it("keeps a colour token when a custom font size follows it", () => {
    expect(cn("text-on-accent", "text-body/none")).toBe(
      "text-on-accent text-body/none",
    );
    expect(cn("text-ink-2", "text-ink")).toBe("text-ink");
    expect(cn("text-dense", "text-body")).toBe("text-body");
  });
});
