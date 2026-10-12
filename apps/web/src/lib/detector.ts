import type { components } from "@/api/types";

export type DetectorEval = components["schemas"]["DetectorEval"];
export type LabelNoise = components["schemas"]["LabelNoise"];

export const RARE_CLASS_BOXES = 10;
export const AP_AXIS_STEP = 0.1;

export const CLASS_LABEL: Record<string, string> = {
  text: "Text",
  link: "Link",
  button: "Button",
  input: "Input",
  choice: "Choice",
  image_icon: "Image or icon",
};

export function classLabel(name: string): string {
  return CLASS_LABEL[name] ?? name;
}

export function score(value: number): string {
  return value.toFixed(3);
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function apAxisMax(values: number[]): number {
  const top = Math.max(0, ...values);
  return Math.max(0.5, Math.ceil(top / AP_AXIS_STEP - 1e-9) * AP_AXIS_STEP);
}

export function boxAndClassLens(noise: LabelNoise | null | undefined) {
  return noise?.lenses.find((l) => l.lens === "box_and_class") ?? null;
}

export function rareClasses(
  detector: DetectorEval,
): { names: string[]; boxes: number } | null {
  const noise = detector.label_noise;
  if (!noise) return null;
  const counts = new Map(noise.sample_classes.map((c) => [c.name, c.boxes]));
  const rare = detector.per_class
    .map((c) => ({ name: c.name, boxes: counts.get(c.name) ?? 0 }))
    .filter((c) => c.boxes < RARE_CLASS_BOXES);
  if (rare.length === 0) return null;
  return {
    names: rare.map((c) => c.name),
    boxes: rare.reduce((sum, c) => sum + c.boxes, 0),
  };
}

export function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
