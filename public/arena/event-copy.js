const HTML_COMMENT = /<!--[\s\S]*?-->/gu;
const HIDDEN_HTML = /<\s*(script|style|template|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/giu;
const BREAK_TAG = /<\s*br\b[^>]*>/giu;
const LIST_ITEM_OPEN = /<\s*li\b[^>]*>/giu;
const LIST_ITEM_CLOSE = /<\s*\/\s*li\s*>/giu;
const BLOCK_TAG = /<\s*\/?\s*(?:address|article|aside|blockquote|div|h[1-6]|ol|p|section|table|tbody|tfoot|thead|tr|ul)\b[^>]*>/giu;
const TABLE_CELL_TAG = /<\s*\/?\s*(?:td|th)\b[^>]*>/giu;
const OTHER_TAG = /<\s*\/?\s*[a-z][^>]*>/giu;
const ENTITY = /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|nbsp|quot));/giu;
const EMAIL = /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/giu;
const PHONE = /(?<!\d)(?:(?:\+?82[\s.-]?(?:\(\s*0\s*\)[\s.-]?)?\d{1,2})|(?:\(\s*0\d{1,2}\s*\)|0\d{1,2}))[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/gu;
const BOOKING_HEADING = /^(?:booked\s*by|예약자(?:\s*정보)?|신청자\s*정보|담당자\s*(?:정보|연락처)?)\s*:?\s*$/iu;
const COMPANY_HEADING = /^(?:회사명(?:\s*\/\s*서비스명)?|서비스명|company(?:\s*\/\s*service)?(?:\s*name)?)\s*:?\s*$/iu;

const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

export function plainEventDescription(value) {
  if (value === undefined || value === null) return "";

  let description = String(value).normalize("NFKC");
  for (let pass = 0; pass < 2; pass += 1) {
    description = description.replace(ENTITY, (_match, decimal, hexadecimal, named) =>
      decodeEntity(decimal, hexadecimal, named)
    );
  }

  const lines = description
    .replace(HTML_COMMENT, " ")
    .replace(HIDDEN_HTML, " ")
    .replace(/\r\n?/gu, "\n")
    .replace(BREAK_TAG, "\n")
    .replace(LIST_ITEM_OPEN, "\n• ")
    .replace(LIST_ITEM_CLOSE, "\n")
    .replace(TABLE_CELL_TAG, " · ")
    .replace(BLOCK_TAG, "\n")
    .replace(OTHER_TAG, " ")
    .split("\n")
    .map(normalizeLine);

  return withoutBookingContact(lines)
    .map(redactContactDetails)
    .map(normalizeLine)
    .filter(Boolean)
    .join("\n");
}

function withoutBookingContact(lines) {
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!BOOKING_HEADING.test(lines[index])) {
      result.push(lines[index]);
      continue;
    }

    const companyHeadingIndex = findCompanyHeading(lines, index + 1);
    if (companyHeadingIndex !== -1) {
      index = companyHeadingIndex;
      continue;
    }

    let contactLinesRemoved = 0;
    while (index + 1 < lines.length && contactLinesRemoved < 4) {
      const candidate = lines[index + 1];
      if (!candidate) {
        index += 1;
        if (contactLinesRemoved) break;
        continue;
      }
      if (contactLinesRemoved === 0 || containsContactDetails(candidate)) {
        index += 1;
        contactLinesRemoved += 1;
        continue;
      }
      break;
    }
  }
  return result;
}

function findCompanyHeading(lines, startIndex) {
  const endIndex = Math.min(lines.length, startIndex + 10);
  for (let index = startIndex; index < endIndex; index += 1) {
    if (COMPANY_HEADING.test(lines[index])) return index;
  }
  return -1;
}

function containsContactDetails(value) {
  EMAIL.lastIndex = 0;
  PHONE.lastIndex = 0;
  return EMAIL.test(value) || PHONE.test(value);
}

function redactContactDetails(value) {
  EMAIL.lastIndex = 0;
  PHONE.lastIndex = 0;
  return value
    .replace(EMAIL, "")
    .replace(PHONE, "")
    .replace(/\(\s*\)|\[\s*\]/gu, " ")
    .replace(/\s*([,;|])\s*(?=$|[,;|])/gu, " ");
}

function normalizeLine(value) {
  return String(value || "")
    .replace(/[\t\f\v ]+/gu, " ")
    .replace(/^\s*(?:[·|]\s*)+|\s*(?:[·|]\s*)+$/gu, "")
    .trim();
}

function decodeEntity(decimal, hexadecimal, named) {
  if (named) return NAMED_ENTITIES[named.toLowerCase()] || "";
  const codePoint = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
  if (
    !Number.isFinite(codePoint) ||
    codePoint < 0 ||
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  ) {
    return "";
  }
  return String.fromCodePoint(codePoint);
}
