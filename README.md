# FarmPlan v2: Water-Smart Paddy Advisor for Small Farmers

FarmPlan v2 is a farmer-first, software-only, low-cost advisory tool for small and marginal paddy farmers in Punjab.
It helps farmers adopt water-saving methods (AWD irrigation scheduling and DSR evaluation) and provides grounded official agronomic guidance in Punjabi, Hindi, and English.

## Structure
- `web/`: Tier 1 client-side mobile-first web app (PWA) with zero server requirement.
- `api/`: Tier 2 grounded RAG assistant and Tier 3 narrow crop doctor backend (FastAPI).
- `docs/`: Build specifications, technical guides, and source citations.
- `tools/`: Build scripts for translation validation and pre-generated audio.
