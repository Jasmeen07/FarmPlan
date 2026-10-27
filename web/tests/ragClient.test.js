import { describe, it, expect } from "vitest";
import { searchChunks, tokenize } from "../src/ragClient.js";

const mockChunks = [
  {
    id: 1,
    title: "PAU Package of Practices: Rice Water Management & AWD",
    page: 27,
    section: "Irrigation Termination",
    text: "Stop all irrigation 14 to 15 days before combine harvesting. This promotes uniform grain maturity, allows soil surface to harden for harvester machinery, and avoids lodging."
  },
  {
    id: 2,
    title: "PAU Soil & Water Salinity Advisory for Rice",
    page: 14,
    section: "Saline Soil & Brackish Water Advisory",
    text: "In saline, sodic, or kallar soils, AWD is strictly NOT recommended. Allowing the field to dry causes upward capillary movement of salts into the plant root zone, leading to seedling mortality."
  },
  {
    id: 3,
    title: "PAU Micronutrient Management in Paddy",
    page: 40,
    section: "Zinc and Iron Deficiency Management",
    text: "Zinc deficiency causes khaira disease with rusty brown pigmentation on lower leaves 2 to 3 weeks after transplanting. Broadcast 25 kg zinc sulphate heptahydrate 21 percent per acre."
  }
];

describe("ragClient search engine", () => {
  it("retrieves harvest termination advice correctly", () => {
    const res = searchChunks("When to stop watering before harvest?", mockChunks);
    expect(res).not.toBeNull();
    expect(res.answer).toContain("Stop all irrigation 14 to 15 days before combine harvesting");
    expect(res.source).toContain("p. 27");
  });

  it("retrieves salinity warning for kallar land queries", () => {
    const res = searchChunks("Can I dry my field if I have saline kallar soil?", mockChunks);
    expect(res).not.toBeNull();
    expect(res.answer).toContain("AWD is strictly NOT recommended");
  });

  it("retrieves zinc deficiency advice for rusty leaves", () => {
    const res = searchChunks("What to do for brown spots and khaira disease?", mockChunks);
    expect(res).not.toBeNull();
    expect(res.answer).toContain("zinc sulphate");
  });

  it("safely rejects unrelated queries like cryptocurrency or mangoes", () => {
    const res = searchChunks("How to invest in Bitcoin cryptocurrency?", mockChunks);
    expect(res).toBeNull();
  });
});
