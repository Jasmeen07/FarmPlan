import { describe, it, expect } from "vitest";
import { costs, breakEvenQuintals, validateCostInputs } from "../src/cost.js";

const sampleData = {
  seed_rate_kg_per_acre: { transplant: 5, dsr: 8 },
  seed_price_per_kg: 90,
  transplant_labour_per_acre: 4000,
  nursery_cost_per_acre: 1200,
  herbicide_cost_per_application: 800,
  herbicide_applications: { transplant: 1, dsr: 2 },
  machine_cost_per_acre: 1200,
  levelling_cost_per_acre: 1000,
  cost_per_irrigation: 450,
  irrigations: { transplant: 26, transplant_awd: 19, dsr: 18 },
  incentive_per_acre_dsr: 1500,
  paddy_price_per_quintal: 2320,
};

describe("cost.js - costs & breakEvenQuintals", () => {
  it("calculates exact costs to the rupee against manual calculation", () => {
    const res = costs(sampleData);
    expect(res.ok).toBe(true);

    // Transplant = 450 + 1200 + 4000 + 800 + 11700 = 18150
    expect(res.transplant).toBe(18150);

    // Transplant AWD = 18150 - (7 * 450) = 15000
    expect(res.transplant_awd).toBe(15000);
    expect(res.awdSavings).toBe(3150);

    // DSR = 720 + 1600 + 1200 + 1000 + 8100 - 1500 = 11120
    expect(res.dsr).toBe(11120);
    expect(res.dsrSavingsVsConv).toBe(7030);
  });

  it("calculates break-even yield reduction correctly", () => {
    // 7030 / 2320 = 3.03 quintals/acre
    const be = breakEvenQuintals(18150, 11120, 2320);
    expect(be).toBe(3.03);
  });

  it("refuses to compute and flags missing input without returning NaN", () => {
    const incompleteData = {
      ...sampleData,
      transplant_labour_per_acre: null,
    };
    const check = validateCostInputs(incompleteData);
    expect(check.valid).toBe(false);
    expect(check.missingField).toBe("transplant_labour_per_acre");

    const res = costs(incompleteData);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("transplant_labour_per_acre");
  });

  it("handles null or zero MSP gracefully in break-even", () => {
    expect(breakEvenQuintals(18150, 11120, 0)).toBeNull();
    expect(breakEvenQuintals(18150, 11120, null)).toBeNull();
  });
});
