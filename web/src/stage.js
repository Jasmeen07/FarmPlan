/**
 * web/src/stage.js
 * Computes paddy crop stage from sowing date and variety duration boundaries.
 * Pure function: deterministic, no side effects, easily testable.
 */

export function currentStage(
  variety,
  sowingDateISO,
  todayISO = new Date().toISOString().slice(0, 10)
) {
  if (!sowingDateISO) {
    return { stage: null, approximate: true, days: 0, error: "missing_date" };
  }

  const sowingDate = new Date(sowingDateISO);
  const today = new Date(todayISO);
  const days = Math.floor((today - sowingDate) / 86400000);

  if (days < 0) {
    return { stage: null, approximate: false, days, error: "future_date" };
  }

  const b = variety?.stage_boundaries_days;
  if (!b || Object.values(b).some((v) => v === null || v === undefined)) {
    return { stage: null, approximate: true, days };
  }

  let stage;
  if (days <= b.establishment_end) {
    stage = "establishment";
  } else if (days <= b.tillering_end) {
    stage = "tillering";
  } else if (days < b.flowering_start) {
    stage = "panicle_initiation";
  } else if (days <= b.flowering_end) {
    stage = "flowering";
  } else if (days < b.maturity) {
    stage = "grain_filling";
  } else {
    stage = "pre_harvest";
  }

  return { stage, approximate: false, days };
}
