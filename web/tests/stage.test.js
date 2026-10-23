import { describe, it, expect } from "vitest";
import { currentStage } from "../src/stage.js";

const pr126 = {
  id: "pr_126",
  stage_boundaries_days: {
    establishment_end: 15,
    tillering_end: 45,
    flowering_start: 60,
    flowering_end: 75,
    maturity: 93,
  },
};

describe("stage.js - currentStage", () => {
  it("returns establishment for day 0 to 15", () => {
    expect(currentStage(pr126, "2026-06-20", "2026-06-20").stage).toBe("establishment");
    expect(currentStage(pr126, "2026-06-20", "2026-07-05").stage).toBe("establishment"); // Day 15
  });

  it("transitions to tillering on day 16 through day 45", () => {
    expect(currentStage(pr126, "2026-06-20", "2026-07-06").stage).toBe("tillering"); // Day 16
    expect(currentStage(pr126, "2026-06-20", "2026-08-04").stage).toBe("tillering"); // Day 45
  });

  it("transitions to panicle initiation on day 46 up to flowering start (day 59)", () => {
    expect(currentStage(pr126, "2026-06-20", "2026-08-05").stage).toBe("panicle_initiation"); // Day 46
    expect(currentStage(pr126, "2026-06-20", "2026-08-18").stage).toBe("panicle_initiation"); // Day 59
  });

  it("transitions to flowering on day 60 through day 75", () => {
    expect(currentStage(pr126, "2026-06-20", "2026-08-19").stage).toBe("flowering"); // Day 60
    expect(currentStage(pr126, "2026-06-20", "2026-09-03").stage).toBe("flowering"); // Day 75
  });

  it("transitions to grain filling on day 76 up to maturity (day 92)", () => {
    expect(currentStage(pr126, "2026-06-20", "2026-09-04").stage).toBe("grain_filling"); // Day 76
    expect(currentStage(pr126, "2026-06-20", "2026-09-20").stage).toBe("grain_filling"); // Day 92
  });

  it("transitions to pre_harvest once maturity days (93) is reached", () => {
    expect(currentStage(pr126, "2026-06-20", "2026-09-21").stage).toBe("pre_harvest"); // Day 93
    expect(currentStage(pr126, "2026-06-20", "2026-10-01").stage).toBe("pre_harvest"); // Day 103
  });

  it("handles unknown or null variety boundaries without crashing", () => {
    const unknownVariety = { id: "unknown", stage_boundaries_days: null };
    const res = currentStage(unknownVariety, "2026-06-20", "2026-07-20");
    expect(res.stage).toBeNull();
    expect(res.approximate).toBe(true);
    expect(res.days).toBe(30);
  });

  it("flags future sowing date as an error", () => {
    const res = currentStage(pr126, "2026-07-01", "2026-06-20");
    expect(res.error).toBe("future_date");
    expect(res.stage).toBeNull();
  });
});
