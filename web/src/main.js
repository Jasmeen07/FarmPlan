/**
 * web/src/main.js
 * Master frontend controller for FarmPlan v2 (Tier 1 + Tier 2 Demo UI)
 * Runs 100% client-side with zero paid APIs.
 */

import { initI18n, setLanguage, getCurrentLanguage, t, applyI18n } from "./i18n.js";
import { getStoredState, saveStoredState } from "./state.js";
import { currentStage } from "./stage.js";
import { adviceFor } from "./rules.js";
import { dsrGate } from "./dsrGate.js";
import { costs, breakEvenQuintals } from "./cost.js";

// Global data caches
let districtsData = null;
let varietiesData = null;
let rulesData = null;
let costDefaultsData = null;
let seasonConfigData = null;

// Speech synthesis state
let currentUtterance = null;
let isSpeaking = false;

async function loadData() {
  const [districtsRes, varietiesRes, rulesRes, costRes, seasonRes] = await Promise.all([
    fetch("./data/districts.json"),
    fetch("./data/varieties.json"),
    fetch("./data/rules.json"),
    fetch("./data/cost_defaults.json"),
    fetch("./data/season_config.json"),
  ]);

  districtsData = await districtsRes.json();
  varietiesData = await varietiesRes.json();
  rulesData = await rulesRes.json();
  costDefaultsData = await costRes.json();
  seasonConfigData = await seasonRes.json();
}

function populateDistricts(selectedDistrict) {
  const select = document.getElementById("districtSelect");
  if (!select || !districtsData) return;

  const currentLang = getCurrentLanguage();
  select.innerHTML = `<option value="">${t("settings.chooseDistrict")}</option>`;

  districtsData.districts.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.lgd_code;
    opt.textContent = d.name[currentLang] || d.name.en;
    if (d.lgd_code === selectedDistrict) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function populateVarieties() {
  const select = document.getElementById("varietySelect");
  if (!select || !varietiesData) return;

  const currentLang = getCurrentLanguage();
  const currentVal = select.value;
  select.innerHTML = "";

  varietiesData.varieties.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.name[currentLang] || v.name.en;
    if (v.id === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function updateKvkContactCard(districtCode) {
  const badge = document.getElementById("kvkContactBadge");
  const chatNotice = document.getElementById("chatKvkNotice");
  if (!badge || !districtsData) return;

  const district = districtsData.districts.find((d) => d.lgd_code === districtCode);
  if (!district || !district.kvk_contact) {
    badge.innerHTML = "";
    if (chatNotice) chatNotice.innerHTML = "";
    return;
  }

  const currentLang = getCurrentLanguage();
  const districtName = district.name[currentLang] || district.name.en;
  const contact = district.kvk_contact;

  const html = `
    <strong>📍 ${districtName} Agriculture Office / KVK Contact:</strong><br/>
    ${contact.name} | Phone: <a href="tel:${contact.phone}" style="color: var(--primary); font-weight: 700;">${contact.phone || "Contact Local PAU KVK"}</a><br/>
    <small style="color: var(--text-muted);">${contact.source}</small>
  `;

  badge.innerHTML = html;
  if (chatNotice) chatNotice.innerHTML = html;
}

// Check if entered date is earlier than official transplanting window
function checkEarlySowingWarning(sowingDateISO, districtCode) {
  if (!seasonConfigData || !sowingDateISO || !districtCode) return null;

  // Find zone for this district
  const zone = seasonConfigData.transplant_zones.find((z) => z.districts.includes(districtCode));
  if (zone && zone.earliest_transplant) {
    const sowing = new Date(sowingDateISO);
    const earliest = new Date(zone.earliest_transplant);
    if (sowing < earliest) {
      const currentLang = getCurrentLanguage();
      const note = seasonConfigData.notes[currentLang] || seasonConfigData.notes.en;
      return `${t("warning.season_early_sowing")} (Official earliest: ${zone.earliest_transplant}). ${note}`;
    }
  }
  return null;
}

// Audio Player via Browser Web Speech API ($0 cost)
function setupAudioPlayer() {
  const btn = document.getElementById("btnListenAudio");
  const btnText = document.getElementById("audioBtnText");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported on this browser.");
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      btnText.textContent = t("result.listen");
      return;
    }

    const ruleText = document.getElementById("ruleTextDisplay")?.textContent || "";
    if (!ruleText) return;

    currentUtterance = new SpeechSynthesisUtterance(ruleText);
    const lang = getCurrentLanguage();
    currentUtterance.lang = lang === "pa" ? "pa-IN" : lang === "hi" ? "hi-IN" : "en-IN";

    currentUtterance.onstart = () => {
      isSpeaking = true;
      btnText.textContent = t("result.stopAudio");
    };

    currentUtterance.onend = currentUtterance.onerror = () => {
      isSpeaking = false;
      btnText.textContent = t("result.listen");
    };

    window.speechSynthesis.speak(currentUtterance);
  });
}

// Field advisor submission
function handleFieldSubmit(e) {
  e.preventDefault();

  const sowingDate = document.getElementById("sowingDate").value;
  const varietyId = document.getElementById("varietySelect").value;
  const variety = varietiesData.varieties.find((v) => v.id === varietyId);
  const districtCode = document.getElementById("districtSelect").value;

  const inputs = {
    sowingMethod: document.getElementById("sowingMethod").value,
    sowingDate,
    varietyId,
    soilType: document.getElementById("soilType").value,
    previousCrop: document.getElementById("previousCrop").value,
    levelled: document.getElementById("isLevelled").value,
    machineAccess: document.getElementById("machineAccess").value,
    herbicideWithin24h: document.getElementById("herbicideWithin24h").value,
    weedHistory: document.getElementById("weedHistory").value,
    salinity: document.getElementById("salinityStatus").value,
  };

  const currentLang = getCurrentLanguage();

  // 1. Calculate Crop Stage
  const todayISO = new Date().toISOString().slice(0, 10);
  const stageResult = currentStage(variety, sowingDate, todayISO);

  if (stageResult.error === "future_date") {
    alert("Sowing date cannot be in the future!");
    return;
  }

  // 2. Fetch Water Rule Advice
  const advice = adviceFor(stageResult, rulesData, inputs);

  // 3. Evaluate DSR Feasibility Gate
  const dsrResult = dsrGate(inputs);

  // Check official season date
  const seasonWarning = checkEarlySowingWarning(sowingDate, districtCode);

  // Display Result Card
  const resultCard = document.getElementById("resultCard");
  resultCard.style.display = "block";

  // Stage Badge
  const stageBadge = document.getElementById("stageBadge");
  const stageName = stageResult.stage ? stageResult.stage.replace(/_/g, " ").toUpperCase() : "APPROXIMATE";
  stageBadge.textContent = `${t("result.stageTitle")}: ${stageName}`;
  document.getElementById("daysCount").textContent = `(${stageResult.days} ${t("result.daysAfterSowing")})`;

  // Water Rule Text
  const ruleText = advice.text[currentLang] || advice.text.en;
  document.getElementById("ruleTextDisplay").textContent = ruleText;

  // Source citation
  const sourceRef = advice.source;
  document.getElementById("sourceRefText").textContent = `${sourceRef.doc} (${sourceRef.section}, p. ${sourceRef.page || "N/A"})`;

  // Render Warnings
  const warningsContainer = document.getElementById("warningsContainer");
  warningsContainer.innerHTML = "";

  if (seasonWarning) {
    const div = document.createElement("div");
    div.className = "alert alert-warning";
    div.innerHTML = `<span>⚠️</span><span>${seasonWarning}</span>`;
    warningsContainer.appendChild(div);
  }

  advice.warnings.forEach((warnId) => {
    const warnKey = `warning.${warnId}`;
    const div = document.createElement("div");
    div.className = warnId.includes("never_dry") ? "alert alert-danger" : "alert alert-warning";
    div.innerHTML = `<span>⚠️</span><span>${t(warnKey)}</span>`;
    warningsContainer.appendChild(div);
  });

  // Render DSR Feasibility Result
  const dsrBadge = document.getElementById("dsrBadge");
  const reasonsList = document.getElementById("dsrReasonsList");
  reasonsList.innerHTML = "";

  if (dsrResult.level === "go") {
    dsrBadge.className = "dsr-result dsr-level-go";
    dsrBadge.textContent = `✅ ${t("result.dsrGo")}`;
  } else if (dsrResult.level === "caution") {
    dsrBadge.className = "dsr-result dsr-level-caution";
    dsrBadge.textContent = `⚠️ ${t("result.dsrCaution")}`;
  } else {
    dsrBadge.className = "dsr-result dsr-level-no";
    dsrBadge.textContent = `❌ ${t("result.dsrNo")}`;
  }

  dsrResult.reasons.forEach((reasonId) => {
    const li = document.createElement("li");
    li.textContent = t(reasonId);
    reasonsList.appendChild(li);
  });

  document.getElementById("dsrAwdNote").textContent = t(dsrResult.awdNote);

  // Scroll to results
  resultCard.scrollIntoView({ behavior: "smooth" });
}

// Cost Calculator setup & live update
let editableCostDefaults = null;

function setupCostCalculator() {
  if (!costDefaultsData) return;
  editableCostDefaults = JSON.parse(JSON.stringify(costDefaultsData.items));

  document.getElementById("costLastVerified").textContent = t("cost.lastVerified", {
    date: costDefaultsData.last_verified,
  });

  const container = document.getElementById("costInputsContainer");
  container.innerHTML = "";

  const fields = [
    { key: "transplant_labour_per_acre", labelKey: "cost.fieldLabour", val: editableCostDefaults.transplant_labour_per_acre },
    { key: "cost_per_irrigation", labelKey: "cost.fieldCostPerIrrigation", val: editableCostDefaults.cost_per_irrigation },
    { key: "machine_cost_per_acre", labelKey: "cost.fieldMachine", val: editableCostDefaults.machine_cost_per_acre },
    { key: "levelling_cost_per_acre", labelKey: "cost.fieldLevelling", val: editableCostDefaults.levelling_cost_per_acre },
    { key: "paddy_price_per_quintal", labelKey: "cost.fieldPaddyPrice", val: editableCostDefaults.paddy_price_per_quintal },
    { key: "incentive_per_acre_dsr", labelKey: "cost.fieldIncentive", val: editableCostDefaults.incentive_per_acre_dsr },
  ];

  fields.forEach(({ key, labelKey, val }) => {
    const wrap = document.createElement("div");
    wrap.className = "form-group";
    wrap.innerHTML = `
      <label class="form-label" data-i18n="${labelKey}">${t(labelKey)}</label>
      <input type="number" class="form-input cost-param-input" data-param="${key}" value="${val}" />
    `;
    container.appendChild(wrap);
  });

  // Listen to input changes
  container.querySelectorAll(".cost-param-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const param = e.target.dataset.param;
      editableCostDefaults[param] = Number(e.target.value) || 0;
      recalculateCosts();
    });
  });

  recalculateCosts();
}

function recalculateCosts() {
  if (!editableCostDefaults) return;
  const res = costs(editableCostDefaults);
  if (!res.ok) return;

  document.getElementById("costConvVal").textContent = `₹${res.transplant.toLocaleString("en-IN")}`;
  document.getElementById("costAwdVal").textContent = `₹${res.transplant_awd.toLocaleString("en-IN")}`;
  document.getElementById("costDsrVal").textContent = `₹${res.dsr.toLocaleString("en-IN")}`;

  document.getElementById("awdSaveText").textContent = `Saves ₹${res.awdSavings.toLocaleString("en-IN")}/acre`;
  document.getElementById("dsrSaveText").textContent = `Saves ₹${res.dsrSavingsVsConv.toLocaleString("en-IN")}/acre`;

  const breakEven = breakEvenQuintals(
    res.transplant,
    res.dsr,
    editableCostDefaults.paddy_price_per_quintal
  );

  const banner = document.getElementById("breakEvenBanner");
  if (breakEven !== null) {
    banner.textContent = t("cost.breakEvenText", { loss: breakEven });
  }
}

// Tier 2 Knowledge base query demo (grounded search in rules.json)
function setupChat() {
  const btn = document.getElementById("btnSendChat");
  const input = document.getElementById("chatInput");
  const box = document.getElementById("chatResponseBox");
  const respText = document.getElementById("chatResponseText");
  const sourcesText = document.getElementById("chatSourcesText");

  async function handleQuery(query) {
    if (!query.trim()) return;
    box.style.display = "block";
    respText.textContent = "Searching official guidance...";
    sourcesText.textContent = "";

    const qLower = query.toLowerCase();
    const lang = getCurrentLanguage();

    // Match keywords against rules
    let match = null;
    if (qLower.includes("stop") || qLower.includes("harvest") || qLower.includes("ਕਟਾਈ") || qLower.includes("कटाई") || qLower.includes("ਬੰਦ")) {
      match = rulesData.stages.find((s) => s.id === "pre_harvest");
    } else if (qLower.includes("tillering") || qLower.includes("awd") || qLower.includes("ਸੁਕਾ") || qLower.includes("सुखा")) {
      match = rulesData.stages.find((s) => s.id === "tillering");
    } else if (qLower.includes("saline") || qLower.includes("kallar") || qLower.includes("ਕੱਲਰ") || qLower.includes("कल्लर") || qLower.includes("ਖਾਰਾ")) {
      respText.textContent = t("warning.saline_no_awd") + " " + t("reason.saline_or_unknown");
      sourcesText.textContent = "Source: PAU Kharif Package of Practices, Section: Salinity & Water Management";
      return;
    }

    if (match) {
      respText.textContent = match.text[lang] || match.text.en;
      sourcesText.textContent = `Official Source: ${match.source_ref.doc}, ${match.source_ref.section} (p. ${match.source_ref.page})`;
    } else {
      respText.textContent = "I don't have a reliable answer to this in the current guidance. Please consult your local Punjab Agriculture Officer or KVK specialist.";
      sourcesText.textContent = "Source: PAU Extension Protocol (Safe Referral)";
    }
  }

  btn.addEventListener("click", () => handleQuery(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleQuery(input.value);
  });

  document.querySelectorAll(".suggested-btn").forEach((sBtn) => {
    sBtn.addEventListener("click", () => {
      const q = sBtn.dataset.q;
      input.value = q;
      handleQuery(q);
    });
  });
}

// Tab navigation handler
function setupTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-pane").forEach((p) => (p.style.display = "none"));

      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const targetId = `tab-${tab.dataset.tab}`;
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.style.display = "block";
    });
  });
}

// App Initialization
async function init() {
  const { lang, district } = getStoredState();

  await initI18n(lang);
  await loadData();

  // Highlight active language button
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
    btn.addEventListener("click", async () => {
      const newLang = btn.dataset.lang;
      document.querySelectorAll(".lang-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      await setLanguage(newLang);
      saveStoredState({ lang: newLang, district: document.getElementById("districtSelect").value });

      populateDistricts(document.getElementById("districtSelect").value);
      populateVarieties();
      updateKvkContactCard(document.getElementById("districtSelect").value);
      setupCostCalculator();
    });
  });

  // Populate UI
  populateDistricts(district);
  populateVarieties();
  updateKvkContactCard(district);

  document.getElementById("districtSelect").addEventListener("change", (e) => {
    saveStoredState({ district: e.target.value });
    updateKvkContactCard(e.target.value);
  });

  // Default sowing date to 20 days ago for realistic demo
  const sampleDate = new Date();
  sampleDate.setDate(sampleDate.getDate() - 25);
  document.getElementById("sowingDate").value = sampleDate.toISOString().slice(0, 10);

  // Form submission
  document.getElementById("fieldForm").addEventListener("submit", handleFieldSubmit);

  // Tabs, Audio, Cost, Chat
  setupTabs();
  setupAudioPlayer();
  setupCostCalculator();
  setupChat();
}

window.addEventListener("DOMContentLoaded", init);
