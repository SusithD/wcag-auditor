import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const source = readFileSync(
  join(__dirname, "../../../../docs/design-system/tokens.css"),
  "utf8",
);
const block = (text: string, selector: string) =>
  text.slice(text.indexOf(`${selector} {`)).split("\n}")[0];
const value = (text: string, name: string) =>
  new RegExp(`${name}:\\s*([^;]+);`)
    .exec(text)?.[1]
    .trim()
    .replace(/\s+/g, " ");

const light = block(css, ":root");
const dark = block(css, ".dark");
const sourceLight = block(source, ":root");
const sourceDark = block(source, '[data-theme="dark"]');

const NAMES = [
  "canvas",
  "surface",
  "subtle",
  "track",
  "line",
  "line-control",
  "line-strong",
  "ink",
  "ink-2",
  "ink-3",
  "navy",
  "tint",
  "on-accent",
  "critical",
  "serious",
  "minor",
  "review",
  "pass",
  "critical-bg",
  "serious-bg",
  "minor-bg",
  "review-bg",
  "pass-bg",
  "shadow-float",
];

describe("design tokens match docs/design-system/tokens.css", () => {
  it.each(NAMES)("light %s", (name) => {
    expect(value(light, `--${name}`)).toBe(value(sourceLight, `--${name}`));
  });

  it.each(
    NAMES.filter((n) => value(sourceDark, `--${n}`)),
  )("dark %s", (name) => {
    expect(value(dark, `--${name}`)).toBe(value(sourceDark, `--${name}`));
  });

  it("pins the navy accent and its dark companion", () => {
    expect(value(light, "--navy")).toBe("#000055");
    expect(value(dark, "--accent")).toBe("#b4b4ec");
    expect(value(dark, "--accent-fill")).toBe("#ecedf2");
  });

  it("uses a 16 px root", () => {
    expect(css).toContain("font-size: 100%");
    expect(css).not.toMatch(/html\s*{[^}]*text-body/);
  });
});
