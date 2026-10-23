/**
 * web/src/rules.js
 * Looks up the AWD water rule by crop stage and adds guardrail warnings.
 * Defaults to the water-safe option if information is missing.
 */

export function adviceFor(stageResult, rules, inputs = {}) {
  const warnings = [];

  // Saline check: if saline is 'yes' or 'dontKnow' (anything not 'no'), add warning
  if (inputs.saline !== "no") {
    warnings.push("saline_no_awd");
  }

  if (stageResult.approximate) {
    warnings.push("stage_approximate");
  }

  const stage = rules?.stages?.find((s) => s.id === stageResult.stage);

  if (!stage) {
    return {
      kind: "unknown_stage",
      stageId: null,
      text: {
        en: "Crop stage could not be determined precisely. Please inspect your crop: if tillering, apply AWD (drying between waterings); if flowering, never allow drying and maintain 5 cm standing water.",
        pa: "ਫ਼ਸਲ ਦਾ ਪੜਾਅ ਠੀਕ ਤਰ੍ਹਾਂ ਨਹੀਂ ਮਿਲਿਆ। ਕਿਰਪਾ ਕਰਕੇ ਖੇਤ ਵੇਖੋ: ਜੇ ਬੂਟਾ ਫੁੱਟ ਰਿਹਾ ਹੈ ਤਾਂ ਸੁਕਾ ਕੇ ਪਾਣੀ ਦਿਓ; ਜੇ ਬੂਰ ਪੈ ਰਿਹਾ ਹੈ ਤਾਂ ਖੇਤ ਨੂੰ ਕਦੇ ਨਾ ਸੁੱਕਣ ਦਿਓ ਅਤੇ ਪਾਣੀ ਖੜ੍ਹਾ ਰੱਖੋ।",
        hi: "फसल के चरण का सटीक निर्धारण नहीं हो सका। कृपया खेत देखें: यदि कल्ले फूट रहे हों तो सुखाकर पानी दें; यदि फूल आ रहे हों तो खेत को कभी न सूखने दें और पानी खड़ा रखें।"
      },
      source: { doc: "PAU Kharif Guide", page: "General", section: "Safe Default Recommendation" },
      warnings: [...new Set(warnings)],
      audioId: null,
    };
  }

  if (stage.never_dry) {
    warnings.push("flowering_never_dry");
  }

  return {
    kind: "valid_stage",
    ruleId: stage.id,
    text: stage.text,
    source: stage.source_ref,
    neverDry: stage.never_dry,
    warnings: [...new Set([...warnings, ...(stage.warning_ids || [])])],
    audioId: `rule_${stage.id}`,
  };
}
