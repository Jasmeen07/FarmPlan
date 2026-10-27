"""
api/rag/ingest.py
Build-time and startup corpus ingestion for FarmPlan v2.
Populates api/data/chunks.sqlite with clean, sectioned passages from official PAU guidance.
Includes full traceable source metadata (Organization, Publication, Year, Safety Conditions).
"""

import sqlite3
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "chunks.sqlite"

PAU_KHARIF_PASSAGES = [
    {
        "doc_id": "pau_kharif_water_2024",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 24,
        "section": "Establishment Stage Water Management",
        "safety_conditions": "First 15 days require continuous shallow standing water (3-5 cm) to suppress weeds and anchor roots.",
        "text": "For the first 15 days after transplanting, keep 3 to 5 cm shallow standing water in the field. This prevents drying of nursery seedling roots, suppresses early weed germination, and ensures rapid tillering."
    },
    {
        "doc_id": "pau_kharif_water_2024",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 25,
        "section": "Vegetative Tillering & Alternate Wetting and Drying (AWD)",
        "safety_conditions": "Do NOT allow hairline cracks to develop. Intermittent drying allowed only in non-saline, medium-heavy soils.",
        "text": "During tillering, practice Alternate Wetting and Drying (AWD). Apply 5 to 7 cm irrigation only 2 days after the ponded water has completely infiltrated and disappeared from the soil surface. Do not allow hairline cracks to develop. This intermittent drying saves 15 to 30 percent irrigation water (about 5 to 7 tubewell irrigations) without any reduction in paddy grain yield."
    },
    {
        "doc_id": "pau_kharif_water_2024",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 25,
        "section": "Panicle Initiation to Flowering (Critical Period)",
        "safety_conditions": "STRICT WARNING: Never allow the field to dry during flowering. Continuous 5 cm standing water required.",
        "text": "From panicle initiation (nissar) until flowering completion, rice is most sensitive to moisture stress. Never allow the field to dry during flowering. Continuous shallow standing water of 5 cm must be maintained. Moisture stress at flowering causes flower abortion and empty, chaffy grains."
    },
    {
        "doc_id": "pau_kharif_water_2024",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 26,
        "section": "Grain Filling & Milky Stage",
        "safety_conditions": "Deep flooding is not needed. Saturated to moist soil conditions sufficient.",
        "text": "During grain filling (milky and dough stages), irrigate when surface water has subsided. Deep flooding is not needed. Saturated to moist soil conditions allow optimal carbohydrate translocation into developing grains."
    },
    {
        "doc_id": "pau_kharif_water_2024",
        "title": "PAU Package of Practices: Rice Water Management & AWD",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 27,
        "section": "Irrigation Termination Before Harvest",
        "safety_conditions": "Stop all irrigation 14 to 15 days before combine harvesting to prevent lodging and grain staining.",
        "text": "Stop all irrigation 14 to 15 days before combine harvesting. This promotes uniform grain maturity, allows the soil surface to harden for harvester machinery, and avoids lodging and grain discoloration."
    },
    {
        "doc_id": "pau_kharif_dsr_2024",
        "title": "PAU Direct Seeded Rice (DSR / Tar-Wattar) Technology",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "PAU Research Bulletin: Tar-Wattar Direct Seeded Rice (DSR) 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 31,
        "section": "Field Suitability & Sowing Method",
        "safety_conditions": "STRICT EXCLUSIONS: Do NOT sow DSR on light sandy soils or where previous crops were cotton, maize, or sugarcane (severe iron chlorosis risk).",
        "text": "Direct Seeded Rice (DSR) using the Tar-Wattar technique requires medium to heavy textured soils (loam to clay loam) that have been laser levelled. Do not sow DSR in light sandy soils or soils with non-rice previous crops like cotton, maize, or sugarcane due to acute iron deficiency. Use 8 to 10 kg certified seed per acre drilled with a DSR machine having inclined plates and press wheels."
    },
    {
        "doc_id": "pau_kharif_dsr_2024",
        "title": "PAU Direct Seeded Rice (DSR / Tar-Wattar) Technology",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "PAU Research Bulletin: Tar-Wattar Direct Seeded Rice (DSR) 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 33,
        "section": "Weed Management in DSR",
        "safety_conditions": "Pre-emergence spray required within 24 hours of sowing in tar-wattar moisture.",
        "text": "Weed management is vital in DSR. Spray pendimethalin 30 EC at 1000 ml per acre dissolved in 200 litres of water within 24 hours of sowing when adequate soil moisture exists. If post-emergence broadleaf or grass weeds emerge 20 to 25 days after sowing, spray bispyribac-sodium 10 SC at 100 ml per acre."
    },
    {
        "doc_id": "pau_kharif_salinity_2024",
        "title": "PAU Soil & Water Salinity Advisory for Rice",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "PAU Salinity and Ground Water Quality Advisory Bulletin 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "south_west_punjab",
        "page": 14,
        "section": "Saline Soil & Brackish Water Advisory",
        "safety_conditions": "STRICT BAN: In saline/sodic/kallar soils or brackish water, AWD is strictly prohibited. Drying causes fatal salt encrustation.",
        "text": "In saline, sodic, or kallar soils, or where tubewell water has high electrical conductivity or residual sodium carbonate, AWD is strictly NOT recommended. Allowing the field to dry causes upward capillary movement of salts into the plant root zone, leading to seedling mortality. Keep such fields continuously moist or shallow flooded to dilute salts."
    },
    {
        "doc_id": "pau_kharif_nutrition_2024",
        "title": "PAU Micronutrient Management in Paddy",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 40,
        "section": "Zinc and Iron Deficiency Management",
        "safety_conditions": "Do NOT confuse zinc deficiency (khaira) with fungal blast. Spray ferrous sulphate for iron chlorosis.",
        "text": "Zinc deficiency causes khaira disease with rusty brown pigmentation on lower leaves 2 to 3 weeks after transplanting. Broadcast 25 kg zinc sulphate heptahydrate 21 percent per acre. For iron deficiency in DSR appearing as yellowing of young leaves, spray 1 percent ferrous sulphate (1 kg ferrous sulphate in 100 litres of water) 2 to 3 times at weekly intervals."
    },
    {
        "doc_id": "pau_kharif_varieties_2024",
        "title": "PAU Recommended Paddy Varieties",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 12,
        "section": "Short vs Long Duration Varieties",
        "safety_conditions": "Pusa 44 is officially banned/discouraged by Punjab Government due to severe groundwater depletion.",
        "text": "PR 126 is a short-duration variety maturing in 93 days after transplanting (123 days from seeding). It saves 20 to 25 percent water and produces 30 quintals per acre. PR 131 matures in 110 days with high yield and lodging tolerance. PR 128 matures in 111 days. Pusa 44 is strongly unrecommended by Punjab Government due to its long 130-day duration, massive groundwater depletion, and late harvest that exacerbates stubble burning."
    },
    {
        "doc_id": "pau_kharif_sowing_dates_2024",
        "title": "Punjab Subsoil Water Act: Sowing & Transplanting Windows",
        "source_org": "Government of Punjab / Department of Agriculture & PAU",
        "publication": "Punjab Preservation of Subsoil Water Act 2008 & Statutory Sowing Dates 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 8,
        "section": "District Zones and Legal Transplanting Dates",
        "safety_conditions": "LEGAL RESTRICTION: Transplanting before June 11 (Zone 1) or June 20 (Zone 2) is punishable under Punjab law.",
        "text": "Under the Punjab Preservation of Subsoil Water Act, nursery sowing starts after May 15 for DSR and May 20 for nursery. Transplanting dates: Zone 1 (Bathinda, Faridkot, Fazilka, Ferozepur, Mansa, Sri Muktsar Sahib) begins on June 11. Zone 2 (central and northern districts including Ludhiana, Jalandhar, Amritsar, Patiala, Sangrur) begins on June 20. Transplanting before official notification is legally prohibited to curb summer groundwater depletion."
    },
    {
        "doc_id": "pau_kharif_nursery_2024",
        "title": "PAU Package of Practices: Nursery Management",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 18,
        "section": "Seed Rate and Treatment for Nursery",
        "safety_conditions": "Chemical seed treatment mandatory before sowing nursery to eliminate bacterial and fungal seed-borne pathogens.",
        "text": "For transplanting one acre of paddy, sow 8 kg certified seed in 1 marla (25 square metres) nursery area. Treat seed by soaking in a solution of 10 g carbendazim 50 WP and 1 g streptocycline in 10 litres water for 8 to 10 hours. Transplant 25 to 30 day old seedlings at 2 to 3 seedlings per hill with 20 by 15 cm spacing (33 hills per square metre)."
    },
    {
        "doc_id": "pau_kharif_fertilizer_2024",
        "title": "PAU Package of Practices: Fertilizer Management",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 21,
        "section": "Urea and Nitrogen Application Splits",
        "safety_conditions": "RESTRICTION: Do NOT apply urea after panicle initiation. Excessive nitrogen attracts stem borer and BLB.",
        "text": "For medium fertility soils, apply 110 kg urea (50 kg N) per acre for short varieties like PR 126 and 130 kg urea for medium varieties in three equal splits: one-third at puddling, one-third at 21 days, and one-third at 42 days after transplanting. Do not apply urea after panicle initiation. Apply 27 kg DAP or 75 kg single superphosphate if soil test shows low phosphorus."
    },
    {
        "doc_id": "pau_kharif_weeds_transplant_2024",
        "title": "PAU Weed Control in Transplanted Rice",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 28,
        "section": "Pre-emergence and Post-emergence Herbicides",
        "safety_conditions": "Pretilachlor/butachlor must be applied in 4-5 cm standing water within 2-3 days of transplanting.",
        "text": "Apply pretilachlor 50 EC at 600 ml per acre or butachlor 50 EC at 1200 ml per acre mixed with 60 kg sand within 2 to 3 days of transplanting in 4 to 5 cm standing water. For control of swank and motha after weed emergence (20 to 25 days), spray bispyribac-sodium 10 SC at 100 ml per acre dissolved in 150 litres of water."
    },
    {
        "doc_id": "pau_kharif_pest_bph_2024",
        "title": "PAU Insect Pest Management: Brown Plant Hopper",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 50,
        "section": "Brown Plant Hopper (BPH) & Hopper Burn",
        "safety_conditions": "Threshold: 5 hoppers per hill. Intermittent drying via AWD suppresses hopper multiplication.",
        "text": "Brown plant hoppers suck sap from tiller bases, turning crops brown and dry in circular patches called hopper burn. To prevent BPH: practice AWD (intermittent drying keeps humidity low), leave 30 cm alleyways every 3 metres, and do not over-apply urea. If hoppers exceed 5 per hill, spray triflumezopyrim 10 SC at 94 ml per acre or pymetrozine 50 WG at 120 g per acre."
    },
    {
        "doc_id": "pau_kharif_pest_leaf_folder_2024",
        "title": "PAU Insect Pest Management: Leaf Folder",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 53,
        "section": "Leaf Folder Threshold and Spray",
        "safety_conditions": "Threshold: 10% damaged leaves. Do not spray prematurely if natural predators are present.",
        "text": "Leaf folder caterpillars fold rice leaves longitudinally and feed on green tissues inside, producing white translucent streaks. Only spray if damaged leaves exceed the economic threshold of 10 percent. Apply flubendiamide 39.35 SC at 20 ml per acre or chlorantraniliprole 18.5 SC at 60 ml per acre in 100 litres of water."
    },
    {
        "doc_id": "pau_kharif_disease_blast_2024",
        "title": "PAU Disease Management: Rice Blast",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 46,
        "section": "Leaf and Neck Blast Symptoms and Control",
        "safety_conditions": "Spray at initial symptom appearance to protect neck and panicle base from rotting.",
        "text": "Rice blast produces spindle-shaped spots with ash-grey centers and dark brown margins. When neck blast strikes, the panicle base rots, turning black and breaking. At initial symptom appearance on upper leaves, spray tricyclazole 75 WP at 120 g per acre or azoxystrobin 18.2 plus difenoconazole 11.4 SC at 200 ml per acre in 200 litres water."
    },
    {
        "doc_id": "pau_kharif_disease_blb_2024",
        "title": "PAU Disease Management: Bacterial Leaf Blight",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 48,
        "section": "Bacterial Blight Cultural Control",
        "safety_conditions": "ANTIBIOTICS INEFFECTIVE: Do NOT use chemicals. Stop urea immediately and drain standing water.",
        "text": "Bacterial Leaf Blight (BLB) shows water-soaked lesions starting at leaf margins and progressing as undulating yellow stripes. When BLB appears, immediately stop urea top-dressing and drain standing water from the field for 2 to 3 days to aerate the soil. Chemical sprays and antibiotics are ineffective and not recommended; cultural control is key."
    },
    {
        "doc_id": "pau_kharif_disease_sheath_2024",
        "title": "PAU Disease Management: Sheath Blight",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 47,
        "section": "Sheath Blight Management",
        "safety_conditions": "Spray only when disease lesion reaches upper third of plant.",
        "text": "Sheath blight causes greyish-green serpentine lesions on leaf sheaths just above the water level under warm humid weather and high plant density. Practice AWD drying intervals to lower humidity. If disease spreads to upper third of plant, spray hexaconazole 5 EC at 200 ml per acre or azoxystrobin 23 SC at 200 ml per acre."
    },
    {
        "doc_id": "pau_kharif_soil_texture_2024",
        "title": "PAU Agronomy: Soil Texture & Irrigation Percolation",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "Package of Practices for the Kharif Crops of Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 22,
        "section": "Soil Texture Impact on AWD and DSR",
        "safety_conditions": "In sandy soils, DSR is not recommended, and AWD drying must not exceed 1 day.",
        "text": "In heavy clay soils (Dakar), water percolation is slow, so 2 days drying after standing water infiltration is optimal. In medium loam soils (Mera), 1 to 2 days drying is safe. In light sandy soils (Raitli), AWD must be practiced with caution with only 1 day drying because water drains very fast and cracks can appear rapidly. DSR is not recommended on sandy soils."
    },
    {
        "doc_id": "pau_kharif_stubble_2024",
        "title": "PAU In-Situ Paddy Residue Management",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana",
        "publication": "PAU In-Situ Crop Residue Management Bulletin 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 60,
        "section": "Happy Seeder & Crop Stubble",
        "safety_conditions": "Zero-tillage into standing residue conserves 1 irrigation and eliminates toxic smog.",
        "text": "Do not burn paddy straw. Direct drilling of wheat using the Happy Seeder or Smart Seeder into standing rice residue without prior tillage conserves 1 irrigation, suppresses weeds, retains soil moisture, and adds 15 to 20 kg nitrogen per acre back into the soil over time."
    },
    {
        "doc_id": "pau_kharif_irrigation_cost_2024",
        "title": "PAU Cost of Cultivation Studies",
        "source_org": "Punjab Agricultural University (PAU), Ludhiana / Dept of Economics",
        "publication": "PAU Studies in the Economics of Farm Management in Punjab, 2024",
        "edition_year": 2024,
        "lang": "en",
        "region": "punjab",
        "page": 65,
        "section": "Tubewell Pumping Costs and AWD Savings",
        "safety_conditions": "Pumping calculations based on 400-500 rupees/irrigation cycle diesel and maintenance cost.",
        "text": "Operating an agricultural tubewell (submersible or monoblock) or diesel engine costs approximately 400 to 500 rupees per irrigation cycle per acre in diesel and equipment maintenance. Conventional transplanted paddy consumes 26 irrigations (approx 11,700 rupees). AWD cuts irrigations to 19, saving 3,150 to 3,500 rupees per acre in pumping expenses alone."
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
            source_org TEXT NOT NULL,
            publication TEXT NOT NULL,
            edition_year INTEGER NOT NULL,
            lang TEXT NOT NULL,
            region TEXT NOT NULL,
            page INTEGER,
            section TEXT,
            safety_conditions TEXT,
            text TEXT NOT NULL
        )
    """)
    for p in PAU_KHARIF_PASSAGES:
        cursor.execute(
            """INSERT INTO chunks (
                doc_id, title, source_org, publication, edition_year,
                lang, region, page, section, safety_conditions, text
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                p["doc_id"], p["title"], p["source_org"], p["publication"], p["edition_year"],
                p["lang"], p["region"], p["page"], p["section"], p["safety_conditions"], p["text"]
            )
        )
    conn.commit()
    conn.close()
    print(f"SUCCESS: Ingested {len(PAU_KHARIF_PASSAGES)} official PAU passages into {DB_PATH}")

def ensure_db_initialized() -> int:
    """
    Checks if chunks.sqlite exists with chunks table and populated rows.
    If missing or empty, runs init_db() immediately to prevent unindexed startup.
    Returns the chunk count.
    """
    try:
        if not DB_PATH.exists():
            init_db()
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'")
        if not cursor.fetchone():
            conn.close()
            init_db()
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM chunks")
        row = cursor.fetchone()
        count = row[0] if row else 0
        conn.close()
        if count == 0:
            init_db()
            return len(PAU_KHARIF_PASSAGES)
        return count
    except Exception as e:
        print(f"Index verification rebuilt chunks database due to: {e}")
        init_db()
        return len(PAU_KHARIF_PASSAGES)

if __name__ == "__main__":
    init_db()
