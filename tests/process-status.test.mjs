import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceProcessStatus,
  finishProcessStatus,
  startProcessStatus
} from "../public/arena/progress-status.js";

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, value);
  }

  removeProperty(name) {
    this.values.delete(name);
  }

  getPropertyValue(name) {
    return this.values.get(name) || "";
  }
}

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.classList = new FakeClassList();
    this.style = new FakeStyle();
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.hidden = false;
    this._textContent = "";
  }

  set className(value) {
    this.classList = new FakeClassList();
    String(value || "").split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
  }

  get className() {
    return [...this.classList.values].join(" ");
  }

  set textContent(value) {
    this._textContent = String(value || "");
    this.children = [];
  }

  get textContent() {
    return this.children.length ? this.children.map((child) => child.textContent).join("") : this._textContent;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  replaceChildren(...children) {
    this.children = children;
    this._textContent = "";
  }
}

function fixture({ reducedMotion = false } = {}) {
  let nextTimer = 1;
  const timers = new Map();
  const clock = {
    setInterval(callback) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    tick() {
      [...timers.values()].forEach((callback) => callback());
    },
    get size() {
      return timers.size;
    }
  };
  const documentRef = {
    defaultView: { matchMedia: () => ({ matches: reducedMotion }) },
    createElement() {
      return new FakeElement(documentRef);
    }
  };
  return { element: new FakeElement(documentRef), clock };
}

test("process status advances visible stages and finishes without leaving timers", () => {
  const { element, clock } = fixture();
  const token = startProcessStatus(element, ["첫 단계", "두 번째 단계", "마지막 단계"], { clock, interval: 900 });

  assert.equal(element.hidden, false);
  assert.equal(element.classList.contains("process-status"), true);
  assert.equal(element.classList.contains("is-loading"), true);
  assert.equal(element.getAttribute("role"), "status");
  assert.equal(element.getAttribute("aria-busy"), "true");
  assert.equal(element.dataset.processStep, "1");
  assert.equal(clock.size, 1);

  clock.tick();
  assert.equal(element.dataset.processStep, "2");
  assert.equal(element.style.getPropertyValue("--process-progress"), `${(2 / 3) * 100}%`);
  assert.equal(advanceProcessStatus(element, token, 2), true);
  assert.equal(element.dataset.processStep, "3");

  assert.equal(finishProcessStatus(element, token, "완료했습니다.", "success"), true);
  assert.equal(clock.size, 0);
  assert.equal(element.classList.contains("process-status"), false);
  assert.equal(element.classList.contains("is-success"), true);
  assert.equal(element.getAttribute("aria-busy"), "false");
  assert.equal(element.textContent, "완료했습니다.");
});

test("a stale process token cannot hide a newer operation", () => {
  const { element, clock } = fixture();
  const oldToken = startProcessStatus(element, ["이전 요청", "이전 완료"], { clock });
  const newToken = startProcessStatus(element, ["새 요청", "새 완료"], { clock });

  assert.equal(clock.size, 1);
  assert.equal(finishProcessStatus(element, oldToken), false);
  assert.equal(element.classList.contains("is-loading"), true);
  assert.equal(element.textContent.includes("새 요청"), true);
  assert.equal(finishProcessStatus(element, newToken), true);
  assert.equal(clock.size, 0);
  assert.equal(element.hidden, true);
});

test("reduced-motion users get a stable first stage without a rotating timer", () => {
  const { element, clock } = fixture({ reducedMotion: true });
  const token = startProcessStatus(element, ["첫 단계", "두 번째 단계"], { clock });

  assert.equal(clock.size, 0);
  assert.equal(element.dataset.processStep, "1");
  finishProcessStatus(element, token);
});

test("elapsed process status keeps confirming a long request is still active", () => {
  const { element, clock } = fixture();
  const token = startProcessStatus(element, ["요청 정리", "저장 중", "응답 대기"], {
    clock,
    interval: 1000,
    showElapsed: true
  });

  clock.tick();
  assert.equal(element.dataset.processStep, "2");
  assert.equal(element.children[2].textContent, "2/3 · 1초");
  clock.tick();
  clock.tick();
  assert.equal(element.dataset.processStep, "3");
  assert.equal(element.children[2].textContent, "3/3 · 3초");
  assert.equal(clock.size, 1);
  finishProcessStatus(element, token, "저장 완료", "success");
  assert.equal(clock.size, 0);
});
