/**
 * web/src/cost.js
 * Calculates per-acre costs for:
 * 1. Conventional Transplanted Paddy
 * 2. Transplanted + AWD
 * 3. Direct Seeded Rice (DSR)
 * And computes break-even yield difference in quintals/acre.
 */

export function validateCostInputs(d) {
  const required = [
    ["seed_rate_kg_per_acre.transplant", d?.seed_rate_kg_per_acre?.transplant],
    ["seed_rate_kg_per_acre.dsr", d?.seed_rate_kg_per_acre?.dsr],
    ["seed_price_per_kg", d?.seed_price_per_kg],
    ["nursery_cost_per_acre", d?.nursery_cost_per_acre],
    ["transplant_labour_per_acre", d?.transplant_labour_per_acre],
    ["herbicide_cost_per_application", d?.herbicide_cost_per_application],
    ["herbicide_applications.transplant", d?.herbicide_applications?.transplant],
    ["herbicide_applications.dsr", d?.herbicide_applications?.dsr],
    ["machine_cost_per_acre", d?.machine_cost_per_acre],
    ["levelling_cost_per_acre", d?.levelling_cost_per_acre],
    ["cost_per_irrigation", d?.cost_per_irrigation],
    ["irrigations.transplant", d?.irrigations?.transplant],
    ["irrigations.transplant_awd", d?.irrigations?.transplant_awd],
    ["irrigations.dsr", d?.irrigations?.dsr],
  ];

  for (const [name, val] of required) {
    if (val === null || val === undefined || isNaN(Number(val))) {
      return { valid: false, missingField: name };
    }
  }
  return { valid: true };
}

export function costs(d) {
  const check = validateCostInputs(d);
  if (!check.valid) {
    return { error: `Missing or invalid input: ${check.missingField}`, ok: false };
  }

  // 1. Conventional Transplanted cost
  const transplant =
    Number(d.seed_rate_kg_per_acre.transplant) * Number(d.seed_price_per_kg) +
    Number(d.nursery_cost_per_acre) +
    Number(d.transplant_labour_per_acre) +
    Number(d.herbicide_applications.transplant) * Number(d.herbicide_cost_per_application) +
    Number(d.irrigations.transplant) * Number(d.cost_per_irrigation);

  // 2. Transplanted + AWD cost (saves water irrigations)
  const irrigationSavings =
    (Number(d.irrigations.transplant) - Number(d.irrigations.transplant_awd)) *
    Number(d.cost_per_irrigation);
  const transplant_awd = transplant - irrigationSavings;

  // 3. Direct Seeded Rice (DSR) cost
  const incentive = Number(d.incentive_per_acre_dsr ?? 0);
  const dsr =
    Number(d.seed_rate_kg_per_acre.dsr) * Number(d.seed_price_per_kg) +
    Number(d.herbicide_applications.dsr) * Number(d.herbicide_cost_per_application) +
    Number(d.machine_cost_per_acre) +
    Number(d.levelling_cost_per_acre) +
    Number(d.irrigations.dsr) * Number(d.cost_per_irrigation) -
    incentive;

  return {
    ok: true,
    transplant: Math.round(transplant),
    transplant_awd: Math.round(transplant_awd),
    dsr: Math.round(dsr),
    awdSavings: Math.round(transplant - transplant_awd),
    dsrSavingsVsConv: Math.round(transplant - dsr),
  };
}

export function breakEvenQuintals(costTransplant, costDsr, pricePerQuintal) {
  if (!pricePerQuintal || isNaN(Number(pricePerQuintal)) || Number(pricePerQuintal) <= 0) {
    return null;
  }
  const diff = costTransplant - costDsr;
  const breakEven = diff / Number(pricePerQuintal);
  return Number(breakEven.toFixed(2));
}
