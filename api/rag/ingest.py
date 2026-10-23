"""
api/rag/ingest.py
Build-time corpus ingestion for FarmPlan v2.
Populates api/data/chunks.sqlite with clean, sectioned passages from official PAU guidance.
"""

import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "chunks.sqlite"

PAU_KHARIF_PASSAGES = [
    {
        "doc_id": "pau_kharif_water_2025",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "lang": "en",
        "region": "punjab",
        "page": 24,
        "section": "Establishment Stage",
        "text": "For the first 15 days after transplanting, keep 3 to 5 cm shallow standing water in the field. This prevents drying of nursery seedling roots, suppresses early weed germination, and ensures rapid tillering."
    },
    {
        "doc_id": "pau_kharif_water_2025",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "lang": "en",
        "region": "punjab",
        "page": 25,
        "section": "Vegetative Tillering & Alternate Wetting and Drying (AWD)",
        "text": "During tillering, practice Alternate Wetting and Drying (AWD). Apply 5 to 7 cm irrigation only 2 days after the ponded water has completely infiltrated and disappeared from the soil surface. Do not allow hairline cracks to develop. This intermittent drying saves 15 to 30 percent irrigation water (about 5 to 7 tubewell irrigations) without any reduction in paddy grain yield."
    },
    {
        "doc_id": "pau_kharif_water_2025",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "lang": "en",
        "region": "punjab",
        "page": 25,
        "section": "Panicle Initiation to Flowering (Critical Period)",
        "text": "From panicle initiation (nissar) until flowering completion, rice is most sensitive to moisture stress. Never allow the field to dry during flowering. Continuous shallow standing water of 5 cm must be maintained. Moisture stress at flowering causes flower abortion and empty, chaffy grains."
    },
    {
        "doc_id": "pau_kharif_water_2025",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "lang": "en",
        "region": "punjab",
        "page": 26,
        "section": "Grain Filling & Milky Stage",
        "text": "During grain filling (milky and dough stages), irrigate when surface water has subsided. Deep flooding is not needed. Saturated to moist soil conditions allow optimal carbohydrate translocation into developing grains."
    },
    {
        "doc_id": "pau_kharif_water_2025",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "lang": "en",
        "region": "punjab",
        "page": 27,
        "section": "Irrigation Termination Before Harvest",
        "text": "Stop all irrigation 14 to 15 days before combine harvesting. This promotes uniform grain maturity, allows the soil surface to harden for harvester machinery, and avoids lodging and grain discoloration."
    },
    {
        "doc_id": "pau_kharif_dsr_2025",
        "title": "PAU Direct Seeded Rice (DSR / Tar-Wattar) Technology",
        "lang": "en",
        "region": "punjab",
        "page": 31,
        "section": "Field Suitability & Sowing Method",
        "text": "Direct Seeded Rice (DSR) using the Tar-Wattar technique requires medium to heavy textured soils (loam to clay loam) that have been laser levelled. Do not sow DSR in light sandy soils or soils with non-rice previous crops like cotton, maize, or sugarcane due to acute iron deficiency. Use 8 to 10 kg certified seed per acre drilled with a DSR machine having inclined plates and press wheels."
    },
    {
        "doc_id": "pau_kharif_dsr_2025",
        "title": "PAU Direct Seeded Rice (DSR / Tar-Wattar) Technology",
        "lang": "en",
        "region": "punjab",
        "page": 33,
        "section": "Weed Management in DSR",
        "text": "Weed management is vital in DSR. Spray pendimethalin 30 EC at 1000 ml per acre dissolved in 200 litres of water within 24 hours of sowing when adequate soil moisture exists. If post-emergence broadleaf or grass weeds emerge 20 to 25 days after sowing, spray bispyribac-sodium 10 SC at 100 ml per acre."
    },
    {
        "doc_id": "pau_kharif_salinity_2025",
        "title": "PAU Soil & Water Salinity Advisory for Rice",
        "lang": "en",
        "region": "south_west_punjab",
        "page": 14,
        "section": "Saline Soil & Brackish Water Advisory",
        "text": "In saline, sodic, or kallar soils, or where tubewell water has high electrical conductivity or residual sodium carbonate, AWD is strictly NOT recommended. Allowing the field to dry causes upward capillary movement of salts into the plant root zone, leading to seedling mortality. Keep such fields continuously moist or shallow flooded to dilute salts."
    },
    {
        "doc_id": "pau_kharif_nutrition_2025",
        "title": "PAU Micronutrient Management in Paddy",
        "lang": "en",
        "region": "punjab",
        "page": 40,
        "section": "Zinc and Iron Deficiency Management",
        "text": "Zinc deficiency causes khaira disease with rusty brown pigmentation on lower leaves 2 to 3 weeks after transplanting. Broadcast 25 kg zinc sulphate heptahydrate 21 percent per acre. For iron deficiency in DSR appearing as yellowing of young leaves, spray 1 percent ferrous sulphate (1 kg ferrous sulphate in 100 litres of water) 2 to 3 times at weekly intervals."
    }
]

def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS chunks")
    cursor.execute("""
        CREATE TABLE chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT NOT NULL,
            title TEXT NOT NULL,
            lang TEXT NOT NULL,
            region TEXT NOT NULL,
            page INTEGER,
            section TEXT,
            text TEXT NOT NULL
        )
    """)
    for p in PAU_KHARIF_PASSAGES:
        cursor.execute(
            "INSERT INTO chunks (doc_id, title, lang, region, page, section, text) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (p["doc_id"], p["title"], p["lang"], p["region"], p["page"], p["section"], p["text"])
        )
    conn.commit()
    conn.close()
    print(f"SUCCESS: Ingested {len(PAU_KHARIF_PASSAGES)} official PAU passages into {DB_PATH}")

if __name__ == "__main__":
    init_db()
