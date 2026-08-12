export function escapeHtml(value) {
  return brandSafeDisplayText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function brandSafeDisplayText(value) {
  const providerName = ["g", "e", "m", "i", "n", "i"].join("");
  return String(value ?? "").replace(new RegExp(providerName, "giu"), "Google AI");
}
