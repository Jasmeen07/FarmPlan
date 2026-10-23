import { describe, it, expect } from "vitest";
import { adviceFor } from "../src/rules.js";

const mockRules = {
  stages: [
    {
      id: "tillering",
      water_rule: "awd",
      text: { en: "AWD rule" },
      never_dry: false,
      warning_ids: [],
      source_ref: { doc: "PAU", page: "25" },
    },
    {
      id: "flowering",
      water_rule: "keep_shallow_water",
      text: { en: "Flowering rule" },
      never_dry: true,
      warning_ids: ["flowering_never_dry"],
      source_ref: { doc: "PAU", page: "26" },
    },
  ],
};

describe("rules.js - adviceFor", () => {
  it("returns AWD rule for tillering with no flowering warning", () => {
    const stageResult = { stage: "tillering", approximate: false, days: 30 };
    const inputs = { saline: "no" };
    const advice = adviceFor(stageResult, mockRules, inputs);

    expect(advice.kind).toBe("valid_stage");
    expect(advice.ruleId).toBe("tillering");
    expect(advice.warnings).not.toContain("flowering_never_dry");
    expect(advice.warnings).not.toContain("saline_no_awd");
  });

  it("adds saline_no_awd warning when saline is 'yes' or 'dontKnow'", () => {
    const stageResult = { stage: "tillering", approximate: false, days: 30 };

    const adviceYes = adviceFor(stageResult, mockRules, { saline: "yes" });
    expect(adviceYes.warnings).toContain("saline_no_awd");

    const adviceDontKnow = adviceFor(stageResult, mockRules, { saline: "dontKnow" });
    expect(adviceDontKnow.warnings).toContain("saline_no_awd");
  });

  it("adds flowering_never_dry warning during flowering stage even if not saline", () => {
    const stageResult = { stage: "flowering", approximate: false, days: 65 };
    const advice = adviceFor(stageResult, mockRules, { saline: "no" });

    expect(advice.ruleId).toBe("flowering");
    expect(advice.neverDry).toBe(true);
    expect(advice.warnings).toContain("flowering_never_dry");
  });

  it("adds stage_approximate warning when stageResult.approximate is true", () => {
    const stageResult = { stage: "tillering", approximate: true, days: 28 };
    const advice = adviceFor(stageResult, mockRules, { saline: "no" });

    expect(advice.warnings).toContain("stage_approximate");
  });

  it("handles unknown stages gracefully by returning safe default advice", () => {
    const stageResult = { stage: "non_existent_stage", approximate: true, days: 120 };
    const advice = adviceFor(stageResult, mockRules, { saline: "no" });

    expect(advice.kind).toBe("unknown_stage");
    expect(advice.text.en).toBeDefined();
    expect(advice.source.doc).toBe("PAU Kharif Guide");
  });
});
