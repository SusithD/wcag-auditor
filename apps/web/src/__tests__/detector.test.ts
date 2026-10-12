import { describe, expect, it } from "vitest";
import {
  apAxisMax,
  boxAndClassLens,
  type DetectorEval,
  joinWords,
  percent,
  rareClasses,
  score,
} from "@/lib/detector";

const DETECTOR: DetectorEval = {
  images: 10,
  ground_truth_boxes: 40,
  map_50_95: 0.2393,
  map_50: 0.39,
  map_75: 0.25,
  mar_100: 0.35,
  per_class: [
    { name: "text", ap_50_95: 0.34 },
    { name: "button", ap_50_95: 0.18 },
    { name: "choice", ap_50_95: 0.16 },
  ],
  onnx_sha256: null,
  manifest_sha256: null,
  label_noise: {
    sample_size: 200,
    reviewer: "x",
    lenses: [
      {
        lens: "box_and_class",
        question: "q",
        correct: 133,
        noise_rate: 0.335,
        ci_half_width: 0.065,
      },
    ],
    sample_classes: [
      { name: "text", boxes: 97 },
      { name: "button", boxes: 2 },
      { name: "choice", boxes: 1 },
    ],
  },
};

describe("detector helpers", () => {
  it("formats scores and shares", () => {
    expect(score(0.2393)).toBe("0.239");
    expect(percent(0.335)).toBe("33.5%");
    expect(percent(0.335, 0)).toBe("34%");
  });

  it("keeps the AP axis at 0.5 unless a bar needs more", () => {
    expect(apAxisMax([0.34, 0.1])).toBe(0.5);
    expect(apAxisMax([0.5])).toBe(0.5);
    expect(apAxisMax([0.52])).toBeCloseTo(0.6);
    expect(apAxisMax([])).toBe(0.5);
  });

  it("finds the box-and-class lens", () => {
    expect(boxAndClassLens(DETECTOR.label_noise)?.correct).toBe(133);
    expect(boxAndClassLens(null)).toBeNull();
  });

  it("lists classes with too few sampled boxes, counting absent ones as zero", () => {
    expect(rareClasses(DETECTOR)).toEqual({
      names: ["button", "choice"],
      boxes: 3,
    });
    expect(rareClasses({ ...DETECTOR, label_noise: null })).toBeNull();
  });

  it("joins words for a sentence", () => {
    expect(joinWords(["a"])).toBe("a");
    expect(joinWords(["a", "b", "c"])).toBe("a, b and c");
  });
});
