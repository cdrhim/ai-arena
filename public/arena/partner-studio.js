const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 1_500_000;
const LINK_FIELDS = ["website", "demo", "github", "huggingface", "deck", "docs", "video", "figma", "linkedin", "x"];

export function createPartnerStudio(options) {
  const {
    getArena,
    getViewer,
    postArena,
    showTab,
    setStatus,
    escapeHtml,
    formatDate,
    formatNumber
  } = options;

  let currentSubmission = null;
  let activeStep = "start";
  let draggedAssetId = null;
  let saveTimer = null;
  let filling = false;

  const els = {};

  function init() {
    Object.assign(els, {
      accountSubmitButton: document.querySelector("#accountSubmitButton"),
      accountManageButton: document.querySelector("#accountManageButton"),
      newSubmissionButton: document.querySelector("#newSubmissionButton"),
      compactNewSubmissionButton: document.querySelector("#compactNewSubmissionButton"),
      manageSubmissionsButton: document.querySelector("#manageSubmissionsButton"),
      form: document.querySelector("#partnerSubmissionForm"),
      formTitle: document.querySelector("#studioFormTitle"),
      autosave: document.querySelector("#studioAutosave"),
      status: document.querySelector("#studioStatus"),
      statusBadge: document.querySelector("#submissionStatusBadge"),
      readinessFill: document.querySelector("#readinessFill"),
      readinessScore: document.querySelector("#readinessScore"),
      mySubmissionList: document.querySelector("#mySubmissionList"),
      reviewQueuePanel: document.querySelector("#reviewQueuePanel"),
      reviewQueueList: document.querySelector("#reviewQueueList"),
      staffReviewControls: document.querySelector("#staffReviewControls"),
      staffReviewNote: document.querySelector("#staffReviewNote"),
      staffInternalNote: document.querySelector("#staffInternalNote"),
      saveDraftButton: document.querySelector("#saveDraftButton"),
      submitReviewButton: document.querySelector("#submitReviewButton"),
      thumbnailInput: document.querySelector("#thumbnailInput"),
      galleryInput: document.querySelector("#galleryInput"),
      thumbnailPreview: document.querySelector("#thumbnailPreview"),
      galleryList: document.querySelector("#galleryList"),
      discoverPreview: document.querySelector("#discoverPreview"),
      projectPreview: document.querySelector("#projectPreview"),
      arenaCardPreview: document.querySelector("#arenaCardPreview"),
      readinessList: document.querySelector("#readinessList"),
      taglineCounter: document.querySelector("#taglineCounter"),
      descriptionCounter: document.querySelector("#descriptionCounter"),
      stats: {
        drafts: document.querySelector("#studioDrafts"),
        review: document.querySelector("#studioReview"),
        changes: document.querySelector("#studioChanges"),
        published: document.querySelector("#studioPublished")
      }
    });

    [els.accountSubmitButton, els.newSubmissionButton, els.compactNewSubmissionButton].forEach((button) => {
      button?.addEventListener("click", () => {
        newSubmission();
        showTab("submit");
      });
    });
    [els.accountManageButton, els.manageSubmissionsButton].forEach((button) => {
      button?.addEventListener("click", () => showTab("submit"));
    });

    document.querySelectorAll(".wizard-step").forEach((button) => {
      button.addEventListener("click", () => showStep(button.dataset.step));
    });

    els.form?.addEventListener("input", () => {
      if (filling) return;
      updateFromForm();
      scheduleAutosave();
    });
    els.form?.addEventListener("change", () => {
      if (filling) return;
      updateFromForm();
      scheduleAutosave();
    });

    els.saveDraftButton?.addEventListener("click", () => saveDraft(true));
    els.submitReviewButton?.addEventListener("click", submitForReview);
    els.thumbnailInput?.addEventListener("change", () => handleFiles(els.thumbnailInput.files, "thumbnail"));
    els.galleryInput?.addEventListener("change", () => handleFiles(els.galleryInput.files, "gallery"));

    document.querySelectorAll("[data-helper]").forEach((button) => {
      button.addEventListener("click", () => runHelper(button.dataset.helper));
    });

    document.querySelectorAll("[data-review-action]").forEach((button) => {
      button.addEventListener("click", () => runReviewAction(button.dataset.reviewAction));
    });
  }

  function render() {
    const viewer = getViewer();
    const arena = getArena();
    const loggedIn = Boolean(viewer?.email);

    toggleControls(loggedIn);
    if (!loggedIn || !arena) {
      renderLocked();
      return;
    }

    const mine = mySubmissions();
    if (!currentSubmission) currentSubmission = mine[0] ? clone(mine[0]) : blankSubmission();
    const latest = mine.find((submission) => submission.id === currentSubmission.id) || reviewQueue().find((submission) => submission.id === currentSubmission.id);
    if (latest && !document.activeElement?.closest?.("#partnerSubmissionForm")) currentSubmission = clone(latest);

    renderSidebar();
    renderReviewQueue();
    fillForm(currentSubmission);
    renderSubmissionState();
  }

  function renderLocked() {
    if (els.mySubmissionList) els.mySubmissionList.innerHTML = `<div class="submission-item">Login to create and manage member product submissions.</div>`;
    if (els.reviewQueuePanel) els.reviewQueuePanel.hidden = true;
    if (els.staffReviewControls) els.staffReviewControls.hidden = true;
    Object.values(els.stats || {}).forEach((item) => {
      if (item) item.textContent = "0";
    });
  }

  function toggleControls(loggedIn) {
    const canSubmitProducts = Boolean(getViewer()?.canSubmitProducts);
    [els.accountSubmitButton, els.accountManageButton].forEach((button) => {
      if (button) button.hidden = true;
    });
    if (els.form) {
      els.form.querySelectorAll("input, select, textarea, button").forEach((control) => {
        if (control.type !== "hidden") control.disabled = !canSubmitProducts;
      });
    }
  }

  function newSubmission() {
    currentSubmission = blankSubmission();
    fillForm(currentSubmission);
    renderSubmissionState();
    setStatus(els.status, "New draft ready.", "ok");
  }

  function blankSubmission() {
    const viewer = getViewer() || {};
    return {
      id: "",
      ownerId: viewer.id || "",
      ownerEmail: viewer.email || "",
      type: "Product",
      status: "draft",
      visibility: "private",
      name: "",
      slug: "",
      tagline: "",
      shortDescription: "",
      longDescriptionMarkdown: "",
      makerNote: "",
      category: "",
      stage: "Pre-Seed",
      region: "",
      affiliation: "Partner Company",
      launchTags: [],
      technicalTags: [],
      thumbnailAssetId: "",
      galleryAssetIds: [],
      assets: [],
      links: [],
      teamMembers: [{ name: "", role: "", email: viewer.email || "", link: "", location: "" }],
      technicalProfile: {},
      traction: {},
      helpRequests: [],
      review: { staffVerified: false },
      readiness: { score: 0, completedItems: [], missingItems: [], canSubmit: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 0
    };
  }

  function fillForm(submission) {
    if (!els.form || !submission) return;
    filling = true;
    setValue("id", submission.id || "");
    setValue("type", submission.type || "Product");
    setValue("primaryUrl", linkOf(submission, "website")?.url || "");
    setValue("name", submission.name || "");
    setValue("slug", submission.slug || "");
    setValue("tagline", submission.tagline || "");
    setValue("shortDescription", submission.shortDescription || "");
    setValue("longDescriptionMarkdown", submission.longDescriptionMarkdown || "");
    setValue("category", submission.category || "");
    setValue("stage", submission.stage || "Pre-Seed");
    setValue("region", submission.region || "");
    setValue("affiliation", submission.affiliation || "Partner Company");
    setValue("launchTags", (submission.launchTags || []).join(", "));
    setValue("technicalTags", (submission.technicalTags || []).join(", "));

    for (const type of LINK_FIELDS) setValue(`link_${type}`, linkOf(submission, type)?.url || "");
    setValue("contactEmail", linkOf(submission, "contact")?.label || submission.ownerEmail || "");

    const technical = submission.technicalProfile || {};
    setValue("technical_productType", technical.productType || "");
    setValue("technical_modalities", listValue(technical.modalities));
    setValue("technical_stack", listValue(technical.stack));
    setValue("technical_frameworks", listValue(technical.frameworks));
    setValue("technical_dataSources", listValue(technical.dataSources));
    setValue("technical_deployment", technical.deployment || "");
    setValue("technical_apiDetails", technical.apiDetails || "");
    setValue("technical_license", technical.license || "");
    setValue("technical_intendedUsers", technical.intendedUsers || "");
    setValue("technical_limitations", technical.limitations || "");
    setValue("technical_privacy", technical.privacy || "");
    setValue("technical_safety", technical.safety || "");
    setValue("technical_evaluationClaims", technical.evaluationClaims || "");

    const member = submission.teamMembers?.[0] || {};
    setValue("team_name", member.name || "");
    setValue("team_role", member.role || "");
    setValue("team_email", member.email || submission.ownerEmail || "");
    setValue("team_link", member.link || "");
    setValue("company", submission.traction?.company || "");
    setValue("team_location", member.location || "");

    const traction = submission.traction || {};
    setValue("traction_pricing", traction.pricing || "");
    setValue("traction_businessModel", traction.businessModel || "");
    setValue("traction_customers", traction.customers || traction.users || "");
    setValue("traction_revenue", traction.revenue || traction.waitlist || "");
    setValue("traction_fundingStage", traction.fundingStage || "");
    setValue("makerNote", submission.makerNote || "");
    setValue("audience", traction.audience || "");
    setValue("preferredLaunchTiming", traction.preferredLaunchTiming || "");
    setValue("promoOffer", traction.promoOffer || "");

    els.form.querySelectorAll('input[name="helpRequests"]').forEach((checkbox) => {
      checkbox.checked = (submission.helpRequests || []).includes(checkbox.value);
    });

    renderAssets();
    renderCounters();
    showStep(activeStep);
    filling = false;
  }

  function updateFromForm() {
    currentSubmission = collectSubmission();
    renderSubmissionState();
  }

  function collectSubmission() {
    const form = els.form;
    const existing = currentSubmission || blankSubmission();
    const data = Object.fromEntries(new FormData(form).entries());
    const links = [];
    const primaryUrl = safeTrim(data.primaryUrl);
    if (primaryUrl) links.push({ type: "website", url: primaryUrl, label: "Website" });
    for (const type of LINK_FIELDS) {
      const url = safeTrim(data[`link_${type}`]);
      if (url && !links.some((link) => link.type === type && link.url === url)) {
        links.push({ type, url, label: labelForLink(type) });
      }
    }
    if (safeTrim(data.contactEmail)) links.push({ type: "contact", url: `https://mailto.invalid/${encodeURIComponent(data.contactEmail)}`, label: safeTrim(data.contactEmail) });

    const helpRequests = [...form.querySelectorAll('input[name="helpRequests"]:checked')].map((checkbox) => checkbox.value);
    const teamMembers = [
      {
        name: safeTrim(data.team_name),
        role: safeTrim(data.team_role),
        email: safeTrim(data.team_email || data.contactEmail),
        link: safeTrim(data.team_link),
        location: safeTrim(data.team_location)
      }
    ];

    const submission = {
      ...existing,
      id: safeTrim(data.id) || existing.id || "",
      type: data.type || "Product",
      name: safeTrim(data.name),
      slug: safeTrim(data.slug),
      tagline: safeTrim(data.tagline).slice(0, 60),
      shortDescription: safeTrim(data.shortDescription).slice(0, 500),
      longDescriptionMarkdown: safeTrim(data.longDescriptionMarkdown),
      category: safeTrim(data.category),
      stage: data.stage || "Pre-Seed",
      region: safeTrim(data.region),
      affiliation: data.affiliation || "Partner Company",
      launchTags: splitList(data.launchTags).slice(0, 3),
      technicalTags: splitList(data.technicalTags).slice(0, 12),
      links: links.filter((link) => !link.url.startsWith("https://mailto.invalid/")),
      teamMembers,
      technicalProfile: {
        productType: safeTrim(data.technical_productType),
        modalities: splitList(data.technical_modalities),
        stack: splitList(data.technical_stack),
        frameworks: splitList(data.technical_frameworks),
        dataSources: splitList(data.technical_dataSources),
        deployment: safeTrim(data.technical_deployment),
        apiDetails: safeTrim(data.technical_apiDetails),
        license: safeTrim(data.technical_license),
        intendedUsers: safeTrim(data.technical_intendedUsers),
        limitations: safeTrim(data.technical_limitations),
        privacy: safeTrim(data.technical_privacy),
        safety: safeTrim(data.technical_safety),
        evaluationClaims: safeTrim(data.technical_evaluationClaims)
      },
      traction: {
        company: safeTrim(data.company),
        pricing: safeTrim(data.traction_pricing),
        businessModel: safeTrim(data.traction_businessModel),
        customers: safeTrim(data.traction_customers),
        users: safeTrim(data.traction_customers),
        revenue: safeTrim(data.traction_revenue),
        waitlist: safeTrim(data.traction_revenue),
        fundingStage: safeTrim(data.traction_fundingStage),
        audience: safeTrim(data.audience),
        preferredLaunchTiming: safeTrim(data.preferredLaunchTiming),
        promoOffer: safeTrim(data.promoOffer)
      },
      helpRequests,
      makerNote: safeTrim(data.makerNote),
      updatedAt: new Date().toISOString()
    };
    submission.readiness = calculateReadiness(submission);
    submission.arenaCardMarkdown = generateArenaCardMarkdown(submission);
    return submission;
  }

  async function handleFiles(fileList, kind) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const next = currentSubmission || blankSubmission();
    const assets = [...(next.assets || [])];
    try {
      for (const file of files) {
        validateFile(file);
        const dataUrl = await readAsDataUrl(file);
        const asset = {
          id: `asset_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          type: kind,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          dataUrl,
          previewUrl: dataUrl,
          caption: "",
          altText: file.name.replace(/\.[^.]+$/, ""),
          sortOrder: kind === "thumbnail" ? 0 : assets.filter((item) => item.type === "gallery").length,
          createdAt: new Date().toISOString()
        };
        if (kind === "thumbnail") {
          for (let index = assets.length - 1; index >= 0; index -= 1) {
            if (assets[index].type === "thumbnail") assets.splice(index, 1);
          }
          assets.unshift(asset);
          next.thumbnailAssetId = asset.id;
        } else {
          assets.push(asset);
        }
      }
      next.assets = assets;
      next.galleryAssetIds = assets.filter((asset) => asset.type === "gallery").sort((left, right) => left.sortOrder - right.sortOrder).map((asset) => asset.id);
      currentSubmission = { ...next, readiness: calculateReadiness(next) };
      renderAssets();
      renderSubmissionState();
      scheduleAutosave();
      setStatus(els.status, "Upload added to draft.", "ok");
    } catch (error) {
      setStatus(els.status, error.message, "error");
    } finally {
      if (kind === "thumbnail") els.thumbnailInput.value = "";
      if (kind === "gallery") els.galleryInput.value = "";
    }
  }

  function renderAssets() {
    const submission = currentSubmission || blankSubmission();
    const assets = submission.assets || [];
    const thumb = assets.find((asset) => asset.id === submission.thumbnailAssetId) || assets.find((asset) => asset.type === "thumbnail");
    if (thumb) {
      els.thumbnailPreview.classList.remove("empty");
      els.thumbnailPreview.innerHTML = `<img src="${escapeHtml(thumb.dataUrl || thumb.previewUrl)}" alt="${escapeHtml(thumb.altText || thumb.fileName)}">`;
    } else {
      els.thumbnailPreview.classList.add("empty");
      els.thumbnailPreview.textContent = "No thumbnail yet.";
    }

    const gallery = assets.filter((asset) => asset.type === "gallery").sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
    els.galleryList.innerHTML =
      gallery
        .map(
          (asset) => `<article class="gallery-item" draggable="true" data-asset-id="${escapeHtml(asset.id)}">
            <div class="gallery-thumb"><img src="${escapeHtml(asset.dataUrl || asset.previewUrl)}" alt="${escapeHtml(asset.altText || asset.fileName)}"></div>
            <label><span>Caption</span><input data-asset-field="caption" value="${escapeHtml(asset.caption || "")}"></label>
            <label><span>Alt text</span><input data-asset-field="altText" value="${escapeHtml(asset.altText || "")}"></label>
            <div class="gallery-actions">
              <button class="secondary-action compact" data-asset-move="up" type="button">Up</button>
              <button class="secondary-action compact" data-asset-move="down" type="button">Down</button>
              <button class="secondary-action compact danger" data-asset-remove type="button">Remove</button>
            </div>
          </article>`
        )
        .join("") || `<div class="submission-item">No gallery images yet.</div>`;

    bindGalleryActions();
  }

  function bindGalleryActions() {
    els.galleryList.querySelectorAll(".gallery-item").forEach((item) => {
      item.addEventListener("dragstart", () => {
        draggedAssetId = item.dataset.assetId;
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => {
        draggedAssetId = null;
        item.classList.remove("dragging");
      });
      item.addEventListener("dragover", (event) => event.preventDefault());
      item.addEventListener("drop", () => reorderGallery(draggedAssetId, item.dataset.assetId));
    });
    els.galleryList.querySelectorAll("[data-asset-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const id = input.closest("[data-asset-id]")?.dataset.assetId;
        const asset = currentSubmission.assets.find((item) => item.id === id);
        if (asset) asset[input.dataset.assetField] = input.value;
        scheduleAutosave();
      });
    });
    els.galleryList.querySelectorAll("[data-asset-move]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.closest("[data-asset-id]")?.dataset.assetId;
        moveAsset(id, button.dataset.assetMove === "up" ? -1 : 1);
      });
    });
    els.galleryList.querySelectorAll("[data-asset-remove]").forEach((button) => {
      button.addEventListener("click", () => removeAsset(button.closest("[data-asset-id]")?.dataset.assetId));
    });
  }

  function reorderGallery(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const gallery = currentSubmission.assets.filter((asset) => asset.type === "gallery").sort((left, right) => left.sortOrder - right.sortOrder);
    const fromIndex = gallery.findIndex((asset) => asset.id === fromId);
    const toIndex = gallery.findIndex((asset) => asset.id === toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = gallery.splice(fromIndex, 1);
    gallery.splice(toIndex, 0, moved);
    gallery.forEach((asset, index) => {
      asset.sortOrder = index;
    });
    currentSubmission.galleryAssetIds = gallery.map((asset) => asset.id);
    renderAssets();
    renderSubmissionState();
    scheduleAutosave();
  }

  function moveAsset(id, delta) {
    const gallery = currentSubmission.assets.filter((asset) => asset.type === "gallery").sort((left, right) => left.sortOrder - right.sortOrder);
    const index = gallery.findIndex((asset) => asset.id === id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= gallery.length) return;
    [gallery[index], gallery[nextIndex]] = [gallery[nextIndex], gallery[index]];
    gallery.forEach((asset, order) => {
      asset.sortOrder = order;
    });
    currentSubmission.galleryAssetIds = gallery.map((asset) => asset.id);
    renderAssets();
    scheduleAutosave();
  }

  function removeAsset(id) {
    if (!id) return;
    currentSubmission.assets = currentSubmission.assets.filter((asset) => asset.id !== id);
    currentSubmission.galleryAssetIds = (currentSubmission.galleryAssetIds || []).filter((assetId) => assetId !== id);
    if (currentSubmission.thumbnailAssetId === id) currentSubmission.thumbnailAssetId = "";
    currentSubmission.readiness = calculateReadiness(currentSubmission);
    renderAssets();
    renderSubmissionState();
    scheduleAutosave();
  }

  function renderSubmissionState() {
    const submission = currentSubmission || blankSubmission();
    const readiness = calculateReadiness(submission);
    submission.readiness = readiness;
    if (els.formTitle) els.formTitle.textContent = submission.name || "New submission";
    if (els.statusBadge) {
      els.statusBadge.textContent = statusLabel(submission.status || "draft");
      els.statusBadge.className = `badge status-${escapeHtml(submission.status || "draft")}`;
    }
    if (els.readinessFill) els.readinessFill.style.width = `${readiness.score}%`;
    if (els.readinessScore) els.readinessScore.textContent = `${readiness.score}%`;
    if (els.submitReviewButton) els.submitReviewButton.disabled = !readiness.canSubmit || !canOwnerEdit(submission);
    if (els.staffReviewControls) els.staffReviewControls.hidden = !getViewer()?.canScore || !submission.id;
    renderCounters();
    renderPreviews(submission);
  }

  function renderPreviews(submission) {
    const thumb = (submission.assets || []).find((asset) => asset.id === submission.thumbnailAssetId);
    const image = thumb?.dataUrl || thumb?.previewUrl || "";
    const tags = [...(submission.launchTags || []), ...(submission.technicalTags || [])].slice(0, 5);
    els.discoverPreview.innerHTML = `
      ${image ? `<div class="startup-thumb"><img src="${escapeHtml(image)}" alt="${escapeHtml(submission.name || "Submission")}"></div>` : ""}
      <div class="card-head">
        <div class="startup-name">
          <strong>${escapeHtml(submission.name || "Untitled product")}</strong>
          <span class="muted">${escapeHtml(submission.teamMembers?.[0]?.name || submission.ownerEmail || "Partner")} - ${escapeHtml(submission.region || "Global")}</span>
        </div>
        <span class="score-pill"><span>Ready</span><strong>${formatNumber(submission.readiness?.score || 0)}%</strong></span>
      </div>
      <div class="badge-row">
        <span class="badge">${escapeHtml(submission.status || "draft")}</span>
        <span class="badge">${escapeHtml(submission.category || "Category")}</span>
        <span class="badge">Partner supplied</span>
        <span class="badge">${escapeHtml(machineStatusLabel(submission.humanValidation?.machineStatus || "not_started"))}</span>
        <span class="badge">${escapeHtml(humanStatusLabel(submission.humanValidation?.humanStatus || "not_eligible"))}</span>
        ${humanBadgeMarkup(submission)}
        ${tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <p class="description">${escapeHtml(submission.tagline || "Add a sharp tagline for the Arena.")}</p>
    `;
    els.readinessList.innerHTML = [
      ...(submission.readiness?.completedItems || []).map((item) => readinessRow(item, true)),
      ...(submission.readiness?.missingItems || []).map((item) => readinessRow(item, false))
    ].join("");
    els.projectPreview.innerHTML = projectPreviewHtml(submission, image);
    els.arenaCardPreview.textContent = generateArenaCardMarkdown(submission);
  }

  function renderSidebar() {
    const mine = mySubmissions();
    const counts = {
      drafts: mine.filter((item) => item.status === "draft").length,
      review: mine.filter((item) => item.status === "submitted").length,
      changes: mine.filter((item) => item.status === "needs_changes").length,
      published: mine.filter((item) => item.status === "published").length
    };
    els.stats.drafts.textContent = counts.drafts;
    els.stats.review.textContent = counts.review;
    els.stats.changes.textContent = counts.changes;
    els.stats.published.textContent = counts.published;
    els.mySubmissionList.innerHTML =
      mine
        .map((submission) => submissionListItem(submission, submission.id === currentSubmission?.id))
        .join("") || `<div class="submission-item">No submissions yet. Start with New submission.</div>`;
    els.mySubmissionList.querySelectorAll("[data-submission-id]").forEach((button) => {
      button.addEventListener("click", () => {
        currentSubmission = clone(mySubmissions().find((submission) => submission.id === button.dataset.submissionId));
        fillForm(currentSubmission);
        renderSubmissionState();
      });
    });
  }

  function renderReviewQueue() {
    const viewer = getViewer();
    if (!els.reviewQueuePanel) return;
    els.reviewQueuePanel.hidden = !viewer?.canScore;
    if (!viewer?.canScore) return;
    const queue = reviewQueue();
    els.reviewQueueList.innerHTML =
      queue.map((submission) => submissionListItem(submission, submission.id === currentSubmission?.id, true)).join("") ||
      `<div class="submission-item">No pending submissions.</div>`;
    els.reviewQueueList.querySelectorAll("[data-submission-id]").forEach((button) => {
      button.addEventListener("click", () => {
        currentSubmission = clone(reviewQueue().find((submission) => submission.id === button.dataset.submissionId));
        fillForm(currentSubmission);
        renderSubmissionState();
      });
    });
  }

  async function saveDraft(manual = false) {
    if (!getViewer()?.email) return;
    updateFromForm();
    if (!manual && !hasAnyDraftContent(currentSubmission)) return;
    setStatus(manual ? els.status : els.autosave, manual ? "Saving draft..." : "Autosaving...");
    const result = await postArena("saveSubmissionDraft", { submission: currentSubmission }, manual ? els.status : els.autosave, {
      render: false
    });
    if (result?.event?.submission) {
      currentSubmission = clone(result.event.submission);
      setValue("id", currentSubmission.id);
      renderSubmissionState();
      renderSidebar();
      setStatus(manual ? els.status : els.autosave, manual ? "Draft saved." : `Autosaved ${new Date().toLocaleTimeString()}.`, "ok");
    }
  }

  async function submitForReview() {
    updateFromForm();
    const readiness = calculateReadiness(currentSubmission);
    if (!readiness.canSubmit) {
      setStatus(els.status, `Missing: ${readiness.missingItems.join(", ")}`, "error");
      showStep("preview");
      return;
    }
    const result = await postArena("submitSubmissionForReview", { id: currentSubmission.id, submission: currentSubmission }, els.status);
    if (result?.event?.submission) {
      currentSubmission = clone(result.event.submission);
      setStatus(els.status, "Your submission has been sent for review. You can keep editing if SparkClaw requests changes.", "ok");
    }
  }

  async function runReviewAction(action) {
    if (!currentSubmission?.id || !getViewer()?.canScore) return;
    const payload = {
      id: currentSubmission.id,
      note: els.staffReviewNote.value,
      internalNote: els.staffInternalNote.value
    };
    const result = await postArena(action, payload, els.status);
    if (result?.event?.submission) currentSubmission = clone(result.event.submission);
  }

  function scheduleAutosave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => saveDraft(false), 900);
  }

  function runHelper(kind) {
    updateFromForm();
    if (kind === "tagline") {
      const category = currentSubmission.category || currentSubmission.type || "AI";
      const name = currentSubmission.name || "Your product";
      setStatus(els.status, `Try: "${name} helps ${category.toLowerCase()} teams launch trusted AI workflows."`, "ok");
    }
    if (kind === "makerNote") {
      setValue(
        "makerNote",
        `We built ${currentSubmission.name || "this product"} for ${currentSubmission.traction?.audience || "teams adopting AI"}.\n\nWhy now: AI workflows are moving from demos into production, but buyers need trust, proof, and clear limits.\n\nFeedback wanted: product fit, technical validation, enterprise pilots, and partner introductions.`
      );
      updateFromForm();
    }
    if (kind === "missing") {
      const missing = currentSubmission.readiness?.missingItems || [];
      setStatus(els.status, missing.length ? `Next best fields: ${missing.slice(0, 3).join(", ")}.` : "This submission is ready for review.", missing.length ? "" : "ok");
    }
  }

  function showStep(step) {
    activeStep = step || "start";
    document.querySelectorAll(".wizard-step").forEach((button) => button.classList.toggle("is-active", button.dataset.step === activeStep));
    document.querySelectorAll(".wizard-pane").forEach((pane) => pane.classList.toggle("is-active", pane.dataset.pane === activeStep));
    renderSubmissionState();
  }

  function mySubmissions() {
    const viewer = getViewer() || {};
    return (getArena()?.submissions || [])
      .filter((submission) => viewer.canScore || submission.ownerId === viewer.id || submission.ownerEmail === viewer.email)
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0));
  }

  function reviewQueue() {
    return getArena()?.reviewQueue || [];
  }

  function canOwnerEdit(submission) {
    const viewer = getViewer() || {};
    if (viewer.canScore) return true;
    return submission.ownerId === viewer.id || submission.ownerEmail === viewer.email || !submission.id;
  }

  return {
    init,
    render,
    newSubmission
  };
}

function submissionListItem(submission, active, staff = false) {
  const label = escapeLocal(submission.name || "Untitled submission");
  return `<button class="submission-item ${active ? "is-active" : ""}" data-submission-id="${escapeLocal(submission.id)}" type="button">
    <strong>${label}</strong>
    <span class="muted">${escapeLocal(submission.tagline || "No tagline yet")}</span>
    <span class="item-meta">
      <span class="badge status-${escapeLocal(submission.status || "draft")}">${escapeLocal(statusLabel(submission.status || "draft"))}</span>
      <span class="badge">Ready ${Number(submission.readiness?.score || 0)}%</span>
      <span class="badge">${escapeLocal(machineStatusLabel(submission.humanValidation?.machineStatus || "not_started"))}</span>
      <span class="badge">${escapeLocal(humanStatusLabel(submission.humanValidation?.humanStatus || "not_eligible"))}</span>
      ${humanBadgeMarkup(submission)}
      ${staff ? `<span class="badge">${escapeLocal(submission.ownerEmail || "partner")}</span>` : ""}
    </span>
  </button>`;
}

function projectPreviewHtml(submission, image) {
  const links = submission.links || [];
  const gallery = (submission.galleryAssetIds || [])
    .map((id) => (submission.assets || []).find((asset) => asset.id === id))
    .filter(Boolean);
  return `<div class="project-page-preview">
    <div class="project-hero">
      <div class="project-hero-thumb">${image ? `<img src="${escapeLocal(image)}" alt="${escapeLocal(submission.name || "Submission")}">` : ""}</div>
      <div>
        <div class="badge-row">
          <span class="badge">${escapeLocal(statusLabel(submission.status || "draft"))}</span>
          <span class="badge">${submission.review?.staffVerified ? "Staff verified" : "Partner supplied"}</span>
        </div>
        <h2>${escapeLocal(submission.name || "Untitled product")}</h2>
        <p class="description">${escapeLocal(submission.shortDescription || submission.tagline || "Add overview copy to preview the project page.")}</p>
        <div class="helper-strip">
          ${links.slice(0, 4).map((link) => `<a class="secondary-action" href="${escapeLocal(link.url)}" target="_blank" rel="noreferrer">${escapeLocal(link.label || link.type)}</a>`).join("")}
        </div>
      </div>
    </div>
    <div class="project-tabs">
      <span>Overview</span><span>Demo</span><span>Files ${gallery.length}</span><span>Technical</span><span>Evaluation locked</span><span>Discussion</span><span>Connect</span>
    </div>
    <p class="locked-copy">Partner access can submit and manage products, but evaluations and Arena scores are staff-validated to keep the leaderboard trusted.</p>
  </div>`;
}

function readinessRow(label, done) {
  return `<div class="readiness-item ${done ? "done" : ""}"><span>${escapeLocal(label)}</span><strong>${done ? "Done" : "Missing"}</strong></div>`;
}

function validateFile(file) {
  if (!IMAGE_TYPES.has(String(file.type || "").toLowerCase())) throw new Error("Only PNG, JPG, JPEG, WEBP, and GIF images are accepted.");
  if (/\.(svg|html?|js|mjs|exe|bat|cmd|ps1)$/i.test(file.name)) throw new Error("Executable or inline web formats are not accepted as uploads.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image uploads must be 1.5 MB or smaller.");
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read upload."));
    reader.readAsDataURL(file);
  });
}

function calculateReadiness(submission) {
  const links = submission.links || [];
  const galleryCount = submission.galleryAssetIds?.length || 0;
  const technical = submission.technicalProfile || {};
  const checks = [
    ["Basics complete", Boolean(submission.name && submission.tagline && submission.shortDescription && submission.category && submission.stage)],
    ["URL or demo link added", links.some((link) => ["website", "demo", "deck", "docs", "github", "huggingface"].includes(link.type))],
    ["Thumbnail uploaded", Boolean(submission.thumbnailAssetId)],
    ["2+ gallery images", galleryCount >= 2],
    ["Founder/team info added", (submission.teamMembers || []).some((member) => member.name && (member.role || member.email))],
    ["Technical metadata added", Boolean([technical.productType, ...(technical.modalities || []), ...(technical.stack || [])].filter(Boolean).join(""))],
    ["Limitations/privacy info added", Boolean(technical.limitations && technical.privacy)],
    ["Launch note added", Boolean(submission.makerNote)]
  ];
  const completedItems = checks.filter(([, done]) => done).map(([label]) => label);
  const missingItems = checks.filter(([, done]) => !done).map(([label]) => label);
  return { score: Math.round((completedItems.length / checks.length) * 100), completedItems, missingItems, canSubmit: missingItems.length === 0 };
}

function generateArenaCardMarkdown(submission) {
  const technical = submission.technicalProfile || {};
  return [
    "---",
    `name: ${JSON.stringify(submission.name || "")}`,
    `type: ${JSON.stringify(submission.type || "")}`,
    `status: ${JSON.stringify(submission.status || "draft")}`,
    `verification: ${submission.review?.staffVerified ? "staff_verified" : "partner_supplied"}`,
    `category: ${JSON.stringify(submission.category || "")}`,
    `stage: ${JSON.stringify(submission.stage || "")}`,
    `modalities: [${(technical.modalities || []).map((item) => JSON.stringify(item)).join(", ")}]`,
    `tags: [${[...(submission.launchTags || []), ...(submission.technicalTags || [])].map((item) => JSON.stringify(item)).join(", ")}]`,
    "---",
    "",
    `# ${submission.name || "Untitled submission"}`,
    "",
    submission.tagline || "",
    "",
    "## Overview",
    submission.shortDescription || "",
    "",
    submission.longDescriptionMarkdown || "",
    "",
    "## Demo and Links",
    ...((submission.links || []).length ? submission.links.map((link) => `- ${link.label || link.type}: ${link.url}`) : ["- No links supplied yet."]),
    "",
    "## Technical",
    `- Product type: ${technical.productType || submission.type || "n/a"}`,
    `- Modalities: ${(technical.modalities || []).join(", ") || "n/a"}`,
    `- Stack: ${(technical.stack || []).join(", ") || "n/a"}`,
    `- Limitations: ${technical.limitations || "Partner supplied; not staff verified."}`,
    `- Privacy: ${technical.privacy || "Partner supplied; not staff verified."}`,
    `- Evaluation claims: ${technical.evaluationClaims || "Partner supplied; not staff verified."}`,
    "",
    "## Maker Note",
    submission.makerNote || "No launch note supplied yet."
  ].join("\n");
}

function setValue(name, value) {
  const field = document.querySelector(`#partnerSubmissionForm [name="${CSS.escape(name)}"]`);
  if (field) field.value = value || "";
}

function linkOf(submission, type) {
  return (submission.links || []).find((link) => link.type === type);
}

function listValue(value) {
  return Array.isArray(value) ? value.join(", ") : value || "";
}

function splitList(value) {
  return String(value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

function safeTrim(value) {
  return String(value || "").trim();
}

function labelForLink(type) {
  return {
    website: "Website",
    demo: "Demo",
    github: "GitHub",
    huggingface: "Hugging Face",
    deck: "Deck",
    docs: "Docs",
    video: "Video",
    figma: "Figma",
    linkedin: "LinkedIn",
    x: "X"
  }[type] || type;
}

function statusLabel(status) {
  return String(status || "draft").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanStatusLabel(status) {
  const labels = {
    not_eligible: "Human: Invitation Required",
    eligible: "Human: Eligible",
    invited: "Human: Invited",
    requested: "Human: Requested",
    assigned: "Human: Assigned",
    in_review: "Human: In Review",
    completed: "Human: Completed",
    needs_more_evidence: "Human: Needs Evidence",
    human_validated: "SparkLabs Human Validated",
    not_validated: "Human: Not Validated",
    cancelled: "Human: Cancelled"
  };
  return labels[status] || statusLabel(status);
}

function machineStatusLabel(status) {
  const labels = {
    not_started: "Machine: Not Started",
    queued: "Machine: Queued",
    running: "Machine: Running",
    passed: "Machine Validated",
    failed: "Machine: Failed",
    needs_review: "Machine: Needs Review"
  };
  return labels[status] || statusLabel(status);
}

function humanBadgeMarkup(submission) {
  const badge = submission?.humanValidation?.badges?.find?.((item) => item.badgeType === "human_validated");
  return badge ? `<span class="badge human-badge">SparkLabs Human Validated</span>` : "";
}

function hasAnyDraftContent(submission) {
  return Boolean(submission?.id || submission?.name || submission?.tagline || submission?.shortDescription || submission?.assets?.length);
}

function renderCounters() {
  const tagline = document.querySelector('#partnerSubmissionForm [name="tagline"]')?.value || "";
  const description = document.querySelector('#partnerSubmissionForm [name="shortDescription"]')?.value || "";
  const taglineCounter = document.querySelector("#taglineCounter");
  const descriptionCounter = document.querySelector("#descriptionCounter");
  if (taglineCounter) taglineCounter.textContent = `${tagline.length} / 60`;
  if (descriptionCounter) descriptionCounter.textContent = `${description.length} / 500`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeLocal(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
