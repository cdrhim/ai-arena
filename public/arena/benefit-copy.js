const BLOCK_TAGS = /<\s*\/?\s*(?:address|article|aside|blockquote|br|div|h[1-6]|li|ol|p|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/giu;
const OTHER_TAGS = /<\s*\/?\s*[a-z][^>]*>/giu;
const HIDDEN_HTML = /<\s*(script|style|template|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/giu;
const HTML_COMMENT = /<!--[\s\S]*?-->/gu;
const ENTITY = /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|nbsp|quot));/giu;
const SUMMARY_LIMIT = 220;

const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

const EMPTY_OR_BOILERPLATE = [
  /^설명이?\s*(?:아직\s*)?입력되지\s*않았습니다[.!]?$/u,
  /^혜택\s*상세(?:\s*정보)?\s*확인[.!]?$/u,
  /^세부\s*자격은\s*운영진\s*확인\s*후\s*안내합니다[.!]?$/u,
  /^운영진이\s*신청\s*방법을\s*안내합니다[.!]?$/u,
  /^신청\s*의사를\s*남기면\s*운영진이\s*제공사별\s*신청\s*경로와\s*다음\s*단계를\s*안내합니다[.!]?$/u
];

export function plainBenefitText(value) {
  if (value === undefined || value === null) return "";
  let normalized = String(value).normalize("NFKC");
  for (let pass = 0; pass < 2; pass += 1) {
    normalized = normalized.replace(ENTITY, (_match, decimal, hexadecimal, named) =>
      decodeEntity(decimal, hexadecimal, named)
    );
  }
  return normalized
    .replace(HTML_COMMENT, " ")
    .replace(HIDDEN_HTML, " ")
    .replace(BLOCK_TAGS, " · ")
    .replace(OTHER_TAGS, " ")
    .replace(/[•●▪◦]/gu, " · ")
    .replace(/\s*[|]\s*/gu, " · ")
    .replace(/(?:\s*·\s*){2,}/gu, " · ")
    .replace(/\s+/gu, " ")
    .replace(/^\s*[·,;:\-]+|[·,;:\-]+\s*$/gu, "")
    .trim();
}

export function summarizeBenefit(benefit = {}) {
  const provider = plainBenefitText(benefit.provider || benefit.title);
  const candidates = [
    ...factsFrom(benefit.value, 0),
    ...factsFrom(benefit.description, 2),
    ...(Array.isArray(benefit.eligibility) ? benefit.eligibility.flatMap((item) => factsFrom(item, 1)) : []),
    ...factsFrom(benefit.applicationInstructions, 3)
  ]
    .map((item, index) => ({ ...item, index, text: naturalizeFact(item.text, provider) }))
    .filter((item) => item.text && !EMPTY_OR_BOILERPLATE.some((pattern) => pattern.test(item.text)))
    .map((item) => ({
      ...item,
      priority: item.priority + (isEligibilityFact(item.text) ? -1 : 0)
    }));

  const unique = [];
  for (const candidate of candidates) {
    const key = canonical(candidate.text);
    if (!key || unique.some((item) => sameFact(key, item.key))) continue;
    unique.push({ ...candidate, key });
  }

  unique.sort((left, right) => left.priority - right.priority || left.index - right.index);
  const summary = fitFacts(unique.map((item) => item.text), SUMMARY_LIMIT);
  if (summary) return summary;

  return naturalizeFact(plainBenefitText(benefit.title || benefit.category), provider) || "제공 조건이 확인된 회원 혜택입니다.";
}

function factsFrom(value, priority) {
  const text = plainBenefitText(value);
  if (!text) return [];
  const chooseOne = /(?:\(\s*택\s*1\s*\)|(?:^|[\s·])택\s*1(?:$|[\s:：·]))/u.test(text);
  const normalized = text
    .replace(/\(\s*택\s*1\s*\)\s*/gu, "")
    .replace(/^택\s*1\s*[:：-]?\s*/u, "");
  const facts = normalized
    .split(/\s*·\s*|\s+(?=(?:[-–—]|\d+[.)])\s+)/gu)
    .map((part) => part.replace(/^\s*(?:[-–—]|\d+[.)])\s*/u, "").trim())
    .filter(Boolean);
  if (chooseOne && facts.length) facts[0] = `둘 중 하나 선택: ${facts[0]}`;
  return facts.map((part) => ({ text: part, priority }));
}

function naturalizeFact(value, provider) {
  let text = plainBenefitText(value)
    .replace(/^\s*(?:혜택(?:\s*내용)?|제공\s*혜택)\s*[:：-]\s*/u, "")
    .replace(/\bgithub\b/giu, "GitHub")
    .replace(/\bcredits?\b/giu, "크레딧")
    .replace(/\bseries\s*([a-z])\b/giu, (_match, stage) => `시리즈 ${stage.toUpperCase()}`)
    .replace(/\$\s*([\d,.]+)/gu, "미화 $1달러")
    .replace(/\b26년\s*(\d{1,2})월/gu, "2026년 $1월")
    .replace(/채용건당/gu, "채용 건당")
    .replace(/계약후/gu, "계약 후")
    .replace(/(\d+인실)\s*이하\s*:\s*인당\s*(\d+)\s*크레딧/gu, "$1 이하는 인당 $2크레딧")
    .replace(/(\d+인실)\s*이상\s*:\s*인당\s*(\d+)\s*크레딧/gu, "$1 이상은 인당 $2크레딧")
    .replace(/최종\s*선정팀\s*Scaler/giu, "최종 선정된 Scaler 팀 대상")
    .replace(/(크레딧)\s+(?=\d+인실)/gu, "$1 · ")
    .replace(/\s+([,.)%])/gu, "$1")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+/gu, " ")
    .trim();

  if (/github/iu.test(provider) && /크레딧/u.test(text) && !/github/iu.test(text)) {
    text = text.replace(/크레딧/u, "GitHub 크레딧");
  }
  if (/github/iu.test(provider) && /최대\s*12개월간/u.test(text) && /미화\s*10,000달러/u.test(text)) {
    text = "최대 12개월간 미화 10,000달러 상당의 GitHub 크레딧";
  }
  return text.replace(/[.;]+$/gu, "");
}

function isEligibilityFact(text) {
  return /(?:자격|대상|이하|미만|이내|신규|설립|파트너|프로그램\s*참여)/iu.test(text);
}

function canonical(value) {
  return value.toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]+/gu, "");
}

function sameFact(left, right) {
  return left === right || (Math.min(left.length, right.length) >= 16 && (left.includes(right) || right.includes(left)));
}

function fitFacts(facts, limit) {
  let result = "";
  for (const fact of facts) {
    if (!fact) continue;
    const next = result ? `${result} · ${fact}` : fact;
    if (next.length <= limit) {
      result = next;
      continue;
    }
    if (!result) result = truncateFact(fact, limit);
  }
  return result;
}

function truncateFact(value, limit) {
  if (value.length <= limit) return value;
  const clipped = value.slice(0, limit - 1);
  const wordBoundary = clipped.lastIndexOf(" ");
  return `${(wordBoundary >= limit * 0.65 ? clipped.slice(0, wordBoundary) : clipped).trim()}…`;
}

function decodeEntity(decimal, hexadecimal, named) {
  if (named) return NAMED_ENTITIES[named.toLowerCase()] || "";
  const codePoint = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return "";
  }
  return String.fromCodePoint(codePoint);
}
