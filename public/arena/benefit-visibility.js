const DISCUSSION_MARKERS = [
  /(?:논의|협의)\s*중/u,
  /\b(?:under|in)\s+(?:discussion|negotiation)\b/i,
  /\b(?:tbd|tbc)\b/i
];

export function isBenefitReadyForDisplay(benefit = {}) {
  const eligibility = Array.isArray(benefit.eligibility) ? benefit.eligibility : [];
  const searchableText = [benefit.title, benefit.value, benefit.description, ...eligibility]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value))
    .join(" ")
    .normalize("NFKC");

  return !DISCUSSION_MARKERS.some((marker) => marker.test(searchableText));
}
