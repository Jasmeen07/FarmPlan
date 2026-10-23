# FarmPlan v2: Technical Guide

*How to build the three tiers described in `FarmPlan_v2_Build_Spec.md`. Region: Punjab (user picks district). Languages: Punjabi, Hindi, English.*

**Read this first**
- Anything marked **[VERIFY]** is a fact, price, API limit or agronomic value that I could not confirm from memory or that changes over time. Check it before depending on it.
- No agronomic numbers (irrigation intervals, doses, dates) are hard-coded in this guide. They come from official sources into config files, with source and date.
- Build in the order of section 12. Each milestone leaves you with something that works.

---

## 1. Architecture overview

### 1.1 Design principles that shape the architecture

1. **Tier 1 runs entirely in the browser.** No server, no running cost, works offline once loaded.
2. **Only Tier 2 and Tier 3 need a server**, because they call an AI model and hold the document index.
3. **Everything region- or season-specific lives in config files**, not code, so updating for a new season means editing JSON, not redeploying logic.
4. **Static text is pre-translated and pre-voiced at build time.** Runtime cost only arises for AI answers.

### 1.2 System diagram

```
                           FARMER'S PHONE (PWA, offline-capable)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  Language + District picker (stored in localStorage on device only)       │
 │                                                                           │
 │  TIER 1 (runs fully on device)                                            │
 │   ├─ Stage calculator                                                     │
 │   ├─ AWD rules engine        <── rules.json, districts.json (cached)      │
 │   ├─ DSR go/no-go gate       <── season_config.json                        │
 │   ├─ Cost calculator         <── cost_defaults.json (editable by farmer)  │
 │   └─ Audio player            <── /audio/{lang}/{rule_id}.mp3 (cached)     │
 │                                                                           │
 │  TIER 2 / 3 UI (needs internet)                                           │
 │   ├─ Chat box (text)                                                      │
 │   ├─ Mic button  ── audio blob ───────────┐                               │
 │   └─ Camera/photo picker ── image ────────┤                               │
 └───────────────────────────────────────────┼───────────────────────────────┘
                                             │ HTTPS (JSON / multipart)
                                             ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  BACKEND API (FastAPI)                                                    │
 │   POST /stt      audio  -> text          (speech-to-text provider)        │
 │   POST /ask      question + lang + district -> answer + sources           │
 │   POST /diagnose image + lang + district -> structured diagnosis          │
 │   POST /tts      text + lang -> audio    (text-to-speech provider)        │
 │   GET  /health                                                            │
 │                                                                           │
 │  Middleware: rate limit, request size limit, minimal logging              │
 │                                                                           │
 │  RAG SERVICE                                                              │
 │   ├─ Retriever  ── vector index (FAISS file) + chunk metadata (SQLite)    │
 │   ├─ Generator  ── hosted LLM API (answer only from passages)             │
 │   ├─ Validator  ── numbers/units in answer must appear in passages        │
 │   └─ Fallback   ── "I don't have a reliable answer; contact your officer" │
 │                                                                           │
 │  VISION SERVICE (Tier 3)                                                  │
 │   └─ Hosted vision-capable LLM + RAG lookup for the named problem         │
 └───────────────────────────────────────────────────────────────────────────┘
                                             ▲
                                             │ built offline, by you
 ┌───────────────────────────────────────────┴───────────────────────────────┐
 │  BUILD-TIME PIPELINES (run on your laptop)                                │
 │   1. Corpus ingest: PDFs -> clean text -> chunks -> embeddings -> index   │
 │   2. Content build: rules/labels in 3 languages -> JSON + audio files     │
 │   3. Season update: edit season_config.json from official notification    │
 └───────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Data flow per tier

**Tier 1 (no network after load):**
`pick language + district -> enter sowing method/date/soil/previous crop -> stage computed -> rule looked up -> text + audio shown`.
Cost calculator: `farmer edits defaults -> 3 options computed locally -> break-even shown`.

**Tier 2 (question):**
`voice or text -> (STT) -> question text -> retrieve top passages -> LLM answers only from passages -> validator -> answer + sources -> optional TTS`.

**Tier 3 (photo):**
`photo -> resize/compress on device -> /diagnose -> vision model returns structured JSON -> if problem named, retrieve official guidance -> format with confidence + referral`.

---

## 2. Technology choices

| Layer | Choice | Why | Alternatives |
|---|---|---|---|
| Frontend | Vite + vanilla JS or Preact (small bundle) | Smaller downloads on slow data than a heavy framework | React, Svelte |
| Offline | Service worker (Workbox) | Cache app shell, JSON and audio | Manual cache API |
| i18n | Plain JSON files per language, small helper | Few strings, no heavy library needed | i18next |
| Fonts | Noto Sans Gurmukhi, Noto Sans Devanagari, bundled locally | Avoid missing glyphs on phones; no external requests | System fonts (unreliable for Gurmukhi on older phones) |
| Backend | Python 3.11+, FastAPI | Quick to build, async, good for AI libraries | Flask |
| PDF parsing | `pymupdf` (fitz) | Fast and reliable text extraction | `pdfplumber` |
| Embeddings | A multilingual open model, e.g. `BAAI/bge-m3` or `intfloat/multilingual-e5-base` **[VERIFY quality on Punjabi/Hindi queries]** | Runs locally, no per-query cost | Hosted embedding API |
| Vector index | FAISS flat index saved to a file | No separate database to host | Chroma |
| Metadata | SQLite | Zero setup | JSON files |
| LLM (answers, vision) | Hosted model API. As of this writing the Anthropic model strings include `claude-sonnet-5-5` and `claude-haiku-5-5` **[VERIFY current names and pricing in the docs]** | Strong multilingual and vision ability | Other providers |
| Speech-to-text | Compare 2-3 options on real audio (see 8.4) | Quality for Punjabi varies a lot | Browser Web Speech API (free but patchy) |
| Text-to-speech | Pre-generated MP3 for static text; runtime TTS only for AI answers | Cuts running cost | Browser `speechSynthesis` (check Punjabi voice availability) |
| Hosting (frontend) | Static host free tier (Cloudflare Pages, Netlify, Vercel) **[VERIFY limits]** | Free for a demo | GitHub Pages |
| Hosting (backend) | Small container host or VPS **[VERIFY free-tier limits]** | Enough for demo traffic | Serverless functions |
| Testing | `pytest`, Vitest/Jest, Playwright (optional) | Standard | |

---

## 3. Repository layout

```
farmplan/
├─ README.md
├─ docs/
│  ├─ FarmPlan_v2_Build_Spec.md
│  ├─ FarmPlan_v2_Technical_Guide.md
│  └─ sources.csv                  # every document: publisher, URL, date, licence notes
├─ web/                            # Tier 1 + UI for Tier 2/3
│  ├─ index.html
│  ├─ src/
│  │  ├─ main.js
│  │  ├─ i18n.js
│  │  ├─ state.js                  # language, district (localStorage)
│  │  ├─ stage.js                  # growth stage calculator
│  │  ├─ rules.js                  # AWD rules engine
│  │  ├─ dsrGate.js                # DSR go/no-go
│  │  ├─ cost.js                   # cost calculator
│  │  ├─ chat.js                   # Tier 2 UI
│  │  ├─ camera.js                 # Tier 3 UI + image resize
│  │  └─ audio.js
│  ├─ public/
│  │  ├─ data/
│  │  │  ├─ districts.json
│  │  │  ├─ season_config.json
│  │  │  ├─ rules.json
│  │  │  ├─ varieties.json
│  │  │  ├─ cost_defaults.json
│  │  │  └─ strings.{pa,hi,en}.json
│  │  ├─ audio/{pa,hi,en}/*.mp3
│  │  ├─ fonts/
│  │  └─ sw.js
│  └─ tests/
├─ api/                            # Tier 2 + 3 backend
│  ├─ main.py
│  ├─ config.py
│  ├─ rag/
│  │  ├─ ingest.py
│  │  ├─ retrieve.py
│  │  ├─ generate.py
│  │  └─ validate.py
│  ├─ vision/diagnose.py
│  ├─ speech/{stt.py,tts.py}
│  ├─ data/
│  │  ├─ corpus/                   # source PDFs (check licences before committing)
│  │  ├─ index.faiss
│  │  └─ chunks.sqlite
│  └─ tests/
│     ├─ test_questions.jsonl      # golden Q&A set
│     └─ test_rag.py
└─ tools/
   ├─ build_audio.py               # strings -> mp3 for all languages
   ├─ check_translations.py        # missing keys, placeholder mismatches
   └─ season_update.md             # checklist for each new season
```

---

## 4. Config and data schemas

All files below are JSON, versioned in git, and each entry carries its source.

### 4.1 `districts.json`

```json
{
  "version": "2026-10",
  "source": "Local Government Directory (official district/block list)",
  "verified_on": null,
  "districts": [
    {
      "lgd_code": "<from official directory>",
      "name": { "en": "Amritsar", "pa": "ਅੰਮ੍ਰਿਤਸਰ", "hi": "अमृतसर" },
      "blocks": [ { "lgd_code": "<code>", "name": { "en": "", "pa": "", "hi": "" } } ],
      "salinity_flag": "unknown",
      "kvk_contact": { "name": "", "phone": null, "source": "" }
    }
  ]
}
```

Rules:
- Take codes and English names from the official directory. Have a **native speaker verify** every Punjabi and Hindi name.
- `salinity_flag` is `"unknown"` unless an official source supports another value; record the source.

### 4.2 `season_config.json` (updated every season)

```json
{
  "season": "kharif-2027",
  "verified_on": null,
  "source_url": null,
  "dsr_window": { "start": null, "end": null },
  "transplant_zones": [
    {
      "zone": 1,
      "districts": ["<lgd_code>", "<lgd_code>"],
      "earliest_transplant": null
    }
  ],
  "dsr_incentive": { "amount_per_acre": null, "currency": "INR", "scheme_open": null, "source": "" },
  "notes": { "en": "", "pa": "", "hi": "" }
}
```

Reasons it is config: Punjab has changed its zone groupings and dates between seasons, and the dates are announced shortly before each season.

### 4.3 `rules.json` (AWD rules by stage)

```json
{
  "version": "0.1",
  "source": { "doc": "<university package of practices, kharif>", "edition": "<year>", "verified_by": null },
  "stages": [
    {
      "id": "tillering",
      "water_rule": "awd",
      "text": {
        "en": "<text copied/adapted from official guide>",
        "pa": "<reviewed translation>",
        "hi": "<reviewed translation>"
      },
      "source_ref": { "page": null, "section": "" },
      "never_dry": false,
      "warning_ids": ["saline_no_awd"]
    },
    {
      "id": "flowering",
      "water_rule": "keep_shallow_water",
      "text": { "en": "", "pa": "", "hi": "" },
      "source_ref": { "page": null, "section": "" },
      "never_dry": true,
      "warning_ids": []
    }
  ],
  "warnings": {
    "saline_no_awd": { "en": "", "pa": "", "hi": "" }
  }
}
```

The stage list and values must be filled from the official document. Do not invent intervals.

### 4.4 `varieties.json`

```json
{
  "varieties": [
    {
      "id": "<variety id>",
      "name": { "en": "", "pa": "", "hi": "" },
      "method": ["transplant", "dsr"],
      "duration_days": { "from_sowing": null, "from_transplanting": null },
      "stage_boundaries_days": {
        "establishment_end": null,
        "tillering_end": null,
        "flowering_start": null,
        "flowering_end": null,
        "maturity": null
      },
      "source": ""
    }
  ]
}
```

If a variety has no official boundaries, the app marks stage as **approximate** and says so.

### 4.5 `cost_defaults.json`

```json
{
  "last_verified": null,
  "items": {
    "seed_rate_kg_per_acre": { "transplant": null, "dsr": null },
    "seed_price_per_kg": null,
    "transplant_labour_per_acre": null,
    "nursery_cost_per_acre": null,
    "herbicide_cost_per_application": null,
    "herbicide_applications": { "dsr": null, "transplant": null },
    "machine_cost_per_acre": null,
    "levelling_cost_per_acre": null,
    "cost_per_irrigation": null,
    "irrigations": { "transplant": null, "transplant_awd": null, "dsr": null },
    "incentive_per_acre_dsr": null,
    "paddy_price_per_quintal": null
  },
  "reference_notes": "Reported figures (verify, they date quickly): DSR seed ~8-10 kg/acre vs ~4-5 for transplanting; laser levelling ~Rs 1,000/acre in older reports; DSR machine reported Rs 70,000+; transplanting labour ~Rs 2,400/acre in 2019; Punjab DSR incentive Rs 1,500/acre. Use as starting points, mark as estimates, let the farmer edit."
}
```

Every item must be editable in the UI. Items left `null` are asked, not assumed.

### 4.6 `strings.{pa,hi,en}.json`

Flat keys, identical across languages:

```json
{ "app.title": "...", "pick.language": "...", "pick.district": "...", "stage.label": "...", "cost.total": "..." }
```

`tools/check_translations.py` must fail the build if any key is missing in any language or if placeholders (`{n}`, `{date}`) differ.

---

## 5. Tier 1 implementation

### 5.1 Setup

```bash
npm create vite@latest web -- --template vanilla
cd web
npm install
npm install -D vitest vite-plugin-pwa
```

### 5.2 Stage calculation (`stage.js`)

```js
// Returns the current stage id, or null if boundaries are unknown.
export function currentStage(variety, sowingDateISO, todayISO = new Date().toISOString().slice(0, 10)) {
  const days = Math.floor((new Date(todayISO) - new Date(sowingDateISO)) / 86400000);
  const b = variety?.stage_boundaries_days;
  if (!b || Object.values(b).some(v => v === null)) return { stage: null, approximate: true, days };
  let stage;
  if (days <= b.establishment_end) stage = "establishment";
  else if (days <= b.tillering_end) stage = "tillering";
  else if (days < b.flowering_start) stage = "panicle_initiation";
  else if (days <= b.flowering_end) stage = "flowering";
  else if (days < b.maturity) stage = "grain_filling";
  else stage = "pre_harvest";
  return { stage, approximate: false, days };
}
```

Stage ids must match the ids in `rules.json`. If the variety is unknown, the UI asks the farmer which stage the crop looks like (tillering / flowering / grain filling) using simple pictures, instead of guessing.

### 5.3 Rules engine (`rules.js`)

```js
export function adviceFor(stageResult, rules, inputs) {
  const warnings = [];
  const stage = rules.stages.find(s => s.id === stageResult.stage);
  if (!stage) return { kind: "unknown_stage" };

  if (inputs.saline !== "no") warnings.push("saline_no_awd");       // unknown or yes: warn
  if (stage.never_dry) warnings.push("flowering_never_dry");
  if (stageResult.approximate) warnings.push("stage_approximate");

  return {
    ruleId: stage.id,
    text: stage.text,                 // {en, pa, hi}
    source: stage.source_ref,
    warnings: [...new Set([...warnings, ...stage.warning_ids])],
    audioId: `rule_${stage.id}`
  };
}
```

Default behaviour on missing information is always the **water-safe** option, and the UI says so.

### 5.4 DSR go/no-go (`dsrGate.js`)

```js
const NON_RICE = new Set(["cotton", "maize", "sugarcane", "other_non_rice"]);

export function dsrGate(i, season) {
  const reasons = [];
  let level = "go";

  const bump = (to, id) => {
    reasons.push(id);
    const order = { go: 0, caution: 1, no: 2 };
    if (order[to] > order[level]) level = to;
  };

  if (NON_RICE.has(i.previousCrop)) bump("caution", "prev_crop_non_rice");
  if (i.levelled === "no") bump("caution", "not_levelled");
  if (i.machine === "none") bump("caution", "no_machine");
  if (i.herbicideWithin24h === "no") bump("caution", "herbicide_timing");
  if (i.weedHistory === "heavy") bump("caution", "weed_history");
  if (i.saline !== "no") bump("no", "saline_or_unknown");

  return { level, reasons };    // reasons are string ids, mapped to translated text
}
```

Display, for every result, the line "AWD on transplanted paddy needs no machine and no herbicide program; consider this first."

### 5.5 Cost calculator (`cost.js`)

```js
// All inputs are per acre, all editable by the farmer. null -> ask, never assume.
export function costs(d) {
  const t  = d.seed_rate_kg_per_acre.transplant * d.seed_price_per_kg
           + d.nursery_cost_per_acre + d.transplant_labour_per_acre
           + d.herbicide_applications.transplant * d.herbicide_cost_per_application
           + d.irrigations.transplant * d.cost_per_irrigation;

  const ta = t - (d.irrigations.transplant - d.irrigations.transplant_awd) * d.cost_per_irrigation;

  const dsr = d.seed_rate_kg_per_acre.dsr * d.seed_price_per_kg
            + d.herbicide_applications.dsr * d.herbicide_cost_per_application
            + d.machine_cost_per_acre + d.levelling_cost_per_acre
            + d.irrigations.dsr * d.cost_per_irrigation
            - (d.incentive_per_acre_dsr ?? 0);

  return { transplant: t, transplant_awd: ta, dsr };
}

// How much yield (quintals/acre) DSR can lose before it stops being cheaper.
export function breakEvenQuintals(costTransplant, costDsr, pricePerQuintal) {
  if (!pricePerQuintal) return null;
  return (costTransplant - costDsr) / pricePerQuintal;
}
```

UI rules:
- Show the three totals side by side with a one-line breakdown each.
- Show the break-even as plain language: "DSR stays cheaper unless it gives X quintals less per acre."
- Label everything "estimate based on the numbers you entered".
- Optional yield-difference slider defaults to 0 with a note that weeds can cut DSR yield.
- If the incentive is delayed, show a note that it may arrive months later.

### 5.6 Offline and performance

- Service worker caches the app shell, all `/data/*.json`, fonts and audio for the **selected language only** (download others on demand).
- Budget: first load under about 1 MB excluding audio; compress JSON; lazy-load audio.
- Test with browser throttling at "Slow 3G" and on a low-end Android device.

### 5.7 Audio for Tier 1 (build-time)

`tools/build_audio.py`:
1. Read every rule text and warning in `strings.*.json` and `rules.json`.
2. For each language, generate MP3 with the chosen TTS provider; name `rule_{id}.mp3`.
3. Have a native speaker listen to every file once before release (pronunciation of numbers and agricultural terms is a common failure).
4. Commit the files (small) so there is zero runtime cost.

### 5.8 Screens (keep to five)

1. Language + district picker (big buttons, first launch only).
2. "About your field" form (7 inputs max, icons, voice read-aloud of each question).
3. Result: stage + water rule (text + play button) + warnings.
4. DSR check result with reasons.
5. Cost comparison.

Accessibility: large tap targets, high contrast, no reliance on colour alone, plain words.

---

## 6. Tier 2 implementation: grounded assistant

### 6.1 Setup

```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn[standard] pymupdf sentence-transformers faiss-cpu \
            anthropic slowapi pillow python-multipart pytest
```

### 6.2 Corpus preparation

1. Collect documents; record each in `docs/sources.csv` (title, publisher, URL, edition/date, language, **licence/usage terms**). Do not redistribute documents whose terms forbid it; you can still index them locally and cite them.
2. Prefer in this order: state agricultural university package of practices (kharif), ICAR rice guidance, state agriculture department advisories, Krishi Vigyan Kendra material.
3. Note which have Punjabi or Hindi versions.
4. Remove headers/footers and page numbers; keep section headings as metadata.

### 6.3 Ingestion (`rag/ingest.py`)

```python
import fitz, sqlite3, json, re
import numpy as np, faiss
from sentence_transformers import SentenceTransformer

MODEL = SentenceTransformer("BAAI/bge-m3")   # [VERIFY] retrieval quality on Punjabi/Hindi

def pdf_to_sections(path):
    doc = fitz.open(path)
    for pno, page in enumerate(doc, start=1):
        text = page.get_text("text")
        yield pno, re.sub(r"\n{2,}", "\n\n", text).strip()

def chunk(text, max_chars=1200, overlap=150):
    paras, cur, out = text.split("\n\n"), "", []
    for p in paras:
        if len(cur) + len(p) > max_chars and cur:
            out.append(cur); cur = cur[-overlap:] + p
        else:
            cur += ("\n\n" if cur else "") + p
    if cur: out.append(cur)
    return out

def build(corpus_files, out_index="data/index.faiss", out_db="data/chunks.sqlite"):
    rows, texts = [], []
    for f in corpus_files:                       # f = dict(path, doc_id, title, lang, region)
        for pno, page_text in pdf_to_sections(f["path"]):
            for c in chunk(page_text):
                rows.append((f["doc_id"], f["title"], f["lang"], f["region"], pno, c))
                texts.append(c)
    emb = MODEL.encode(texts, normalize_embeddings=True, batch_size=32)
    index = faiss.IndexFlatIP(emb.shape[1]); index.add(np.asarray(emb, dtype="float32"))
    faiss.write_index(index, out_index)
    con = sqlite3.connect(out_db)
    con.execute("DROP TABLE IF EXISTS chunks")
    con.execute("CREATE TABLE chunks(id INTEGER PRIMARY KEY, doc_id, title, lang, region, page, text)")
    con.executemany("INSERT INTO chunks(doc_id,title,lang,region,page,text) VALUES (?,?,?,?,?,?)", rows)
    con.commit()
```

Check the extracted text by eye for a sample of pages (tables and scanned pages often extract badly; scanned PDFs need OCR, **[VERIFY]** that your key documents are not scans).

### 6.4 Retrieval (`rag/retrieve.py`)

```python
def retrieve(question, k=5, min_score=0.35, district_region=None):
    q = MODEL.encode([question], normalize_embeddings=True).astype("float32")
    scores, ids = index.search(q, k * 3)
    hits = []
    for s, i in zip(scores[0], ids[0]):
        if s < min_score: continue
        row = con.execute("SELECT doc_id,title,page,text,region FROM chunks WHERE id=?", (int(i) + 1,)).fetchone()
        boost = 0.05 if district_region and row[4] in (district_region, "punjab") else 0
        hits.append({"score": float(s) + boost, "doc": row[0], "title": row[1], "page": row[2], "text": row[3]})
    hits.sort(key=lambda h: -h["score"])
    return hits[:k]
```

`min_score` is a starting guess: **tune it on the golden test set** (section 9). If nothing passes the threshold, skip the model entirely and return the fallback; this also saves cost.

### 6.5 Generation (`rag/generate.py`)

```python
import anthropic
client = anthropic.Anthropic()          # reads ANTHROPIC_API_KEY from environment

SYSTEM = """You answer questions from farmers in Punjab about paddy.
Use ONLY the numbered passages provided. If the passages do not contain the answer, reply exactly: NO_ANSWER.
Rules:
- Reply in {lang_name}. Use short, simple sentences (at most 5).
- Copy every number, unit, date and condition exactly as the passage states it.
- Never give a pesticide or herbicide dose unless it appears in the passages; if it does, copy it and add: check the product label.
- For spraying, diseases or costly decisions, add one line recommending confirmation with the local agriculture officer.
- If passages disagree, say so and give both with their source numbers.
- End with the source numbers you used, like [1][3].
- Do not use outside knowledge. Do not guess."""

def answer(question, passages, lang_name, model="claude-sonnet-5-5"):  # [VERIFY] model string and price
    ctx = "\n\n".join(f"[{i+1}] ({p['title']}, p.{p['page']})\n{p['text']}" for i, p in enumerate(passages))
    msg = client.messages.create(
        model=model, max_tokens=500, temperature=0,
        system=SYSTEM.format(lang_name=lang_name),
        messages=[{"role": "user", "content": f"Passages:\n{ctx}\n\nQuestion: {question}"}],
    )
    return msg.content[0].text
```

Cost control: `max_tokens` small, temperature 0, cap passages to 5, consider a cheaper model for simple lookups, **[VERIFY pricing]**.

### 6.6 Validation (`rag/validate.py`)

A cheap automatic safety net; it catches the most dangerous failure (a wrong number).

```python
import re
NUM = re.compile(r"\d+(?:[.,]\d+)?")

# Convert Gurmukhi and Devanagari digits to ASCII before comparing.
def normalise_digits(s):
    table = {ord(c): str(i) for i, c in enumerate("੦੧੨੩੪੫੬੭੮੯")}
    table.update({ord(c): str(i) for i, c in enumerate("०१२३४५६७८९")})
    return s.translate(table)

def numbers_supported(answer_text, passages):
    ans = set(NUM.findall(normalise_digits(answer_text))) - {str(i) for i in range(1, 10)}  # ignore [n] refs
    src = set(NUM.findall(normalise_digits(" ".join(p["text"] for p in passages))))
    return ans <= src, ans - src
```

If any number in the answer is not found in the passages, **discard the answer** and return the fallback (or retry once with a stricter instruction). Also reject answers with no source numbers. Note: passages in English with answers in Punjabi still pass because digits are normalised; number words ("two days") need a manual check in the test set.

### 6.7 API (`main.py`)

```python
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from pydantic import BaseModel

app = FastAPI()
limiter = Limiter(key_func=get_remote_address)

class Ask(BaseModel):
    question: str
    lang: str          # "pa" | "hi" | "en"
    district: str | None = None

FALLBACK = {
  "en": "I don't have a reliable answer to this. Please contact your local agriculture office.",
  "pa": "<reviewed Punjabi text>",
  "hi": "<reviewed Hindi text>",
}

@app.post("/ask")
@limiter.limit("20/minute")
async def ask(request: Request, body: Ask):
    if len(body.question) > 500: raise HTTPException(413, "Question too long")
    passages = retrieve(body.question, district_region=region_for(body.district))
    if not passages:
        return {"answer": FALLBACK[body.lang], "sources": [], "grounded": False}
    text = answer(body.question, passages, LANG_NAME[body.lang])
    ok, extra = numbers_supported(text, passages)
    if text.strip() == "NO_ANSWER" or not ok:
        return {"answer": FALLBACK[body.lang], "sources": [], "grounded": False}
    return {"answer": text, "sources": [{"title": p["title"], "page": p["page"]} for p in passages], "grounded": True}
```

Run locally: `uvicorn main:app --reload`.

### 6.8 Caching

Normalise the question (lowercase, strip punctuation), hash with language, and store `{answer, sources}` in SQLite with a timestamp. Serve cached answers for repeated questions and expire after a season or when the corpus changes.

### 6.9 Frontend chat (`chat.js`)

- Large text box and mic button; suggested questions as buttons (cheap, guided, and good for demos).
- Show the answer, then "Sources: title, page".
- "Listen" button (runtime TTS or browser speech).
- Show a clear note: "This answer comes from official guidance. For spraying or costly decisions, confirm with your agriculture officer."
- If `grounded: false`, show the fallback and the district's agriculture office / KVK contact from `districts.json`.

---

## 7. Tier 3 implementation: narrow crop doctor

Only start this after Tier 2 passes its evaluation.

### 7.1 Photo handling on the device (`camera.js`)

- Accept camera or gallery.
- Resize to about 1024 px on the long edge and compress as JPEG before upload (saves data; also reduces cost).
- Guide the user: "Take a close photo of the affected leaf, then one of the whole plant, then one of the field."

### 7.2 Diagnosis service (`vision/diagnose.py`)

Ask the vision model for **structured output only**:

```python
SYSTEM = """You help identify common paddy problems from photos for farmers in Punjab.
Allowed problems (and nothing else): {allowed}.
Return JSON only:
{"problem": "<one of allowed or 'unclear'>",
 "confidence": "high|medium|low",
 "visible_signs": ["..."],
 "what_to_check": ["..."],
 "need_better_photo": true|false}
Rules: if the image is not a paddy plant, is blurry, or you are not sure, return problem 'unclear' and confidence 'low'.
Never name chemicals or doses."""
```

### 7.3 Post-processing

1. Parse JSON; reject anything not matching the schema.
2. If `problem == "unclear"` or confidence is `low`: ask for a better photo once; then refer to the officer. **Do not guess.**
3. If a problem is named: call the Tier 2 retrieval with a query for that problem, generate guidance **with the same grounded rules and number validator**, and show it with the confidence level.
4. Always append: "Confirm with your agriculture officer before spraying. You may not need to spray if damage is below the level where spraying pays; ask your officer about the threshold." (Only include the threshold line if the retrieved guidance supports it.)

### 7.4 Scope control

- The allowed-problem list is a config file chosen by local relevance (5-8 items). Add a problem only after testing it.
- Block images with people or non-crop content (the model's "unclear" response handles most).

### 7.5 Evaluation

- Collect real field photos (your father's fields are ideal) and label them with help from an agriculture-knowledgeable person.
- Measure per-problem precision and the rate of confident wrong answers.
- Public image datasets can supplement but usually overstate accuracy, because photos are clean and lab-style.
- Drop any problem with poor accuracy from the allowed list.

---

## 8. Language, voice and translation details

### 8.1 Scripts and fonts
- Punjabi: Gurmukhi script. Hindi: Devanagari. Bundle Noto Sans Gurmukhi and Noto Sans Devanagari as web fonts with `font-display: swap`.
- Set `lang="pa"`, `lang="hi"`, `lang="en"` on the root element so phones pick correct typography.
- Test on at least one old low-end Android phone for missing glyphs.

### 8.2 Numerals and units
- Choose one numeral style per language (Western digits are common in everyday Punjabi/Hindi use; **[VERIFY with a native speaker]**).
- Units: show acres and quintals as farmers use them; keep both units visible if a source uses hectares.

### 8.3 Translation workflow
1. Write English first.
2. Produce Punjabi and Hindi drafts (a model can draft).
3. **A native speaker reviews every string**, especially agricultural terms and anything involving quantities, warnings or safety.
4. `check_translations.py` verifies keys and placeholders.
5. Freeze strings; changes need re-review.

### 8.4 Speech-to-text and text-to-speech selection
Compare at least two providers per direction on real data:

1. Record 30 short questions (10 per language) from real speakers, including a farmer, in a quiet and a noisy setting.
2. Run each provider; compute word error rate against hand transcripts.
3. For TTS, have a native speaker rate naturalness and number pronunciation (1-5).
4. Pick the best per language; allow different providers per language.

Candidates to evaluate **[VERIFY access terms, free limits, accuracy]**: Indian government-backed language services (Bhashini), open models from AI4Bharat, major cloud speech APIs, open Whisper models (supports Punjabi but quality is uneven), and browser built-ins. If Punjabi voice input is unreliable, ship tap-to-ask suggested questions first.

### 8.5 Code-mixed input
Farmers may mix English words (urea, DSR) into Punjabi/Hindi. Keep a small glossary (term, Punjabi, Hindi, English) that is also added to retrieval queries (query expansion) to improve matches.

---

## 9. Testing and evaluation

| Layer | What | How |
|---|---|---|
| Unit | stage, rules, gate, cost | Vitest; table-driven cases; boundary days; null inputs |
| Content | translation keys and placeholders | `check_translations.py` in CI |
| Config | JSON schema validation | Fail build if required fields missing or `verified_on` is null at release |
| RAG | golden question set | `pytest` runs `test_questions.jsonl` |
| Validator | number-matching | Include adversarial cases where the model would invent a number |
| Voice | WER, TTS ratings | Procedure in 8.4 |
| Vision | accuracy on real photos | Section 7.5 |
| Usability | real user | Sit with your father; watch him use it without helping; note where he hesitates |
| Performance | slow network, low-end phone | Throttled browser; one real old phone |

### 9.1 Golden question set (`test_questions.jsonl`)

```json
{"id":"q001","lang":"en","q":"When should irrigation stop before harvest?","expect":"answer","must_contain_numbers":["<from source>"],"source_doc":"<doc id>","source_page":null}
{"id":"q002","lang":"pa","q":"<Punjabi question>","expect":"answer","source_doc":"<doc id>"}
{"id":"q003","lang":"en","q":"What is the price of paddy in Delhi today?","expect":"decline"}
{"id":"q004","lang":"en","q":"How much of <pesticide> should I spray per acre?","expect":"decline_unless_in_source"}
```

Write 40-60 questions across the three languages, covering AWD, DSR, weeds, nutrition, harvest timing, plus out-of-scope and trick questions. Answers come from the documents, not from the model.

### 9.2 Release gates
- Zero confident wrong answers on the golden set.
- 100% of out-of-scope questions declined.
- Every answer cites a source.
- All strings reviewed by a native speaker.
- Tier 1 rules reviewed by someone with agricultural knowledge.

---

## 10. Deployment and operations

### 10.1 Frontend
```bash
cd web && npm run build      # outputs dist/
```
Deploy `dist/` to a static host. Enable HTTPS (required for service workers and microphone access).

### 10.2 Backend
- Containerise with a small `Dockerfile` (Python slim image, copy `api/`, include `index.faiss` and `chunks.sqlite`).
- Environment variables: `ANTHROPIC_API_KEY`, speech provider keys, `ALLOWED_ORIGIN`, `DAILY_REQUEST_CAP`.
- Never put keys in the frontend or in git.
- Set CORS to your frontend origin only.
- Add a **daily request cap** and a monthly spend alert with the AI provider.

### 10.3 Per-season update checklist (`tools/season_update.md`)
1. Download the new official sowing/transplanting notification; update `season_config.json` with source URL and `verified_on`.
2. Re-check DSR incentive amount and whether registration is open.
3. Re-check cost defaults and mark `last_verified`.
4. Check whether the university published a new package of practices; if so, re-ingest and re-run the golden set.
5. Rebuild, run tests, deploy.

### 10.4 Monitoring (keep it light)
- Count requests, fallbacks, validator rejections and errors; no personal data.
- Review a sample of fallbacks weekly to find missing documents or questions worth adding.

---

## 11. Security and privacy

- No accounts, no phone numbers, no precise location. District and language stay in the device's local storage.
- Do not log question text with identifiers; if logging questions for improvement, ask permission in the app and strip anything that looks like a name or phone number.
- Photos are processed for the diagnosis and not stored by default **[VERIFY the retention terms of any AI provider you use]**.
- Rate-limit all endpoints; cap request and image sizes.
- Treat the corpus as trusted but sanitise: strip control characters before putting text in prompts. Treat user questions as untrusted (the system prompt must not be overridable by the question).
- Show a short plain-language privacy note in all three languages.

---

## 12. Milestones with definition of done

Effort is relative (S small, M medium, L large) because available time is unknown. Stop after any milestone and you still have something that works.

| # | Milestone | Effort | Definition of done |
|---|---|---|---|
| M1 | Config skeleton: `districts.json` from the official list; `season_config.json`; `strings.*` for the picker | S | Language and district picker works; all 23 districts appear in 3 languages, reviewed |
| M2 | Rules and varieties from the university guide; stage + rules engine | M | A farmer enters inputs and gets the right stage rule; unit tests pass; each rule shows its source |
| M3 | DSR gate + cost calculator + UI | M | Three costs and break-even shown; every default editable; "estimate" labels present |
| M4 | Audio for static text in 3 languages; offline PWA | S-M | Works in airplane mode after first load; audio plays; native-speaker approved |
| M5 | Show M1-M4 to your father; record corrections | S | Written list of what he understood, ignored and wanted; fixes applied |
| M6 | Corpus ingest + retrieval + cited answers (text, English questions first) | M | Golden set (English part) runs; fallback works |
| M7 | Validator + Punjabi/Hindi questions and answers | M | Golden set passes release gates in all three languages |
| M8 | Voice in/out; provider comparison | M | WER and TTS ratings recorded; chosen providers integrated; text fallback kept |
| M9 | Deploy backend and frontend; rate limits and spend caps | S | Public demo link works on a real phone over mobile data |
| M10 | Tier 3 crop doctor (optional) | L | Real-photo accuracy reported per problem; refusal on low confidence works |
| M11 | Rain-aware advisory (optional, only if local test passes) | M | Follows the rules in the Build Spec, section 8 |

**If time is very short:** M1-M5, then M6 in English only. That is a complete and honest project.

---

## 13. Known unknowns to resolve early

1. **Which university documents exist in Punjabi/Hindi**, and their usage terms.
2. **Punjabi speech quality** across providers (decides how central voice can be).
3. **Embedding model quality** on Punjabi queries against English documents (test with 20 queries before committing).
4. **Whether key PDFs are scans** needing OCR.
5. **Official source for district salinity/waterlogging flags**; until found, keep "unknown".
6. **IMD/other data licensing** if you add any weather content later.
7. **AI provider pricing and data-retention terms** at the time you deploy.
8. **Whether your father (and other farmers) prefer an app, audio, or WhatsApp**; M5 answers this before you invest in more.

---

## 14. What not to build (reminder)

Price forecasting, rotation optimizer, logging features, satellite damage detection, machine marketplace, bill OCR, fake-input detection, standalone sowing planner, and any irrigation advice that skips watering because of a rain forecast. Reasons are in the Build Spec, section 2.
