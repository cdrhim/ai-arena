export function sectorCompanyNames(teams = [], sectorName = "", limit = 40) {
  const target = normalizeSector(sectorName);
  if (!target) return [];
  const names = [];
  const seen = new Set();
  for (const team of Array.isArray(teams) ? teams : []) {
    const matches = sectorTokens(team?.sector || team?.category).some((sector) => normalizeSector(sector) === target);
    if (!matches) continue;
    const name = String(team?.name || team?.companyName || "").trim();
    const key = name.toLocaleLowerCase("ko");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.sort((left, right) => left.localeCompare(right, "ko")).slice(0, Math.max(1, Number(limit) || 40));
}

export function sectorTokens(value) {
  return String(value || "")
    .split(/[,/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSector(value) {
  return String(value || "").trim().toLocaleLowerCase("ko");
}
