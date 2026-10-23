/**
 * web/src/i18n.js
 * Lightweight internationalization with fallback to English.
 */

let currentLang = "pa";
const cache = {};

export async function initI18n(lang = "pa") {
  currentLang = lang;
  // Always load English as baseline fallback
  if (!cache["en"]) {
    cache["en"] = await loadStrings("en");
  }
  if (!cache[lang]) {
    cache[lang] = await loadStrings(lang);
  }
  document.documentElement.lang = lang;
}

export async function setLanguage(lang) {
  currentLang = lang;
  if (!cache[lang]) {
    cache[lang] = await loadStrings(lang);
  }
  document.documentElement.lang = lang;
  applyI18n();
}

export function getCurrentLanguage() {
  return currentLang;
}

async function loadStrings(lang) {
  try {
    const res = await fetch(`./data/strings.${lang}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`Failed to load strings for ${lang}:`, err);
    return {};
  }
}

export function t(key, params = {}) {
  const currentDict = cache[currentLang] || {};
  const fallbackDict = cache["en"] || {};

  let text = currentDict[key] ?? fallbackDict[key] ?? key;

  // Substitute {placeholder}
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return text;
}

export function applyI18n(root = document) {
  // Update inner text
  const elements = root.querySelectorAll("[data-i18n]");
  elements.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });

  // Update input placeholders
  const placeholderEls = root.querySelectorAll("[data-i18n-placeholder]");
  placeholderEls.forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      el.setAttribute("placeholder", t(key));
    }
  });
}
