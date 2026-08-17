const PROVIDER_GENERATE_CONTENT_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_PROVIDER_MODEL = "gemini-2.5-flash";
const MAX_COMPANIES = 60;

export async function buildCollaborationFitReasons(input = {}, options = {}) {
  const subjectLabel = plain(input.subjectLabel, 180) || "현재 계정";
  const companies = safeCompanies(input.companies);
  if (!companies.length) throw statusError("선정 이유를 정리할 협업 적합 기업이 없습니다.", 400);

  const fallback = companies.map((company) => ({
    id: company.id,
    reason: fallbackReason(company)
  }));
  const env = options.env || process.env;
  const apiKey = String(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "").trim();
  const model = String(
    env.GEMINI_COLLABORATION_MODEL || env.GEMINI_COMPARE_MODEL || DEFAULT_PROVIDER_MODEL
  ).trim();
  if (!apiKey) return { items: fallback, source: "deterministic_fallback", model: null };

  try {
    const generated = await callProvider({
      subjectLabel,
      companies,
      apiKey,
      model,
      fetchImpl: options.fetchImpl || fetch,
      timeoutMs: options.timeoutMs || 12_000
    });
    return {
      items: validateGeneratedItems(generated?.items, companies, fallback),
      source: "spark_ai",
      model: null
    };
  } catch (error) {
    console.warn("[collaboration-fit-reasons] Clawee provider request failed", {
      model,
      message: bounded(error?.message || "Unknown AI provider error", 220)
    });
    return { items: fallback, source: "deterministic_fallback", model: null };
  }
}

export function safeCompanies(companies = []) {
  const byId = new Map();
  for (const source of Array.isArray(companies) ? companies.slice(0, MAX_COMPANIES) : []) {
    const id = bounded(source?.id, 120);
    const name = plain(source?.name, 240);
    if (!id || !name || byId.has(id)) continue;
    byId.set(id, {
      id,
      name,
      score: Math.max(0, Math.min(100, Math.round(Number(source?.score || 0)))),
      fitReason: plain(source?.fitReason || source?.reason, 180),
      evidence: uniqueList(source?.evidence, 3, 220)
    });
  }
  return [...byId.values()];
}

export function fallbackReason(company = {}) {
  return oneSentence(collaborationUseSuggestion(company));
}

export function collaborationUseSuggestion(company = {}) {
  const context = [company.fitReason, ...(Array.isArray(company.evidence) ? company.evidence : [])]
    .map((item) => plain(item, 220).toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (/health|medical|의료|헬스|건강|바이오/u.test(context)) {
    return "실사용 환경에서 안전성과 운영 적합성을 함께 확인할 실증 후보입니다.";
  }
  if (/advert|adtech|광고|마케팅|캠페인/u.test(context)) {
    return "캠페인 제작·운영의 한 구간부터 효과를 비교할 후보입니다.";
  }
  if (/human resource|hrtech|인사|채용|조직/u.test(context)) {
    return "내부 담당자가 반복하는 절차부터 적용 범위를 좁혀 검토하기 좋습니다.";
  }
  if (/manufactur|factory|제조|공장|생산|설비/u.test(context)) {
    return "현장 한 공정의 기준선과 개선 효과를 비교하는 실증부터 논의하기 좋습니다.";
  }
  if (/document|문서|계약|ocr|지식/u.test(context)) {
    return "대표 문서 유형 하나로 정확도와 처리 시간을 먼저 검증하기 좋습니다.";
  }
  if (/security|보안|위협|탐지|리스크/u.test(context)) {
    return "제한된 환경에서 탐지 기준과 대응 절차를 함께 검증할 후보입니다.";
  }
  if (/saas|api|연동|platform|플랫폼/u.test(context)) {
    return "기존 시스템의 한 업무 흐름에 붙이는 소규모 실증부터 검토하기 좋습니다.";
  }
  if (/agent|에이전트|자동화|workflow|워크플로/u.test(context)) {
    return "반복 작업 한 단계부터 맡겨 결과 품질과 운영 부담을 비교하기 좋습니다.";
  }
  return "현재 과제를 작은 실증으로 구체화할 때 먼저 대화해 볼 후보입니다.";
}

async function callProvider({ subjectLabel, companies, apiKey, model, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const ids = companies.map((company) => company.id);
  try {
    const response = await fetchImpl(`${PROVIDER_GENERATE_CONTENT_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: "당신은 SparkClaw AI Arena의 협업 후보 편집자입니다. 제공된 공개 프로필 매칭 근거만 사용해 각 기업과 시도할 수 있는 구체적인 협업 활용 또는 첫 검토 방법을 한국어 한 문장으로 작성하세요. 화면에 fitReason이 이미 별도로 표시되므로 fitReason의 기술명·산업명·단계명이나 같은 명사구를 문장에 다시 쓰지 마세요. 근거를 반복 설명하지 말고, 이를 전제로 어떤 범위의 실증·대화·확인을 시작하면 좋은지만 쓰세요. 점수 자체를 이유로 쓰거나 새로운 실적·고객·기술을 추정하지 마세요. 기업명, 모델명, 공급자명, HTML, 마크다운은 문장에 넣지 마세요. 각 문장은 100자 이내이며 정확히 한 문장이어야 합니다. 지정된 JSON만 반환하세요."
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: `현재 계정: ${subjectLabel}\n다음 협업 후보의 공개 매칭 근거를 한 문장씩 정리하세요.\n${JSON.stringify({ companies })}`
          }]
        }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: Math.min(8192, Math.max(1000, companies.length * 90)),
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                minItems: companies.length,
                maxItems: companies.length,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "reason"],
                  properties: {
                    id: { type: "string", enum: ids },
                    reason: { type: "string" }
                  }
                }
              }
            }
          }
        }
      })
    });
    const payload = await safeJson(response);
    if (!response.ok) throw new Error(payload?.error?.message || "Collaboration reason generation failed.");
    const content = (payload?.candidates?.[0]?.content?.parts || [])
      .map((part) => part?.text || "")
      .join("")
      .trim();
    if (!content) throw new Error("AI provider returned an empty collaboration reason response.");
    return parseJsonObject(content);
  } finally {
    clearTimeout(timer);
  }
}

function validateGeneratedItems(items, companies, fallbackItems) {
  const generatedById = new Map((Array.isArray(items) ? items : [])
    .map((item) => [bounded(item?.id, 120), item]));
  const companyById = new Map(companies.map((company) => [company.id, company]));
  return fallbackItems.map((fallback) => {
    const company = companyById.get(fallback.id) || {};
    const generated = oneSentence(generatedById.get(fallback.id)?.reason);
    return {
      id: fallback.id,
      reason: generated && !repeatsDisplayedBasis(generated, company) ? generated : fallback.reason
    };
  });
}

function repeatsDisplayedBasis(reason, company = {}) {
  const displayedTokens = meaningfulTokens(company.fitReason);
  if (!displayedTokens.length) return false;
  const reasonTokens = new Set(meaningfulTokens(reason));
  return displayedTokens.some((token) => reasonTokens.has(token));
}

function meaningfulTokens(value) {
  const stop = new Set(["기반", "적용", "단계", "역량", "일치", "근거", "현재", "검토", "후보"]);
  return plain(value, 220)
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stop.has(token));
}

function oneSentence(value) {
  const providerName = ["g", "e", "m", "i", "n", "i"].join("");
  let result = plain(value, 130)
    .replace(new RegExp(providerName, "giu"), "Clawee 클로이")
    .replace(/[\r\n]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const boundary = result.search(/[.!?。！？](?=\s|$)/u);
  if (boundary >= 0) result = result.slice(0, boundary + 1).trim();
  if (result && !/[.!?。！？]$/u.test(result)) result += ".";
  return result.slice(0, 140);
}

function uniqueList(input, limit, maxLength) {
  return [...new Set((Array.isArray(input) ? input : [])
    .map((item) => plain(item, maxLength))
    .filter(Boolean))]
    .slice(0, limit);
}

function plain(value, maxLength) {
  return bounded(value, maxLength)
    .replace(/<[^>]*>/gu, " ")
    .replace(/&(?:nbsp|amp|lt|gt);/giu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function parseJsonObject(value) {
  const text = String(value || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI provider response did not include JSON.");
    return JSON.parse(text.slice(start, end + 1));
  }
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

function bounded(value, maxLength) {
  return String(value || "").normalize("NFKC").trim().slice(0, maxLength);
}

function statusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
