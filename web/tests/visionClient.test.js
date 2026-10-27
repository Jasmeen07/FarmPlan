import { describe, it, expect } from "vitest";
import { rgbToHsv, classifyCropDiagnosis } from "../src/visionClient.js";

describe("visionClient HSV and diagnosis classifier", () => {
  it("converts pure green RGB to HSV correctly", () => {
    const { h, s, v } = rgbToHsv(0, 255, 0);
    expect(Math.round(h)).toBe(120);
    expect(s).toBe(1);
    expect(v).toBe(1);
  });

  it("rejects blurry photos with low gradient variance", () => {
    const metrics = {
      gradVar: 8.5,
      isBlurry: true,
      vegetationRatio: 0.85,
      greenRatio: 0.80,
      yellowRatio: 0.03,
      brownRatio: 0.02
    };
    const res = classifyCropDiagnosis(metrics);
    expect(res.problem).toBe("unclear");
    expect(res.title).toContain("Blurry");
    expect(res.need_better_photo).toBe(true);
  });

  it("rejects non-crop photos with low vegetation ratio", () => {
    const metrics = {
      gradVar: 50.0,
      isBlurry: false,
      vegetationRatio: 0.08,
      greenRatio: 0.05,
      yellowRatio: 0.02,
      brownRatio: 0.01
    };
    const res = classifyCropDiagnosis(metrics);
    expect(res.problem).toBe("unclear");
    expect(res.title).toContain("No Paddy Foliage Detected");
    expect(res.need_better_photo).toBe(true);
  });

  it("identifies Bacterial Leaf Blight when yellow chlorotic tissue is high", () => {
    const metrics = {
      gradVar: 45.0,
      isBlurry: false,
      vegetationRatio: 0.75,
      greenRatio: 0.45,
      yellowRatio: 0.24,
      brownRatio: 0.06
    };
    const res = classifyCropDiagnosis(metrics);
    expect(res.problem).toBe("bacterial_leaf_blight");
    expect(res.confidence).toBe("medium");
    expect(res.guidance).toContain("stop urea top-dressing");
  });

  it("identifies Zinc Deficiency when rusty brown necrosis is combined with chlorosis", () => {
    const metrics = {
      gradVar: 40.0,
      isBlurry: false,
      vegetationRatio: 0.70,
      greenRatio: 0.45,
      yellowRatio: 0.12,
      brownRatio: 0.13
    };
    const res = classifyCropDiagnosis(metrics);
    expect(res.problem).toBe("zinc_deficiency");
    expect(res.guidance).toContain("zinc sulphate");
  });

  it("identifies Healthy Paddy leaf when green ratio is high without necrosis", () => {
    const metrics = {
      gradVar: 42.0,
      isBlurry: false,
      vegetationRatio: 0.85,
      greenRatio: 0.78,
      yellowRatio: 0.04,
      brownRatio: 0.03
    };
    const res = classifyCropDiagnosis(metrics);
    expect(res.problem).toBe("healthy");
    expect(res.guidance).toContain("Continue recommended AWD");
  });

  it("safely refuses and refers ambiguous symptoms to KVK", () => {
    const metrics = {
      gradVar: 35.0,
      isBlurry: false,
      vegetationRatio: 0.50,
      greenRatio: 0.35,
      yellowRatio: 0.09,
      brownRatio: 0.06
    };
    const res = classifyCropDiagnosis(metrics);
    expect(res.problem).toBe("unclear");
    expect(res.title).toContain("Ambiguous");
    expect(res.guidance).toContain("nearest KVK");
  });
});
