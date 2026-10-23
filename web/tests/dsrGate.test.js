import { describe, it, expect } from "vitest";
import { dsrGate } from "../src/dsrGate.js";

const idealInputs = {
  previousCrop: "wheat",
  levelled: "yes",
  machineAccess: "yes",
  herbicideWithin24h: "yes",
  weedHistory: "low",
  saline: "no",
};

describe("dsrGate.js - dsrGate", () => {
  it("returns 'go' with zero caution/rejection reasons for ideal fields", () => {
    const res = dsrGate(idealInputs);
    expect(res.level).toBe("go");
    expect(res.reasons.length).toBe(0);
    expect(res.awdNote).toBe("result.awdNote");
  });

  it("bumps to 'caution' when previous crop was cotton, maize or sugarcane", () => {
    const resCotton = dsrGate({ ...idealInputs, previousCrop: "cotton" });
    expect(resCotton.level).toBe("caution");
    expect(resCotton.reasons).toContain("reason.prev_crop_non_rice");

    const resMaize = dsrGate({ ...idealInputs, previousCrop: "maize" });
    expect(resMaize.level).toBe("caution");
    expect(resMaize.reasons).toContain("reason.prev_crop_non_rice");
  });

  it("bumps to 'caution' when field is not laser-levelled", () => {
    const res = dsrGate({ ...idealInputs, levelled: "no" });
    expect(res.level).toBe("caution");
    expect(res.reasons).toContain("reason.not_levelled");
  });

  it("bumps to 'caution' when DSR machine access is absent", () => {
    const res = dsrGate({ ...idealInputs, machineAccess: "no" });
    expect(res.level).toBe("caution");
    expect(res.reasons).toContain("reason.no_machine");
  });

  it("bumps to 'caution' when 24h herbicide application is not possible", () => {
    const res = dsrGate({ ...idealInputs, herbicideWithin24h: "no" });
    expect(res.level).toBe("caution");
    expect(res.reasons).toContain("reason.herbicide_timing");
  });

  it("bumps to 'caution' when there is heavy weed history", () => {
    const res = dsrGate({ ...idealInputs, weedHistory: "heavy" });
    expect(res.level).toBe("caution");
    expect(res.reasons).toContain("reason.weed_history");
  });

  it("bumps to 'no' when soil is saline or unknown", () => {
    const resYes = dsrGate({ ...idealInputs, saline: "yes" });
    expect(resYes.level).toBe("no");
    expect(resYes.reasons).toContain("reason.saline_or_unknown");

    const resUnknown = dsrGate({ ...idealInputs, saline: "dontKnow" });
    expect(resUnknown.level).toBe("no");
    expect(resUnknown.reasons).toContain("reason.saline_or_unknown");
  });

  it("combines multiple cautions and prioritizes 'no' when salinity is present", () => {
    const res = dsrGate({
      ...idealInputs,
      levelled: "no",
      previousCrop: "maize",
      saline: "yes",
    });
    expect(res.level).toBe("no");
    expect(res.reasons).toContain("reason.not_levelled");
    expect(res.reasons).toContain("reason.prev_crop_non_rice");
    expect(res.reasons).toContain("reason.saline_or_unknown");
  });
});
