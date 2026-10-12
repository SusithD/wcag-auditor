import { describe, expect, it } from "vitest";
import {
  choiceOf,
  groupByReason,
  isTypingTarget,
  nextIndex,
  reasonSentence,
  reasonTitle,
} from "@/components/review/review-model";
import {
  DEFAULT_SETTINGS,
  parseSettings,
} from "@/components/settings/use-settings";
import { siteLabel, splitSite } from "@/components/sites/site-label";
import { deltaWords } from "@/components/sites/sites-screen";

describe("review shortcuts", () => {
  const input = (type: string) => {
    const el = document.createElement("input");
    el.type = type;
    return el;
  };

  it("blocks shortcuts only in text-like fields", () => {
    for (const type of [
      "text",
      "search",
      "email",
      "url",
      "number",
      "password",
      "tel",
    ])
      expect(isTypingTarget(input(type))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
  });

  it("lets radios, checkboxes and buttons pass", () => {
    expect(isTypingTarget(input("radio"))).toBe(false);
    expect(isTypingTarget(input("checkbox"))).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("review model", () => {
  it("turns a reason into a short title and a sentence", () => {
    const reason =
      "text size and weight unknown: large-text status cannot be read, so the threshold is not settled";
    expect(reasonTitle(reason)).toBe("Text size and weight unknown");
    expect(reasonSentence(reason)).toBe(
      "Text size and weight unknown. Large-text status cannot be read, so the threshold is not settled.",
    );
    expect(reasonTitle("icon colour estimated from pixels (O2)")).toBe(
      "Icon colour estimated from pixels",
    );
    expect(reasonTitle(null)).toBe("No reason recorded");
  });

  it("steps through a list without wrapping", () => {
    expect(nextIndex(3, 0, -1)).toBe(0);
    expect(nextIndex(3, 2, 1)).toBe(2);
    expect(nextIndex(3, -1, 1)).toBe(0);
    expect(nextIndex(0, -1, 1)).toBe(-1);
  });

  it("maps a status to a decision choice", () => {
    expect(choiceOf("confirmed")).toBe("confirmed");
    expect(choiceOf("open")).toBeNull();
    expect(choiceOf("fixed")).toBeNull();
  });

  it("groups items by reason in the order of the counts", () => {
    const item = (id: number, reason: string | null) =>
      ({ finding: { id, needs_review_reason: reason } }) as never;
    const groups = groupByReason(
      [item(1, "b: x"), item(2, "a: y"), item(3, "b: x")],
      [{ reason: "a: y" }, { reason: "b: x" }, { reason: "c: z" }],
    );
    expect(groups.map((g) => [g.title, g.items.length])).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
  });
});

describe("settings and sites helpers", () => {
  it("parses stored settings defensively", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{bad")).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettings(
        '{"density":"compact","shortcuts":false,"viewports":[],"method":"rule_only"}',
      ),
    ).toEqual({
      density: "compact",
      shortcuts: false,
      viewports: ["desktop", "mobile"],
      method: "rule_only",
    });
  });

  it("labels sites", () => {
    expect(splitSite("example.com/about")).toEqual({
      host: "example.com",
      path: "/about",
    });
    expect(siteLabel("/a/b/folder_1")).toBe("folder_1");
  });

  it("words the change since the last audit", () => {
    expect(deltaWords(null)).toMatch(/No earlier audit/);
    expect(deltaWords(0)).toBe("No change since last audit");
    expect(deltaWords(-2)).toBe("2 fewer failures since last audit");
    expect(deltaWords(1)).toBe("1 more failure since last audit");
  });
});
