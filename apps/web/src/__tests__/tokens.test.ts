import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const block = (selector: string) =>
  css.slice(css.indexOf(`${selector} {`)).split("\n}")[0];
const light = block(":root");
const dark = block(".dark");

describe("design tokens (DESIGN_SPEC §1)", () => {
  it.each([
    ["--sev-critical", "#b91c1c", "#fca5a5"],
    ["--sev-serious", "#b45309", "#fcd34d"],
    ["--sev-minor", "#1d4ed8", "#93c5fd"],
    ["--sev-review", "#52525b", "#a1a1aa"],
    ["--ring", "#2563eb", "#60a5fa"],
  ])("pins %s per theme", (name, lightValue, darkValue) => {
    expect(light).toContain(`${name}: ${lightValue}`);
    expect(dark).toContain(`${name}: ${darkValue}`);
  });
});
