/**
 * web/src/state.js
 * Manages persistent state (language, district) in localStorage.
 * Everything remains on the farmer's device.
 */

const STORAGE_KEYS = {
  LANG: "farmplan_lang",
  DISTRICT: "farmplan_district",
};

export const DEFAULT_LANG = "pa"; // Default to Punjabi
export const DEFAULT_DISTRICT = "033"; // Default to Ludhiana (Central Punjab / PAU)

export function getStoredState() {
  let lang = DEFAULT_LANG;
  let district = DEFAULT_DISTRICT;
  try {
    const savedLang = localStorage.getItem(STORAGE_KEYS.LANG);
    if (savedLang && ["pa", "hi", "en"].includes(savedLang)) {
      lang = savedLang;
    }
    const savedDistrict = localStorage.getItem(STORAGE_KEYS.DISTRICT);
    if (savedDistrict) {
      district = savedDistrict;
    }
  } catch (err) {
    console.warn("localStorage unavailable, using defaults:", err);
  }
  return { lang, district };
}

export function saveStoredState({ lang, district }) {
  try {
    if (lang) localStorage.setItem(STORAGE_KEYS.LANG, lang);
    if (district) localStorage.setItem(STORAGE_KEYS.DISTRICT, district);
  } catch (err) {
    console.warn("Failed to save to localStorage:", err);
  }
}
