import { brandSafeDisplayText } from "./sanitize.js";

const activeProcesses = new WeakMap();
const STATE_CLASSES = ["process-status", "is-loading", "is-success", "is-error", "is-info"];

function clearProcessTimer(state) {
  if (!state?.timer) return;
  state.clock.clearInterval(state.timer);
  state.timer = null;
}

function resetProcessElement(element) {
  element.classList.remove(...STATE_CLASSES);
  element.classList.add("form-status");
  element.removeAttribute("data-process-step");
  element.style.removeProperty("--process-progress");
  element.setAttribute("aria-busy", "false");
}

function renderProcessStep(state, nextIndex) {
  state.index = Math.max(0, Math.min(nextIndex, state.steps.length - 1));
  state.copy.textContent = state.steps[state.index];
  state.step.textContent = `${state.index + 1}/${state.steps.length}`;
  state.element.dataset.processStep = String(state.index + 1);
  state.element.style.setProperty("--process-progress", `${((state.index + 1) / state.steps.length) * 100}%`);
}

export function startProcessStatus(element, steps, options = {}) {
  if (!element) return null;
  const previous = activeProcesses.get(element);
  clearProcessTimer(previous);

  const messages = (Array.isArray(steps) ? steps : [steps]).map((message) => brandSafeDisplayText(message).trim()).filter(Boolean);
  if (!messages.length) messages.push("요청을 처리하고 있습니다.");

  const documentRef = element.ownerDocument || document;
  const clock = options.clock || documentRef.defaultView || globalThis;
  const spinner = documentRef.createElement("span");
  const copy = documentRef.createElement("span");
  const step = documentRef.createElement("span");
  const announcement = documentRef.createElement("span");
  const token = Symbol("process-status");

  spinner.className = "process-status-spinner";
  spinner.setAttribute("aria-hidden", "true");
  copy.className = "process-status-copy";
  copy.setAttribute("aria-hidden", "true");
  step.className = "process-status-step";
  step.setAttribute("aria-hidden", "true");
  announcement.className = "sr-only";
  announcement.textContent = brandSafeDisplayText(options.announcement || messages[0]);

  element.replaceChildren(spinner, copy, step, announcement);
  element.hidden = false;
  element.classList.remove(...STATE_CLASSES);
  element.classList.add("form-status", "process-status", "is-loading");
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
  element.setAttribute("aria-busy", "true");

  const state = { token, element, steps: messages, spinner, copy, step, index: 0, timer: null, clock };
  activeProcesses.set(element, state);
  renderProcessStep(state, 0);

  const reducedMotion = documentRef.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!reducedMotion && messages.length > 1) {
    state.timer = clock.setInterval(() => {
      const current = activeProcesses.get(element);
      if (current?.token !== token) return;
      if (current.index >= current.steps.length - 1) {
        clearProcessTimer(current);
        return;
      }
      renderProcessStep(current, current.index + 1);
    }, Math.max(900, Number(options.interval) || 1800));
  }

  return token;
}

export function advanceProcessStatus(element, token, index) {
  const state = element ? activeProcesses.get(element) : null;
  if (!state || state.token !== token) return false;
  renderProcessStep(state, index);
  return true;
}

export function finishProcessStatus(element, token, message = "", type = "") {
  if (!element) return false;
  const state = activeProcesses.get(element);
  if (token && state?.token !== token) return false;
  clearProcessTimer(state);
  activeProcesses.delete(element);
  resetProcessElement(element);
  element.textContent = brandSafeDisplayText(message || "");
  element.hidden = !message;
  if (type) element.classList.add(`is-${type}`);
  return true;
}

export function setProcessStatus(element, message = "", type = "") {
  return finishProcessStatus(element, null, message, type);
}
