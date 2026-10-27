/**
 * web/src/main.js
 * Master Client-Side Controller for FarmPlan (5-Page English Implementation)
 * Aligned with FarmPlan_Antigravity_Design_Build_Brief.docx
 * Fully dynamic: real stage calculation, dynamic AWD rules, DSR yield slider,
 * grounded RAG Q&A, and real computer vision leaf inspection ($0 cost).
 */

import { currentStage } from "./stage.js";
import { adviceFor } from "./rules.js";
import { dsrGate } from "./dsrGate.js";
import { costs, breakEvenQuintals } from "./cost.js";
import { getStoredState, saveStoredState } from "./state.js";
import { searchChunks, detectConversationalIntent } from "./ragClient.js";
import { inspectImageLocally } from "./visionClient.js";

// Global data state
let districtsData = null;
let varietiesData = null;
let rulesData = null;
let costDefaultsData = null;
let seasonConfigData = null;
let pauChunksData = null;

// User field configuration state
const fieldState = {
  district: "033", // Ludhiana (PAU)
  sowingDate: "",  // Computed dynamically on init
  varietyId: "pr_126",
  salinity: "no",
  activeStageId: "tillering",
  activeMethod: "conventional",
  activeSpecimen: "blb",
};

// Cost calculator editable state
let activeCostParams = null;

// Speech synthesis
let currentUtterance = null;
let isSpeaking = false;

// Speech recognition
let recognition = null;
let isListening = false;

/* ======================================================== */
/* INITIALIZATION & DATA LOADING                            */
/* ======================================================== */
async function loadData() {
  try {
    const [districtsRes, varietiesRes, rulesRes, costRes, seasonRes, chunksRes] = await Promise.all([
      fetch("./data/districts.json"),
      fetch("./data/varieties.json"),
      fetch("./data/rules.json"),
      fetch("./data/cost_defaults.json"),
      fetch("./data/season_config.json"),
      fetch("./data/pau_chunks.json"),
    ]);

    districtsData = await districtsRes.json();
    varietiesData = await varietiesRes.json();
    rulesData = await rulesRes.json();
    costDefaultsData = await costRes.json();
    seasonConfigData = await seasonRes.json();
    pauChunksData = await chunksRes.json();

    activeCostParams = JSON.parse(JSON.stringify(costDefaultsData.items));
  } catch (err) {
    console.warn("Failed to load local config files:", err);
  }
}

/* ======================================================== */
/* ROUTING: Multi-Page Hash Router                          */
/* ======================================================== */
function setupRouter() {
  function handleRoute() {
    const hash = window.location.hash.replace("#", "") || "home";
    const validRoutes = ["home", "water", "dsr", "ask", "crop"];
    const targetRoute = validRoutes.includes(hash) ? hash : "home";

    // Switch active page section
    document.querySelectorAll(".view-page").forEach((page) => {
      page.classList.remove("active");
    });
    const targetPage = document.getElementById(`page-${targetRoute}`);
    if (targetPage) {
      targetPage.classList.add("active");
    }

    // Update active state in desktop header navigation
    document.querySelectorAll(".desktop-nav .nav-item").forEach((link) => {
      link.classList.toggle("active", link.dataset.route === targetRoute);
    });

    // Update active state in mobile bottom navigation
    document.querySelectorAll(".mobile-bottom-nav .mobile-nav-link").forEach((link) => {
      link.classList.toggle("active", link.dataset.route === targetRoute);
    });

    // Scroll to top of viewport on route change
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.addEventListener("hashchange", handleRoute);
  handleRoute();
}

/* ======================================================== */
/* PAGE B: WATER ADVISOR CONTROLLER                         */
/* ======================================================== */
function initWaterAdvisor() {
  // Set default sowing date to 28 days ago (Tillering Stage)
  const d = new Date();
  d.setDate(d.getDate() - 28);
  fieldState.sowingDate = d.toISOString().slice(0, 10);

  // Setup Quick Field Setup Bar
  const quickDate = document.getElementById("waterQuickSowingDate");
  const quickVariety = document.getElementById("waterQuickVariety");
  const quickSaline = document.getElementById("waterQuickSaline");
  const btnSync = document.getElementById("btnSyncCurrentDay");

  if (quickVariety && varietiesData) {
    quickVariety.innerHTML = "";
    varietiesData.varieties.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.name.en} (${v.duration_days.total_seed_to_seed} days)`;
      if (v.id === fieldState.varietyId) opt.selected = true;
      quickVariety.appendChild(opt);
    });
  }

  if (quickDate) {
    quickDate.value = fieldState.sowingDate;
    quickDate.addEventListener("change", (e) => {
      fieldState.sowingDate = e.target.value;
      recalculateAndSelectCurrentStage();
    });
  }

  if (quickVariety) {
    quickVariety.addEventListener("change", (e) => {
      fieldState.varietyId = e.target.value;
      recalculateAndSelectCurrentStage();
    });
  }

  if (quickSaline) {
    quickSaline.value = fieldState.salinity;
    quickSaline.addEventListener("change", (e) => {
      fieldState.salinity = e.target.value;
      updateAtlasDisplay(fieldState.activeStageId);
    });
  }

  if (btnSync) {
    btnSync.addEventListener("click", () => {
      recalculateAndSelectCurrentStage();
    });
  }

  // Setup Timeline Node clicks (allows browsing future or past stages)
  const timelineNodes = document.querySelectorAll(".timeline-node");
  timelineNodes.forEach((node) => {
    node.addEventListener("click", () => {
      const stageId = node.dataset.stage;
      fieldState.activeStageId = stageId;

      timelineNodes.forEach((n) => n.classList.remove("active"));
      node.classList.add("active");

      updateAtlasDisplay(stageId);
    });
  });

  // Audio button
  const audioBtn = document.getElementById("btnReadAtlasAudio");
  const audioLabel = document.getElementById("atlasAudioBtnLabel");
  if (audioBtn) {
    audioBtn.addEventListener("click", () => {
      if (!("speechSynthesis" in window)) {
        alert("Text-to-speech is not supported in this browser.");
        return;
      }
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
        audioLabel.textContent = "Listen to advice";
        return;
      }

      const text = document.getElementById("atlasRuleMain")?.textContent || "";
      currentUtterance = new SpeechSynthesisUtterance(text);
      currentUtterance.lang = "en-IN";
      currentUtterance.onstart = () => {
        isSpeaking = true;
        audioLabel.textContent = "Stop audio";
      };
      currentUtterance.onend = currentUtterance.onerror = () => {
        isSpeaking = false;
        audioLabel.textContent = "Listen to advice";
      };
      window.speechSynthesis.speak(currentUtterance);
    });
  }

  recalculateAndSelectCurrentStage();
}

function recalculateAndSelectCurrentStage() {
  const variety = varietiesData?.varieties?.find((v) => v.id === fieldState.varietyId);
  const stageRes = currentStage(variety, fieldState.sowingDate);

  if (stageRes && stageRes.stage) {
    fieldState.activeStageId = stageRes.stage;
  } else {
    fieldState.activeStageId = "tillering";
  }

  // Highlight active node in timeline
  const timelineNodes = document.querySelectorAll(".timeline-node");
  timelineNodes.forEach((n) => {
    n.classList.toggle("active", n.dataset.stage === fieldState.activeStageId);
  });

  // Sync quick bar inputs
  const quickDate = document.getElementById("waterQuickSowingDate");
  const quickVariety = document.getElementById("waterQuickVariety");
  const quickSaline = document.getElementById("waterQuickSaline");
  if (quickDate && fieldState.sowingDate) quickDate.value = fieldState.sowingDate;
  if (quickVariety && fieldState.varietyId) quickVariety.value = fieldState.varietyId;
  if (quickSaline && fieldState.salinity) quickSaline.value = fieldState.salinity;

  updateAtlasDisplay(fieldState.activeStageId);
}

function updateAtlasDisplay(stageId) {
  if (!rulesData) return;

  const stage = rulesData.stages.find((s) => s.id === stageId);
  const variety = varietiesData?.varieties?.find((v) => v.id === fieldState.varietyId);
  const stageRes = currentStage(variety, fieldState.sowingDate);

  // Compute days elapsed
  const daysVal = (stageRes && stageRes.days !== undefined) ? stageRes.days : 28;
  const stageFormatted = stageId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  
  const stageDaysRanges = {
    establishment: "0–15 days",
    tillering: "16–45 days",
    panicle_initiation: "46–59 days",
    flowering: "60–75 days",
    grain_filling: "76–92 days",
    pre_harvest: "93+ days"
  };

  document.getElementById("atlasStageTitle").textContent = stageFormatted;
  document.getElementById("atlasStageDays").textContent = `Day ${daysVal} (${stageDaysRanges[stageId] || "Active stage"})`;

  // Update Recommendation Text
  if (stage) {
    document.getElementById("atlasRuleMain").textContent = stage.text.en;
    document.getElementById("atlasSourceText").textContent = `${stage.source_ref.doc} (${stage.source_ref.section}, p. ${stage.source_ref.page || "N/A"}). Verified Kharif 2026.`;
  }

  // Update Why & Soil Explanation
  const whyEl = document.getElementById("atlasWhyText");
  if (stageId === "establishment") {
    whyEl.textContent = "Shallow ponding (3–5 cm) for the first 15 days anchors seedling root systems and smothers early emerging weed flushes.";
  } else if (stageId === "tillering") {
    whyEl.textContent = "Alternate Wetting and Drying (AWD) allows soil aeration between waterings, promoting deep root proliferation while saving 15–30% irrigation water without yield loss.";
  } else if (stageId === "panicle_initiation") {
    whyEl.textContent = "Panicle initiation is moisture-critical. Rice leaves are forming panicles inside; water stress now reduces the number of grain spikelets per panicle.";
  } else if (stageId === "flowering") {
    whyEl.textContent = "Flowering requires continuous shallow submergence (5 cm). Water stress causes flower sterility, pollen desiccation, and empty (chaffy) grains.";
  } else if (stageId === "grain_filling") {
    whyEl.textContent = "Grain filling needs moist to saturated soil for smooth starch translocation into developing kernels. Deep flooding is wasteful.";
  } else {
    whyEl.textContent = "Stopping water 14–15 days before combine harvesting ensures uniform grain ripening, hardens soil for harvester tyres, and prevents crop lodging.";
  }

  // Update Water Level Gauge
  document.querySelectorAll(".gauge-level").forEach((g) => g.classList.remove("active"));
  if (stageId === "establishment" || stageId === "flowering") {
    document.querySelector(".level-flooded")?.classList.add("active");
  } else if (stageId === "tillering") {
    document.querySelector(".level-irrigate")?.classList.add("active");
  } else if (stageId === "panicle_initiation" || stageId === "grain_filling") {
    document.querySelector(".level-moist")?.classList.add("active");
  } else {
    document.querySelector(".level-dry")?.classList.add("active");
  }

  // Update Guardrail Alerts
  const alertsContainer = document.getElementById("atlasGuardrailAlerts");
  alertsContainer.innerHTML = "";

  if (fieldState.salinity !== "no") {
    const alertDiv = document.createElement("div");
    alertDiv.className = "guardrail-alert caution";
    alertDiv.innerHTML = `
      <span>⚠️</span>
      <div>
        <strong>Saline Soil or Water Detected:</strong> Alternate Wetting and Drying (AWD) is strictly NOT recommended on saline or kallar land. Allowing soil to dry draws subsoil salts into the root zone via capillary action. Maintain continuous shallow standing water or saturated moisture to dilute salts.
      </div>
    `;
    alertsContainer.appendChild(alertDiv);
  }

  if (stageId === "flowering") {
    const alertDiv = document.createElement("div");
    alertDiv.className = "guardrail-alert critical";
    alertDiv.innerHTML = `
      <span>🚨</span>
      <div>
        <strong>CRITICAL FLOWERING STAGE:</strong> The app will NEVER advise drying during flowering. Maintain 5 cm standing water until pollination completes. Moisture stress now directly causes empty grain heads.
      </div>
    `;
    alertsContainer.appendChild(alertDiv);
  }
}

/* ======================================================== */
/* PAGE C: DSR & COSTS CONTROLLER                           */
/* ======================================================== */
function initFieldLedger() {
  // Method pill click handlers
  const methodPills = document.querySelectorAll(".method-pill");
  methodPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const method = pill.dataset.method;
      fieldState.activeMethod = method;

      methodPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");

      updateLedgerDisplay(method);
    });
  });

  // Toggle custom numbers drawer
  const toggleBtn = document.getElementById("btnToggleAdjust");
  const drawer = document.getElementById("costCustomDrawer");
  if (toggleBtn && drawer) {
    toggleBtn.addEventListener("click", () => {
      const isVisible = drawer.style.display === "block";
      drawer.style.display = isVisible ? "none" : "block";
    });
  }

  // Yield difference slider listener
  const yieldSlider = document.getElementById("dsrYieldSlider");
  if (yieldSlider) {
    yieldSlider.addEventListener("input", () => {
      updateLedgerDisplay(fieldState.activeMethod);
    });
  }

  // Farm acreage input listener
  const acreageInput = document.getElementById("dsrAcreageInput");
  if (acreageInput) {
    acreageInput.addEventListener("input", () => {
      updateLedgerDisplay(fieldState.activeMethod);
    });
  }

  // DSR Gate Inputs
  const gateInputs = ["dsrInputPrevCrop", "dsrInputLevelled", "dsrInputMachine", "dsrInputHerbicide", "dsrInputSaline"];
  gateInputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", evaluateDsrGateUI);
  });

  // Populate Custom Cost Inputs
  populateCostInputs();
  updateLedgerDisplay(fieldState.activeMethod);
  evaluateDsrGateUI();
}

function updateLedgerDisplay(method) {
  if (!activeCostParams) return;
  const res = costs(activeCostParams);
  if (!res.ok) return;

  const photoEl = document.getElementById("ledgerMethodPhoto");
  const captionEl = document.getElementById("ledgerMethodCaption");
  const totalValEl = document.getElementById("ledgerTotalVal");
  const waterUseEl = document.getElementById("ledgerWaterUse");
  const waterSaveEl = document.getElementById("ledgerWaterSavings");
  const yieldEl = document.getElementById("ledgerTypicalYield");
  const costBarsList = document.getElementById("costBarsList");

  costBarsList.innerHTML = "";

  let items = [];
  let totalCost = 0;

  if (method === "conventional") {
    photoEl.src = "./assets/dsr_seedlings.png";
    captionEl.textContent = "Manual puddling and nursery transplanting: heavy water consumption and peak migrant labour costs.";
    totalCost = res.transplant;
    waterUseEl.textContent = "High (26 irrigations)";
    waterSaveEl.textContent = "Baseline water consumption";
    yieldEl.textContent = "28–32 quintal / acre";

    items = [
      { name: "Land prep & puddling", val: 3200, max: 8000 },
      { name: "Nursery preparation", val: activeCostParams.nursery_cost_per_acre, max: 8000 },
      { name: "Transplanting labour", val: activeCostParams.transplant_labour_per_acre, max: 8000 },
      { name: "Seed (5 kg)", val: activeCostParams.seed_rate_kg_per_acre.transplant * activeCostParams.seed_price_per_kg, max: 8000 },
      { name: "Herbicide (1 spray)", val: activeCostParams.herbicide_cost_per_application, max: 8000 },
      { name: "Pumping (26 waterings)", val: activeCostParams.irrigations.transplant * activeCostParams.cost_per_irrigation, max: 12000 },
    ];
  } else if (method === "awd") {
    photoEl.src = "./assets/water_soil_section.png";
    captionEl.textContent = "Transplanted with AWD schedule: same seedling labour, but saves 7 pumping cycles.";
    totalCost = res.transplant_awd;
    waterUseEl.textContent = "Moderate (19 irrigations)";
    waterSaveEl.textContent = `Saves ₹${res.awdSavings.toLocaleString("en-IN")}/acre in pumping`;
    yieldEl.textContent = "28–32 quintal / acre";

    items = [
      { name: "Land prep & puddling", val: 3200, max: 8000 },
      { name: "Nursery preparation", val: activeCostParams.nursery_cost_per_acre, max: 8000 },
      { name: "Transplanting labour", val: activeCostParams.transplant_labour_per_acre, max: 8000 },
      { name: "Seed (5 kg)", val: activeCostParams.seed_rate_kg_per_acre.transplant * activeCostParams.seed_price_per_kg, max: 8000 },
      { name: "Herbicide (1 spray)", val: activeCostParams.herbicide_cost_per_application, max: 8000 },
      { name: "Pumping (19 waterings)", val: activeCostParams.irrigations.transplant_awd * activeCostParams.cost_per_irrigation, max: 12000 },
    ];
  } else {
    // DSR
    photoEl.src = "./assets/dsr_field_tractor.png";
    captionEl.textContent = "Direct-Seeded Rice (Tar-Wattar): laser-levelled sowing with seed drill; eliminates nursery & puddling.";
    totalCost = res.dsr;
    waterUseEl.textContent = "Low (18 irrigations)";
    waterSaveEl.textContent = `Saves ₹${res.dsrSavingsVsConv.toLocaleString("en-IN")}/acre vs conventional`;
    yieldEl.textContent = "25–30 quintal / acre";

    items = [
      { name: "Laser levelling", val: activeCostParams.levelling_cost_per_acre, max: 8000 },
      { name: "DSR drill machine rental", val: activeCostParams.machine_cost_per_acre, max: 8000 },
      { name: "Seed (8 kg)", val: activeCostParams.seed_rate_kg_per_acre.dsr * activeCostParams.seed_price_per_kg, max: 8000 },
      { name: "Herbicides (2 sprays)", val: activeCostParams.herbicide_applications.dsr * activeCostParams.herbicide_cost_per_application, max: 8000 },
      { name: "Pumping (18 waterings)", val: activeCostParams.irrigations.dsr * activeCostParams.cost_per_irrigation, max: 12000 },
      { name: "Govt DSR incentive", val: -activeCostParams.incentive_per_acre_dsr, max: 8000, isCredit: true },
    ];
  }

  totalValEl.textContent = `₹ ${totalCost.toLocaleString("en-IN")}`;

  // Render proportional bar items
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cost-bar-item";
    const widthPct = Math.min(100, Math.max(8, (Math.abs(item.val) / item.max) * 100));

    row.innerHTML = `
      <span class="cost-bar-label">${item.name}</span>
      <div class="cost-bar-track">
        <div class="cost-bar-fill" style="width: ${widthPct}%; ${item.isCredit ? 'background: #2e7d32;' : ''}"></div>
      </div>
      <span class="cost-bar-amount" style="${item.isCredit ? 'color: #2e7d32;' : ''}">
        ${item.isCredit ? '-₹' + Math.abs(item.val).toLocaleString('en-IN') : '₹' + item.val.toLocaleString('en-IN')}
      </span>
    `;
    costBarsList.appendChild(row);
  });

  // Update Break Even Card & Yield Difference Dynamics
  const beQuintals = breakEvenQuintals(res.transplant, res.dsr, activeCostParams.paddy_price_per_quintal);
  document.getElementById("ledgerBreakEvenStat").textContent = `${beQuintals} q/acre`;
  document.getElementById("ledgerBreakEvenDesc").textContent =
    `DSR saves ₹${res.dsrSavingsVsConv.toLocaleString("en-IN")}/acre in field operations. It remains more profitable than transplanting unless weed pressure or crop stress causes a yield drop exceeding ${beQuintals} quintals/acre at current MSP ₹${activeCostParams.paddy_price_per_quintal}/q.`;

  // Dynamic Yield Slider Calculation
  const yieldSlider = document.getElementById("dsrYieldSlider");
  const yieldDeltaVal = document.getElementById("yieldDeltaVal");
  const acreageInput = document.getElementById("dsrAcreageInput");
  const banner = document.getElementById("yieldNetBanner");

  if (yieldSlider && yieldDeltaVal && banner) {
    const yieldDelta = Number(yieldSlider.value);
    const acres = acreageInput ? Math.max(1, Number(acreageInput.value) || 1) : 1;
    const msp = activeCostParams.paddy_price_per_quintal || 2320;
    
    // Financial advantage = (Conventional Cost - DSR Cost) + (yieldDelta * MSP)
    const costAdvantagePerAcre = res.dsrSavingsVsConv;
    const netPerAcre = costAdvantagePerAcre + (yieldDelta * msp);
    const netTotal = Math.round(netPerAcre * acres);

    yieldDeltaVal.textContent = `${yieldDelta > 0 ? '+' : ''}${yieldDelta.toFixed(1)} q/acre`;

    banner.className = "yield-net-banner";
    if (netPerAcre > 50) {
      banner.classList.add("advantage-positive");
      banner.innerHTML = `DSR Profit Advantage: <strong>+₹${Math.round(netPerAcre).toLocaleString("en-IN")}/acre</strong> (+₹${netTotal.toLocaleString("en-IN")} total for ${acres} ${acres === 1 ? 'acre' : 'acres'})`;
    } else if (Math.abs(netPerAcre) <= 50) {
      banner.classList.add("advantage-neutral");
      banner.innerHTML = `<strong>Exact Break-Even:</strong> DSR savings equal the slight yield drop. Net financial outcome is equal to transplanting.`;
    } else {
      banner.classList.add("advantage-negative");
      banner.innerHTML = `Transplanting Advantage: Transplanting yields <strong>+₹${Math.round(Math.abs(netPerAcre)).toLocaleString("en-IN")}/acre</strong> more profit (+₹${Math.abs(netTotal).toLocaleString("en-IN")} total for ${acres} ${acres === 1 ? 'acre' : 'acres'}) due to yield drop.`;
    }
  }
}

function populateCostInputs() {
  const container = document.getElementById("customCostInputs");
  if (!container || !activeCostParams) return;
  container.innerHTML = "";

  const fields = [
    { key: "transplant_labour_per_acre", label: "Transplant Labour (₹/acre)", val: activeCostParams.transplant_labour_per_acre },
    { key: "cost_per_irrigation", label: "Irrigation Pumping Cost (₹)", val: activeCostParams.cost_per_irrigation },
    { key: "machine_cost_per_acre", label: "DSR Drill Machine (₹/acre)", val: activeCostParams.machine_cost_per_acre },
    { key: "levelling_cost_per_acre", label: "Laser Levelling (₹/acre)", val: activeCostParams.levelling_cost_per_acre },
    { key: "paddy_price_per_quintal", label: "Paddy MSP Price (₹/quintal)", val: activeCostParams.paddy_price_per_quintal },
    { key: "incentive_per_acre_dsr", label: "Punjab DSR Incentive (₹)", val: activeCostParams.incentive_per_acre_dsr },
  ];

  fields.forEach(({ key, label, val }) => {
    const group = document.createElement("div");
    group.className = "form-group-sm";
    group.innerHTML = `
      <label>${label}</label>
      <input type="number" class="form-input-sm" data-key="${key}" value="${val}" />
    `;
    container.appendChild(group);
  });

  container.querySelectorAll(".form-input-sm").forEach((input) => {
    input.addEventListener("input", (e) => {
      const key = e.target.dataset.key;
      activeCostParams[key] = Number(e.target.value) || 0;
      updateLedgerDisplay(fieldState.activeMethod);
    });
  });
}

function evaluateDsrGateUI() {
  const inputs = {
    previousCrop: document.getElementById("dsrInputPrevCrop")?.value || "wheat",
    levelled: document.getElementById("dsrInputLevelled")?.value || "yes",
    machineAccess: document.getElementById("dsrInputMachine")?.value || "yes",
    herbicideWithin24h: document.getElementById("dsrInputHerbicide")?.value || "yes",
    weedHistory: "low",
    salinity: document.getElementById("dsrInputSaline")?.value || "no",
  };

  const res = dsrGate(inputs);
  const badge = document.getElementById("gateStatusBadge");
  const list = document.getElementById("gateReasonsList");
  list.innerHTML = "";

  if (res.level === "go") {
    badge.textContent = "✅ DSR RECOMMENDED";
    badge.style.color = "#2e7d32";
    const li = document.createElement("li");
    li.textContent = "Field conditions are optimal: laser-levelled soil, access to DSR drill, and immediate herbicide application.";
    list.appendChild(li);
  } else if (res.level === "caution") {
    badge.textContent = "⚠️ DSR POSSIBLE WITH CAUTION";
    badge.style.color = "#b78103";

    if (inputs.previousCrop !== "wheat" && inputs.previousCrop !== "potato") {
      const li = document.createElement("li");
      li.textContent = "Previous non-rice crop (cotton/maize/sugarcane) carries severe risk of early iron deficiency and heavy weed seed burden.";
      list.appendChild(li);
    }
    if (inputs.levelled === "no") {
      const li = document.createElement("li");
      li.textContent = "Field is not laser levelled. Water depth will be uneven, leading to weed escapes.";
      list.appendChild(li);
    }
    if (inputs.machineAccess === "no") {
      const li = document.createElement("li");
      li.textContent = "DSR drill with press wheels is missing. Irregular sowing depth causes poor germination.";
      list.appendChild(li);
    }
    if (inputs.herbicideWithin24h === "no") {
      const li = document.createElement("li");
      li.textContent = "Cannot spray within 24 hours. Pre-emergence herbicide failure is the #1 cause of DSR abandonment.";
      list.appendChild(li);
    }
  } else {
    badge.textContent = "❌ DSR NOT RECOMMENDED";
    badge.style.color = "#c62828";
    const li = document.createElement("li");
    li.textContent = "Saline or kallar soils are strictly unsuitable for DSR. Direct-seeded seedlings cannot withstand salt accumulation.";
    list.appendChild(li);
  }
}

/* ======================================================== */
/* PAGE D: ASK ADVISOR (THE LISTENING ROOM)                 */
/* ======================================================== */
function initListeningRoom() {
  const micBtn = document.getElementById("btnMicTrigger");
  const ripple = document.getElementById("micRippleRing");
  const statusLabel = document.getElementById("micStatusLabel");
  const askForm = document.getElementById("askForm");
  const queryInput = document.getElementById("askQueryInput");

  // Setup Web Speech Recognition if available
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;

    recognition.onstart = () => {
      isListening = true;
      ripple?.classList.add("listening");
      if (statusLabel) statusLabel.textContent = "Listening...";
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (queryInput) queryInput.value = transcript;
      executeAdvisorQuery(transcript);
    };

    recognition.onerror = () => {
      isListening = false;
      ripple?.classList.remove("listening");
      if (statusLabel) statusLabel.textContent = "Tap to speak";
    };

    recognition.onend = () => {
      isListening = false;
      ripple?.classList.remove("listening");
      if (statusLabel) statusLabel.textContent = "Tap to speak";
    };
  }

  if (micBtn) {
    micBtn.addEventListener("click", () => {
      if (!recognition) {
        // Fallback demo simulation
        const sampleQuery = "When should I stop irrigation before harvest?";
        if (queryInput) queryInput.value = sampleQuery;
        executeAdvisorQuery(sampleQuery);
        return;
      }

      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
  }

  if (askForm) {
    askForm.addEventListener("submit", (e) => {
      e.preventDefault();
      executeAdvisorQuery(queryInput?.value || "");
    });
  }

  // Suggested questions
  document.querySelectorAll(".suggested-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.dataset.query;
      if (queryInput) queryInput.value = q;
      executeAdvisorQuery(q);
    });
  });

  // Audio button for answer
  const btnListen = document.getElementById("btnListenAnswer");
  if (btnListen) {
    btnListen.addEventListener("click", () => {
      const text = document.getElementById("advisorAnswerText")?.textContent || "";
      if (!text) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-IN";
      window.speechSynthesis.speak(u);
    });
  }
}

const chatHistory = [];

function escapeHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function executeAdvisorQuery(query) {
  if (!query || !query.trim()) return;

  const chatFeed = document.getElementById("advisorChatFeed");
  const queryInput = document.getElementById("askQueryInput");
  if (queryInput) queryInput.value = "";

  // 1. Append farmer's message to chat feed
  chatHistory.push({ role: "user", content: query });
  if (chatFeed) {
    const userTurn = document.createElement("div");
    userTurn.className = "chat-turn farmer-turn";
    userTurn.innerHTML = `
      <div class="turn-content">
        <p class="turn-text">${escapeHtml(query)}</p>
      </div>
      <div class="turn-avatar">🧑‍🌾</div>
    `;
    chatFeed.appendChild(userTurn);

    // Typing placeholder
    const typingTurn = document.createElement("div");
    typingTurn.id = "advisorTypingIndicator";
    typingTurn.className = "chat-turn advisor-turn";
    typingTurn.innerHTML = `
      <div class="turn-avatar">🌾</div>
      <div class="turn-content">
        <p class="turn-text" style="opacity: 0.7;"><em>Thinking & consulting official guidance...</em></p>
      </div>
    `;
    chatFeed.appendChild(typingTurn);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }

  let answerText = "";
  let sourceText = "Punjab Agricultural University Extension Advisory";

  // Check client conversational intent (handles "hi", "hello", "thanks", "who are you")
  const localConv = detectConversationalIntent(query);

  // 2. Attempt to call local FastAPI backend with conversation history
  try {
    const res = await fetch("http://127.0.0.1:8000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: query, history: chatHistory, lang: "en" }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.grounded) {
        answerText = data.answer;
        if (data.sources && data.sources.length > 0) {
          sourceText = `${data.sources[0].title} (${data.sources[0].section || 'Guidance'}, p. ${data.sources[0].page || "N/A"})`;
        }
      }
    }
  } catch (err) {
    // Backend offline; fall through to local engine
  }

  // 3. Fallback to client-side RAG or conversational engine
  if (!answerText) {
    if (localConv) {
      answerText = localConv.answer;
      sourceText = localConv.source;
    } else if (pauChunksData && pauChunksData.length > 0) {
      const match = searchChunks(query, pauChunksData);
      if (match) {
        answerText = match.answer;
        sourceText = match.source;
      }
    }
  }

  if (!answerText) {
    answerText = "I do not have a verified answer for this specific query in the current official Punjab guidance. Please contact your local Block Agriculture Officer or Krishi Vigyan Kendra (KVK) specialist for reliable local guidance.";
    sourceText = "Official Punjab Extension Protocol: Safe Referral";
  }

  chatHistory.push({ role: "assistant", content: answerText });

  // 4. Replace typing indicator with Advisor response bubble
  if (chatFeed) {
    const typingIndicator = document.getElementById("advisorTypingIndicator");
    if (typingIndicator) typingIndicator.remove();

    const advisorTurn = document.createElement("div");
    advisorTurn.className = "chat-turn advisor-turn";
    advisorTurn.innerHTML = `
      <div class="turn-avatar">🌾</div>
      <div class="turn-content">
        <div class="turn-header">
          <span class="turn-badge">FarmPlan Advisor</span>
          <button type="button" class="btn-listen-turn" title="Listen to this advice">
            🔊 <span>Listen</span>
          </button>
        </div>
        <p class="turn-text">${escapeHtml(answerText)}</p>
        <div class="turn-source"><strong>Source:</strong> ${escapeHtml(sourceText)}</div>
      </div>
    `;

    const listenBtn = advisorTurn.querySelector(".btn-listen-turn");
    if (listenBtn) {
      listenBtn.addEventListener("click", () => {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(answerText);
        u.lang = "en-IN";
        window.speechSynthesis.speak(u);
      });
    }

    chatFeed.appendChild(advisorTurn);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  }
}

/* ======================================================== */
/* PAGE E: CROP CHECK (THE FIELD JOURNAL)                   */
/* ======================================================== */
const SPECIMENS_DATA = {
  blb: {
    label: "Specimen 01: Bacterial Leaf Blight (BLB)",
    detail: "Yellowish-orange wavy margins from leaf tips downward.",
    title: "Bacterial Leaf Blight (Xanthomonas oryzae)",
    confidence: "High (88%)",
    badgeClass: "badge-high",
    symptoms: "Lesions start as water-soaked stripes on leaf edges, turning yellow to straw-coloured with undulating margins.",
    guidance: "Do not apply excess nitrogen fertilizer. Drain standing water and allow the field to aerate for 2-3 days. Avoid spraying unrecommended antibiotics.",
    source: "PAU Package of Practices for Kharif Crops (Disease Management p. 48)",
  },
  blast: {
    label: "Specimen 02: Rice Blast",
    detail: "Spindle-shaped lesions with grey center and brown borders.",
    title: "Rice Leaf Blast (Magnaporthe oryzae)",
    confidence: "High (91%)",
    badgeClass: "badge-high",
    symptoms: "Elliptical or spindle-shaped spots with grey or whitish centers and brown reddish margins on leaf blades.",
    guidance: "Avoid excessive nitrogen top-dressing. If lesions exceed economic threshold (scattered spots on upper leaves), consult officer for approved tricyclazole spray.",
    source: "PAU Package of Practices for Kharif Crops (Disease Management p. 46)",
  },
  sheath: {
    label: "Specimen 03: Sheath Blight",
    detail: "Oval greenish-grey water-soaked spots on leaf sheaths near water level.",
    title: "Sheath Blight (Rhizoctonia solani)",
    confidence: "Medium (76%)",
    badgeClass: "badge-high",
    symptoms: "Serpentine lesions near the waterline with dark reddish-brown borders. Develops under dense canopy and humid weather.",
    guidance: "Maintain wider plant spacing. Drain field periodically (AWD reduces sheath blight severity). Scout tillers before considering chemical control.",
    source: "PAU Package of Practices for Kharif Crops (Disease Management p. 47)",
  },
  zinc: {
    label: "Specimen 04: Zinc Deficiency (Khaira Disease)",
    detail: "Rusty brown spots covering lower leaves, stunted tillering.",
    title: "Zinc Deficiency (Khaira Disease)",
    confidence: "High (94%)",
    badgeClass: "badge-high",
    symptoms: "Lower leaves develop reddish-brown pigmentation or rusty blotches 2–3 weeks after transplanting; plants remain stunted.",
    guidance: "Broadcast 25 kg zinc sulphate heptahydrate (21%) per acre mixed with moist soil. Do not mix zinc sulphate with phosphatic fertilizers.",
    source: "PAU Micronutrient Management in Paddy (p. 40)",
  },
  iron: {
    label: "Specimen 05: Iron Deficiency (DSR)",
    detail: "Interveinal chlorosis: young emerging leaves turn completely pale yellow/white.",
    title: "Iron Chlorosis in Direct-Seeded Rice",
    confidence: "High (92%)",
    badgeClass: "badge-high",
    symptoms: "Young emerging leaves turn pale yellow to paper white while veins remain faint green. Common on light soils after non-rice crops.",
    guidance: "Foliar spray 1% ferrous sulphate solution (1 kg ferrous sulphate in 100 litres of water) 2 to 3 times at weekly intervals.",
    source: "PAU Direct Seeded Rice Technology Guide (p. 34)",
  },
};

function initCropCheck() {
  const thumbBtns = document.querySelectorAll(".thumb-btn");
  thumbBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const sample = btn.dataset.sample;
      fieldState.activeSpecimen = sample;

      thumbBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      updateSpecimenDisplay(sample);
    });
  });

  // File Upload Dropzone
  const dropZone = document.getElementById("cropDropZone");
  const fileInput = document.getElementById("cropFileInput");
  const browseBtn = document.getElementById("btnBrowsePhoto");

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", () => fileInput.click());
  }
  if (dropZone && fileInput) {
    dropZone.addEventListener("click", (e) => {
      if (e.target !== browseBtn) fileInput.click();
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        handlePhotoUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handlePhotoUpload(e.target.files[0]);
      }
    });
  }

  updateSpecimenDisplay("blb");
}

function updateSpecimenDisplay(key) {
  const data = SPECIMENS_DATA[key];
  if (!data) return;

  const metricsBox = document.getElementById("diagMetricsBox");
  if (metricsBox) metricsBox.style.display = "none";

  document.getElementById("specimenLabel").textContent = data.label;
  document.getElementById("specimenDetail").textContent = data.detail;
  document.getElementById("diagProblemTitle").textContent = data.title;
  
  const badge = document.getElementById("diagConfidenceBadge");
  badge.textContent = data.confidence;
  badge.className = "confidence-badge " + data.badgeClass;

  document.getElementById("diagSymptoms").textContent = data.symptoms;
  document.getElementById("diagGuidance").textContent = data.guidance;
  document.getElementById("diagSource").textContent = data.source;
}

async function handlePhotoUpload(file) {
  const imgEl = document.getElementById("specimenActiveImage");
  const labelEl = document.getElementById("specimenLabel");
  const detailEl = document.getElementById("specimenDetail");
  const titleEl = document.getElementById("diagProblemTitle");
  const badgeEl = document.getElementById("diagConfidenceBadge");
  const symptomsEl = document.getElementById("diagSymptoms");
  const guidanceEl = document.getElementById("diagGuidance");
  const sourceEl = document.getElementById("diagSource");
  const metricsBox = document.getElementById("diagMetricsBox");

  labelEl.textContent = "Uploaded Field Photo: " + file.name;
  detailEl.textContent = "Running computer vision analysis on uploaded leaf...";
  titleEl.textContent = "Inspecting leaf image...";
  badgeEl.textContent = "Analyzing...";
  badgeEl.className = "confidence-badge badge-high";
  if (metricsBox) {
    metricsBox.style.display = "block";
    metricsBox.textContent = "Calculating blur variance, HSV vegetation coverage, and lesion patterns...";
  }

  const objectUrl = URL.createObjectURL(file);
  imgEl.src = objectUrl;

  // Wait for image to render in memory
  await new Promise((resolve) => {
    if (imgEl.complete) resolve();
    else imgEl.onload = resolve;
  });

  let diagnosisResult = null;
  let engineUsed = "Browser Canvas Engine";

  // 1. Attempt server-side OpenCV computer vision analysis
  try {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("http://127.0.0.1:8000/diagnose", {
      method: "POST",
      body: formData,
    });
    if (res.ok) {
      diagnosisResult = await res.json();
      engineUsed = "FastAPI OpenCV Vision";
    }
  } catch (err) {
    // Backend offline or unreachable
  }

  // 2. Client-side canvas pixel fallback analysis if server unavailable
  if (!diagnosisResult) {
    diagnosisResult = await inspectImageLocally(imgEl);
  }

  // Render the real diagnostic result
  titleEl.textContent = diagnosisResult.title;
  
  const conf = (diagnosisResult.confidence || "medium").toLowerCase();
  badgeEl.textContent = `${conf.toUpperCase()} CONFIDENCE`;
  badgeEl.className = "confidence-badge " + (conf === "high" ? "badge-high" : conf === "low" ? "badge-low" : "badge-medium");

  const symptomsText = Array.isArray(diagnosisResult.visible_signs)
    ? diagnosisResult.visible_signs.join(" ")
    : diagnosisResult.symptoms || "Visual signs analyzed from pixel distribution.";
  symptomsEl.textContent = symptomsText;

  guidanceEl.textContent = diagnosisResult.guidance;
  sourceEl.textContent = "Source: " + (diagnosisResult.source || "PAU Rice Disease Management");

  // Display quantitative metrics
  if (metricsBox) {
    metricsBox.style.display = "block";
    const m = diagnosisResult.metrics;
    if (m) {
      const focusText = m.isBlurry ? "⚠️ Blurry (Low Edge Contrast)" : "✅ In-Focus";
      const vegPct = Math.round((m.vegetationRatio || 0) * 100);
      const yellowPct = Math.round((m.yellowRatio || 0) * 100);
      const brownPct = Math.round((m.brownRatio || 0) * 100);
      metricsBox.innerHTML = `
        <strong>${engineUsed} Metrics:</strong> Focus: <em>${focusText}</em> (Score: ${m.gradVar.toFixed(1)}) • Foliage: <em>${vegPct}%</em> • Chlorosis (Yellow): <em>${yellowPct}%</em> • Necrosis (Brown): <em>${brownPct}%</em>
      `;
    } else {
      metricsBox.innerHTML = `<strong>Engine:</strong> ${engineUsed} • Real-time spectral feature extraction complete.`;
    }
  }

  document.getElementById("diagnosticResultCard")?.scrollIntoView({ behavior: "smooth" });
}

/* ======================================================== */
/* FIELD CONFIGURATION MODAL CONTROLLER                     */
/* ======================================================== */
function initFieldModal() {
  const modal = document.getElementById("fieldSettingsModal");
  const openBtn = document.getElementById("btnOpenFieldModal");
  const openSettingsBtn = document.getElementById("btnSettingsOpen");
  const closeBtn = document.getElementById("btnCloseModal");
  const form = document.getElementById("settingsForm");

  function openModal() {
    populateModalForm();
    modal.style.display = "flex";
  }
  function closeModal() {
    modal.style.display = "none";
  }

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (openSettingsBtn) openSettingsBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      fieldState.district = document.getElementById("settingDistrict").value;
      fieldState.sowingDate = document.getElementById("settingSowingDate").value;
      fieldState.varietyId = document.getElementById("settingVariety").value;
      fieldState.salinity = document.getElementById("settingSalinity").value;

      saveStoredState({ district: fieldState.district });
      recalculateAndSelectCurrentStage();
      closeModal();
    });
  }
}

function populateModalForm() {
  const distSelect = document.getElementById("settingDistrict");
  const varSelect = document.getElementById("settingVariety");
  const dateInput = document.getElementById("settingSowingDate");
  const salSelect = document.getElementById("settingSalinity");

  if (distSelect && districtsData) {
    distSelect.innerHTML = "";
    districtsData.districts.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.lgd_code;
      opt.textContent = `${d.name.en} (${d.lgd_code})`;
      if (d.lgd_code === fieldState.district) opt.selected = true;
      distSelect.appendChild(opt);
    });
  }

  if (varSelect && varietiesData) {
    varSelect.innerHTML = "";
    varietiesData.varieties.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.name.en} (${v.duration_days.total_seed_to_seed} days)`;
      if (v.id === fieldState.varietyId) opt.selected = true;
      varSelect.appendChild(opt);
    });
  }

  if (dateInput) {
    dateInput.value = fieldState.sowingDate;
  }

  if (salSelect) {
    salSelect.value = fieldState.salinity;
  }
}

/* ======================================================== */
/* MAIN DOM CONTENT LOADED ENTRYPOINT                       */
/* ======================================================== */
window.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  setupRouter();
  initWaterAdvisor();
  initFieldLedger();
  initListeningRoom();
  initCropCheck();
  initFieldModal();
});
