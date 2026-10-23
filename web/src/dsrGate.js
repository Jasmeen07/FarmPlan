/**
 * web/src/dsrGate.js
 * Evaluates Direct Seeded Rice (DSR) feasibility based on farmer's field parameters.
 * Returns: level ('go' | 'caution' | 'no') and reasons (array of message keys).
 */

const NON_RICE_CROPS = new Set(["cotton", "maize", "sugarcane", "other_non_rice"]);

export function dsrGate(inputs = {}) {
  const reasons = [];
  let level = "go";

  const bump = (to, reasonId) => {
    reasons.push(reasonId);
    const order = { go: 0, caution: 1, no: 2 };
    if (order[to] > order[level]) {
      level = to;
    }
  };

  // 1. Previous crop check
  if (NON_RICE_CROPS.has(inputs.previousCrop)) {
    bump("caution", "reason.prev_crop_non_rice");
  }

  // 2. Levelling check
  if (inputs.levelled === "no") {
    bump("caution", "reason.not_levelled");
  }

  // 3. Drill machine access
  if (inputs.machineAccess === "no") {
    bump("caution", "reason.no_machine");
  }

  // 4. Herbicide spray feasibility within 24h of sowing
  if (inputs.herbicideWithin24h === "no") {
    bump("caution", "reason.herbicide_timing");
  }

  // 5. Weed infestation history
  if (inputs.weedHistory === "heavy") {
    bump("caution", "reason.weed_history");
  }

  // 6. Salinity check: Saline or unknown is an absolute NO for DSR
  if (inputs.saline !== "no") {
    bump("no", "reason.saline_or_unknown");
  }

  return {
    level, // "go" | "caution" | "no"
    reasons: [...new Set(reasons)],
    awdNote: "result.awdNote",
  };
}
