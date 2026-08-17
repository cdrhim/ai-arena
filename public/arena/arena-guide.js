import { initArenaGuideTutorial } from "./arena-guide-tutorial.js?v=ai-arena-20260817-prompt-transfer-v104";

const ALLOWED_PAGES = new Set(["overview", "teams", "discover", "compare", "community", "arena", "workspace"]);

export function initArenaGuide(options = {}) {
  const root = document.querySelector("#arenaGuide");
  const launcher = document.querySelector("#arenaGuideLauncher");
  const panel = document.querySelector("#arenaGuidePanel");
  const close = document.querySelector("#arenaGuideClose");
  const form = document.querySelector("#arenaGuideForm");
  const input = document.querySelector("#arenaGuideInput");
  const messages = document.querySelector("#arenaGuideMessages");
  const status = document.querySelector("#arenaGuideStatus");
  const history = [];
  let pending = false;
  if (!root || !launcher || !panel || !form || !input || !messages || !status) return { reset() {}, setVisible() {} };

  const tutorial = initArenaGuideTutorial({
    root,
    panel,
    getCurrentPage: pageFromHash,
    navigate: (page, navigationOptions) => options.navigate?.(page, navigationOptions),
    onClose: () => window.requestAnimationFrame(() => input.focus())
  });

  launcher.addEventListener("click", () => setOpen(panel.hidden));
  close?.addEventListener("click", () => setOpen(false));
  root.querySelectorAll("[data-guide-prompt]").forEach((button) => button.addEventListener("click", () => {
    setOpen(true);
    input.value = button.dataset.guidePrompt || "";
    input.focus();
  }));
  form.addEventListener("submit", handleSubmit);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!pending) form.requestSubmit();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) setOpen(false);
  });

  function setOpen(open) {
    panel.hidden = !open;
    root.dataset.guideState = open ? "open" : "closed";
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) tutorial.close();
    if (open) window.requestAnimationFrame(() => input.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;
    const question = input.value.trim();
    if (!question) return;
    appendMessage("user", question);
    history.push({ role: "user", content: question });
    input.value = "";
    setPending(true, "클로이가 AI Arena에서 가장 알맞은 안내를 찾고 있어요…");
    try {
      const response = await fetch("/api/arena-guide", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json", ...(options.getAuthHeaders?.() || {}) },
        body: JSON.stringify({ question, history: history.slice(-6), page: pageFromHash() })
      });
      const payload = await safeJson(response);
      if (!response.ok) throw new Error(payload?.error || "안내를 불러오지 못했어요.");
      const guide = payload?.guide || {};
      appendMessage("assistant", guide.answer || "조금 더 구체적으로 말씀해 주시면 다시 찾아볼게요.", guide);
      history.push({ role: "assistant", content: String(guide.answer || "") });
    } catch (error) {
      appendMessage("assistant", error.message || "잠시 후 다시 말씀해 주세요.");
    } finally {
      setPending(false);
      input.focus();
    }
  }

  function appendMessage(role, content, guide = null) {
    const article = document.createElement("article");
    article.className = `arena-guide-message is-${role}`;
    const label = document.createElement("span");
    label.textContent = role === "user" ? "나" : "Clawee 클로이";
    const paragraph = document.createElement("p");
    paragraph.textContent = content;
    article.append(label, paragraph);
    if (guide && ALLOWED_PAGES.has(guide.suggestedPage)) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "arena-guide-action";
      action.textContent = `${guide.suggestedLabel || "관련 화면 보기"} →`;
      action.addEventListener("click", () => {
        if (guide.suggestedPage === "overview" && !options.isAuthenticated?.()) {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          options.navigate?.(guide.suggestedPage);
        }
        setOpen(false);
      });
      article.append(action);
    }
    if (Array.isArray(guide?.followUps) && guide.followUps.length) {
      const followUps = document.createElement("div");
      followUps.className = "arena-guide-followups";
      guide.followUps.slice(0, 3).forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item;
        button.addEventListener("click", () => { input.value = item; input.focus(); });
        followUps.append(button);
      });
      article.append(followUps);
    }
    messages.append(article);
    messages.scrollTop = messages.scrollHeight;
  }

  function setPending(value, copy = "") {
    pending = value;
    form.setAttribute("aria-busy", value ? "true" : "false");
    form.querySelector("button[type='submit']").disabled = value;
    status.hidden = !value;
    status.textContent = copy;
  }

  function reset() {
    history.splice(0, history.length);
    messages.replaceChildren();
    form.reset();
    setPending(false);
    tutorial.reset();
    setOpen(false);
  }

  function setVisible(visible) {
    root.hidden = !visible;
    if (!visible) reset();
  }

  return { reset, setVisible, open: () => setOpen(true) };
}

function pageFromHash() {
  const value = window.location.hash.replace(/^#\/?/u, "").trim();
  const map = { discover: "overview", "company-directory": "teams", "task-driven-search": "discover", compare: "compare", community: "community", bounty: "arena", "my-log": "workspace" };
  return map[value] || "overview";
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}
