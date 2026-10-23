# FarmPlan v2: Water-Smart Paddy Advisor for Small Farmers

*A farmer-first, software-only, low-cost redesign. Replaces the original satellite + price-forecast + rotation-optimizer design.*

---

## 1. Why this redesign exists

The original FarmPlan was a technically impressive stack (Sentinel-2 imagery, price forecasting, CP-SAT rotation optimizer) that did not address what a working paddy farmer actually struggles with. This version starts from three real problems reported by a farmer:

1. **Poor-quality seed**, leading to more pesticide use.
2. **Water scarcity**, and rice needs a lot of water.
3. **Shifting monsoon**, with unseasonal rain flattening the nearly mature crop and cutting the harvest.

After reviewing each idea against what experienced farmers already know and what small and marginal farmers can afford, many features were cut. This document describes what survived and why.

### Design rules (apply to every feature)

- **No hardware.** Software only.
- **Free or near-free for the farmer.** Works on a basic smartphone and limited data.
- **No chores.** The farmer never enters data for the app's sake. Voice note or photo in, useful answer out.
- **Only add what experience can't already supply.** Farmers know their sowing windows, their varieties and their fields. The app adds new knowledge (water-saving methods, cost comparisons, official guidance), not reminders of what they know.
- **Never depend on an unreliable input for a costly decision.** Local rain forecasts are often wrong, so no irrigation skipping on a forecast.
- **Say what we don't know.** Show confidence, cite sources, defer to a human agriculture officer when unsure.

---

## 2. Scope

### In scope (the three tiers)

| Tier | Feature | Needs AI? | Risk | Build priority |
|---|---|---|---|---|
| 1 | Water-saving advisor (AWD schedule + DSR go/no-go + cost check) | No (rules) | Low | First |
| 2 | Grounded AI assistant (voice, Punjabi/Hindi, answers from official documents with sources) | Yes | Medium | Second |
| 3 | Narrow rice crop doctor (photo diagnosis for a few common problems) | Yes | High | Only if time remains |

### Explicitly dropped (and why)

| Dropped | Reason |
|---|---|
| Price forecasting, rotation optimizer | Rotation is largely fixed by water and procurement; MSP crops have little price uncertainty to forecast. |
| Spray log, savings tracker, any diary-style logging | A chore that gives nothing back; farmers already know their spending. |
| Satellite lodging/flood detection | Hardest to build and validate; insurance claims depend on official surveys. |
| Learning loop from yields | Needs data that won't exist at launch. |
| Machine-sharing marketplace | Needs a network of users; a different product. Revisit only if machine access is confirmed as the main pain. |
| Fake-herbicide/seed verification by photo | Cannot be done reliably from a photo; would give false comfort. |
| OCR of bills | Saving a photo is enough; OCR errors add cost for little gain. |
| Standalone sowing-date planner | Farmers know when to sow; it also depends on machine availability. |
| Rain-forecast-driven irrigation skipping | Local forecasts are unreliable; a wrong "skip" stresses the crop. |

### Optional add-on (only if proven locally)

A rain-aware advisory that nudges, never drives, decisions. See section 8.

---

## 3. Tier 1: Water-Saving Advisor

### Purpose
Give a paddy farmer new, practical knowledge about using less water without losing yield, and a fair cost comparison of the options, using his own numbers.

### 3.1 Inputs (asked once, a few taps or one voice reply)

- Sowing method: transplanted or direct-seeded (DSR)
- Sowing/transplanting date
- Soil type: sandy, loam, clay (plain-language options with local names)
- Previous crop in this field
- Variety (picked from a short list, or "don't know")
- Whether the field is levelled (laser-levelled, or not)
- Whether the soil or water is known to be salty or saline (yes/no/don't know)

The current crop stage is **computed from the sowing date and variety duration**, not asked every day.

### 3.2 Part A: AWD (Alternate Wetting and Drying) schedule

**What it does:** shows, for the farmer's crop stage today, what the irrigation rule is. It is a rule table, not a model.

**How it works:**
1. Compute the growth stage from sowing date and variety duration (establishment, tillering, panicle initiation, flowering, grain filling, maturity).
2. Look up the recommended water rule for that stage from a table sourced from the state agricultural university's package of practices.
3. Show one short message, for example: "Stage: tillering. Let the field dry until the water has disappeared, then irrigate again. Do not let cracks appear."

**Rules table (structure only; values must be filled from the official source before release):**

| Stage | Rule type | Source to verify |
|---|---|---|
| Establishment | Keep field moist/shallow flooded (rule from official guide) | State agricultural university package of practices (kharif) |
| Vegetative/tillering | Allow drying between irrigations (AWD) | Same |
| Panicle initiation to flowering | **Never let the field dry**; keep shallow standing water | Same |
| Grain filling | Gradual reduction | Same |
| Pre-harvest | Stop irrigation at the recommended number of days before harvest | Same |

**Guardrails built into the logic:**
- **Saline soil or water:** AWD is not recommended; show a warning and a referral message.
- **Flowering stage:** the app never suggests a dry period.
- **Unknown inputs:** default to the more water-safe rule and say so.
- Everything labelled "recommended practice", never "guaranteed saving".

**Water-saving claims:** published savings vary widely by soil and source. Show as a **range with a caveat** ("often reported 15-30% in Punjab-type conditions; varies by soil"), not a single number. Verify the range against the university guidance before using it in the UI.

**Practical note:** the standard AWD tool is a perforated pipe used to check the water level. It is optional and very cheap, but the app must work without it by using the farmer's own judgement ("water gone from the surface, soil still dark and muddy" vs "cracks").

**Power-window constraint (validate):** if the farmer's tubewell power is available only at fixed hours, the advice should be phrased as "irrigate during your next power window" rather than a clock time. Confirm the actual situation with a farmer.

### 3.3 Part B: DSR go/no-go and cost check

**What it does:** tells the farmer whether DSR is likely to work on a given field, and compares costs with transplanting and AWD-on-transplanted using the farmer's own numbers.

**Go/no-go checklist (rules):**

| Check | Result if failed |
|---|---|
| Previous crop was cotton, maize, sugarcane or another non-rice crop | Warn: higher risk of iron deficiency and weeds |
| Field not levelled | Warn: levelling is needed for DSR to work |
| No machine access | Show "needs a seed drill (own, rented or borrowed)" |
| Cannot apply herbicide within 24 hours of sowing | Warn: weed control is the main reason DSR fails |
| Heavy weed history | Warn |
| Saline soil | Do not recommend DSR or AWD without local advice |

Output: **Go / Go with caution / Not recommended**, each with plain reasons. Always include "AWD on transplanted paddy needs no machine and no herbicide program; consider this first."

**Cost comparison (the farmer enters or accepts editable defaults):**

For each option (transplanted conventional, transplanted + AWD, DSR) per acre:

```
Cost = seed cost (rate x price)
     + labour (transplanting) or 0 (DSR)
     + nursery cost (transplanting) or 0
     + herbicide (cost per application x applications)
     + machine cost (rent or owned, per acre)
     + levelling cost
     + irrigation cost (number of irrigations x cost per irrigation: diesel/electricity)
     - incentive (if applicable)
```

Also show a **risk adjustment**: a user-editable "expected yield difference" slider (defaults to 0, with a note that DSR yields can be lower if weeds are not controlled). The output shows a **break-even yield difference**: "DSR is cheaper unless it loses more than X quintals per acre."

**Reference facts for defaults (all must be re-verified each season; they change by year and state):**
- DSR seed rate commonly cited as 8-10 kg/acre vs 4-5 kg/acre for transplanting.
- Laser levelling cost reported around Rs 1,000/acre in older figures.
- DSR machines have been reported at Rs 70,000+; subsidies have varied by year.
- Punjab's reported DSR incentive: Rs 1,500/acre, sometimes paid with long delays.
- Transplanting labour cost reported around Rs 2,400/acre in 2019, likely higher now.

The app should store these as **editable defaults with a "last verified" date**, not hard-coded facts.

**Incentive reminder (lightweight):** one message near the sowing season: "Check if the DSR incentive is open for registration this year." No tracking, no logging.

### 3.4 Tier 1 technical design

- **Frontend:** a simple web app (mobile-first, works offline once loaded). Large buttons, icons, local-language text, optional audio playback of each result.
- **Backend:** none required initially. The rules and cost logic can run in the browser. This keeps hosting free.
- **Data:** rules table and default costs in a JSON file, versioned, with source and date for every entry.
- **Languages:** Punjabi and Hindi first (confirm the actual user's language), English fallback.

### 3.5 Tier 1 acceptance criteria

- A farmer can get his stage-based water rule in under 30 seconds with at most 7 inputs.
- The go/no-go output explains every warning in plain language.
- Every rule and number shows its source and date.
- The tool works on a low-end Android phone with a slow connection.
- Reviewed by at least one person with agricultural knowledge (the farmer, an agriculture officer, or a university extension contact) before being shown to others.

---

## 4. Tier 2: Grounded AI Assistant

### Purpose
Let a farmer ask any paddy question by voice or text in his own language and get a short answer sourced from official guidance, not invented by the model.

### 4.1 Why "grounded"
A general chatbot can produce confident wrong agronomy. This assistant answers **only** from a curated document set and says "I don't know, please ask your agriculture officer" when the documents don't cover the question.

### 4.2 Document set (curate and record licence/usage terms for each)

- State agricultural university package of practices for kharif crops (e.g., PAU for Punjab).
- ICAR guidance on rice, water management and pest management.
- State agriculture department advisories and DSR/AWD guidance.
- Agro-advisory material from Krishi Vigyan Kendras.
- Optional: IMD agromet advisories (check the terms of use before redistributing).

Keep a `sources.csv` listing each document, publisher, URL, date and licence/usage notes.

### 4.3 Pipeline

1. **Ingest:** convert PDFs to text, clean, split into passages with page/section metadata.
2. **Embed and index:** create embeddings and store in a small local vector index (e.g., FAISS or Chroma). No paid database needed.
3. **Query flow:**
   - Voice input -> speech-to-text -> text question (if voice is used).
   - Translate question to the document language if necessary.
   - Retrieve the top relevant passages.
   - Ask the language model to answer **only from the passages**, in short farmer-friendly language, with the sources cited.
   - If retrieval confidence is low, return the fallback ("I don't have a reliable answer; please contact your local agriculture office").
4. **Output:** short text answer + source line + optional text-to-speech playback in the farmer's language.

### 4.4 Prompting rules for the answer generator

- Use only the supplied passages.
- Keep answers to a few short sentences.
- State quantities exactly as the source does, with units and conditions.
- Never give a chemical dose unless it appears in the passages; if it does, quote it and cite it, and add "check the product label".
- For anything about spraying, diseases or costly decisions, add a line recommending confirmation with the local agriculture officer.
- If sources conflict, say so and show both.
- If the question is outside paddy and the document set, decline politely.

### 4.5 Voice and language

- **Speech-to-text and text-to-speech for Punjabi and Hindi:** quality varies by provider and dialect. Compare at least two options on real recorded questions early. India's government-backed language services and major cloud speech APIs are candidates; check current pricing, free-tier limits and accuracy before committing.
- If voice quality is poor, ship text plus tap-to-listen answers first and keep voice input as an enhancement.

### 4.6 Cost control

- Cache answers to common questions.
- Keep prompts and answers short.
- Run retrieval locally; only the answer generation calls an external model.
- Set a per-day usage cap during any pilot.
- Start as a web app (free to the farmer). WhatsApp delivery may carry per-conversation fees through the official API, so treat it as a later option after checking current pricing.

### 4.7 Evaluation (essential)

- Write a **test set of 40-60 realistic questions** with correct answers taken from the documents (for example, "When should I stop irrigating before harvest?", "Can I do DSR after maize?", "What are signs of zinc deficiency in paddy?").
- Mark the expected behaviour: answer with citation, or decline.
- Measure: correct-with-source rate, wrong-answer rate, correct-decline rate.
- **Target:** zero confident wrong answers on the test set before showing it to any farmer. Any failure gets fixed (better passages, stricter prompt) or the topic is blocked.
- Have an agriculture-knowledgeable person review a sample of answers.

### 4.8 Tier 2 acceptance criteria

- Every answer has at least one cited source from the curated set.
- Out-of-scope questions are declined.
- Answers are in the farmer's language, short enough to read or listen to in under 30 seconds.
- Passes the evaluation test set at the target above.

---

## 5. Tier 3: Narrow Rice Crop Doctor (only if time remains)

### Purpose
Help the farmer recognise a handful of common paddy problems from a photo and, importantly, avoid unnecessary sprays.

### 5.1 Scope (keep it small)

Pick 5-8 problems that are common locally and visually distinguishable. Candidates to confirm with local advice include: bacterial leaf blight, blast, sheath blight, zinc deficiency, iron deficiency, stem borer damage, and common weeds. Choose by local relevance, not by what a dataset happens to have.

### 5.2 Approach

- Use a vision-capable language model with the photo and a structured prompt.
- Combine with the Tier 2 retrieval: once a likely cause is named, fetch the official guidance for it.
- Output format:
  1. Most likely problem (or "unclear")
  2. Confidence: High / Medium / Low
  3. What to look for to confirm (e.g., "check lower leaves and tillers")
  4. What the official guidance says to do, with source
  5. "You may not need to spray if damage is below the economic threshold" when the guidance supports that
  6. Always: "Confirm with your agriculture officer before spraying"

### 5.3 Hard rules

- Low confidence: do not guess; ask for a better photo (close-up, whole plant, field view) or refer to a human.
- Never output a chemical name and dose unless it comes directly from the retrieved official source.
- Do not diagnose anything outside the chosen scope.

### 5.4 Validation (before showing to anyone)

- Test on real phone photos from the target crop and region (the farmer's own field photos are ideal), plus a public dataset only as a supplement; public datasets are often lab-style and overstate accuracy.
- Record accuracy per problem. Drop any problem where accuracy is poor.
- Be open that results will be weaker on real field photos than on clean dataset images.

### 5.5 Tier 3 acceptance criteria

- States its limits clearly in the interface.
- Refuses or refers when confidence is low.
- Tested on at least a few dozen real field photos, with results reported honestly.

---

## 6. Suggested build order (stop anywhere with something that works)

| Stage | What | Result if you stop here |
|---|---|---|
| A | Tier 1 rules table (from the official source), cost calculator, simple mobile web UI | A working, honest, free tool |
| B | Show Tier 1 to the farmer who inspired this; note his reaction and corrections | Real-user evidence for the submission |
| C | Tier 2 document ingestion + retrieval + cited answers (text only) | A grounded AI assistant |
| D | Tier 2 evaluation set; fix failures | A trustworthy assistant |
| E | Add Punjabi/Hindi voice in and out | The "farmers meet technology" demo |
| F | Tier 3 crop doctor, validated on real photos | Optional showpiece |
| G | Rain-aware advisory, only if local forecasts test as reliable | Optional add-on |

If time is very short: do A and B, then a text-only C. That alone is a legitimate, useful project.

---

## 7. Suggested technology (free or low-cost)

| Need | Option |
|---|---|
| Frontend | Plain HTML/JS or a small framework; mobile-first; can host on a free static host |
| Rules/cost logic | JavaScript in the browser |
| Backend (Tier 2+) | Python with FastAPI or Flask, or Streamlit for a quick demo |
| PDF text extraction | Standard Python PDF libraries |
| Embeddings and index | Open-source embedding model + FAISS or Chroma |
| Answer generation | A hosted language model API (cost scales with use; cap it) |
| Speech | Compare cloud and government-backed language services on real Punjabi/Hindi audio |
| Vision (Tier 3) | A hosted vision-capable model |
| Hosting | Free tiers for a demo; recheck limits and pricing |

---

## 8. Optional add-on: rain-aware advisory (conditional)

**Why conditional:** in the farmer's area, predicted rain often does not occur. Acting on a wrong forecast can stress a crop.

**If built, follow these rules:**
- The advice works fully without any forecast (stage and AWD rules are the base).
- The forecast may only **nudge**, never decide.
- Never skip an irrigation based on a forecast during flowering.
- Prefer low-cost-if-wrong decisions (for example, "consider delaying a spray") over high-cost ones.
- Prefer observed rainfall from the last 24 hours (satellite-estimated rainfall datasets) over predictions.
- Large-scale heavy-rain warnings from the national weather service are generally more reliable than "will it rain on my field" forecasts; use those for decisions like draining before harvest, worded as "likely", not "certain".
- **Validate first:** for a few weeks, record the forecast and what actually happened at one farm. If the forecast is not reliable locally, do not ship this.
- Check the usage terms of any weather data source before using it.

---

## 9. Risks and honest limitations

| Risk | Mitigation |
|---|---|
| Wrong advice causes crop loss | Grounded answers only; cite sources; show confidence; refer to an officer for costly decisions |
| Rules table copied wrongly from source | Cite page and date; have someone with agricultural knowledge review it |
| Published savings figures vary and may be overstated | Show ranges with caveats; never promise savings |
| Defaults (costs, incentives) become outdated | Editable defaults with "last verified" dates; re-verify each season |
| Punjabi/Hindi speech quality is uneven | Test early on real audio; fall back to text and tap-to-listen |
| Crop-doctor accuracy on real photos is unproven | Narrow scope; test on real photos; refuse when unsure |
| Farmers may not use an app | Keep it voice/photo first and zero-chore; ask the real user what format he prefers |
| LLM running costs | Caching, short answers, usage caps, local retrieval |
| Language-model errors or invention | Strict "answer only from passages" prompting; evaluation test set; zero confident-wrong target |
| Only one real user tested | State this plainly in any submission |

**Not claimed by this project:**
- It does not fix poor-quality seed. It helps farmers make cost and water decisions and find official guidance.
- It does not predict weather reliably.
- It is not a replacement for agriculture officers.

---

## 10. How to present this (competition or portfolio)

**Story:**
1. The problem came from a working farmer, not from a dataset.
2. We cut features that experienced farmers already handle or that depend on unreliable inputs.
3. We built what adds new knowledge at low cost: water-saving guidance, an honest cost check, and a grounded assistant.
4. We tested it with a real user and report what worked and what didn't.

**What to show:**
- Live demo of Tier 1 on a phone.
- Tier 2 answering a question in Punjabi/Hindi with a visible source.
- The evaluation results (correct, declined, wrong rates).
- A slide listing what was deliberately **not** built and why.
- A slide on limitations.

**Outcome metrics to report (honestly, from tests, not projections):**
- Time to get an answer
- Evaluation test-set scores
- Farmer feedback quotes and corrections
- Estimated water and cost differences shown by the calculator, labelled as estimates

---

## 11. Immediate next steps

1. Decide the target region and language (this sets which university guide and rules table to use).
2. Obtain the state agricultural university's kharif package of practices and extract the water rules by crop stage.
3. Build the Tier 1 rules table and cost calculator.
4. Show it to your father; write down his corrections.
5. Start Tier 2 ingestion and the evaluation question set in parallel with step 4.
