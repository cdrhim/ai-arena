const ARABIC_COUNTRIES = new Set([
  "AE", "BH", "DZ", "EG", "IQ", "JO", "KW", "LB", "LY", "MA", "MR", "OM", "PS", "QA", "SA", "SD", "SO", "SY", "TN", "YE"
]);

const CHINESE_COUNTRIES = new Set(["CN", "HK", "MO", "TW"]);

export function recommendedPublicBriefLanguage(countryCode) {
  const country = String(countryCode || "").trim().toUpperCase();
  if (!country) return "";
  if (country === "KR") return "ko";
  if (country === "JP") return "ja";
  if (ARABIC_COUNTRIES.has(country)) return "ar";
  if (CHINESE_COUNTRIES.has(country)) return "zh";
  return "en";
}

export function netlifyCountryCode(context = {}) {
  return String(context?.geo?.country?.code || context?.geo?.country?.countryCode || "").trim().toUpperCase();
}
