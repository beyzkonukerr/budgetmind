const questions = [
  {
    id: "income",
    label: "1) Aylık ortalama geliriniz hangi aralıktadır?",
    options: [
      { text: "0-2000 TL", value: 1000 },
      { text: "2000-4000 TL", value: 3000 },
      { text: "4000-6000 TL", value: 5000 },
      { text: "6000-8000 TL", value: 7000 },
      { text: "8000 TL ve uzeri", value: 9000 }
    ]
  },
  {
    id: "expense",
    label: "2) Aylık ortalama harcamanız hangi aralıktadır?",
    options: [
      { text: "0-2000 TL", value: 1000 },
      { text: "2000-4000 TL", value: 3000 },
      { text: "4000-6000 TL", value: 5000 },
      { text: "6000-8000 TL", value: 7000 },
      { text: "8000 TL ve uzeri", value: 9000 }
    ]
  },
  {
    id: "tracking",
    label: "3) Harcamalarınızı düzenli olarak takip ediyor musunuz?",
    options: [
      { text: "Evet, düzenli", value: 1 },
      { text: "Bazen", value: 0.5 },
      { text: "Hayır", value: 0 }
    ]
  },
  {
    id: "budgetPlan",
    label: "4) Aylık bütçe planı yapıyor musunuz?",
    options: [
      { text: "Evet", value: 1 },
      { text: "Bazen", value: 0.5 },
      { text: "Hayır", value: 0 }
    ]
  },
  {
    id: "saving",
    label: "5) Düzenli tasarruf ediyor musunuz?",
    options: [
      { text: "Evet", value: 1 },
      { text: "Bazen", value: 0.5 },
      { text: "Hayır", value: 0 }
    ]
  },
  {
    id: "s11",
    label: "6) Ay sonunda paramı yetiştirmekte zorlanıyorum.",
    options: [
      { text: "1 — Kesinlikle katılmıyorum", value: 1 },
      { text: "2 — Katılmıyorum", value: 2 },
      { text: "3 — Kararsızım", value: 3 },
      { text: "4 — Katılıyorum", value: 4 },
      { text: "5 — Kesinlikle katılıyorum", value: 5 }
    ]
  },
  {
    id: "s12",
    label: "7) Beklenmedik giderler beni zor durumda bırakıyor.",
    options: [
      { text: "1 — Kesinlikle katılmıyorum", value: 1 },
      { text: "2 — Katılmıyorum", value: 2 },
      { text: "3 — Kararsızım", value: 3 },
      { text: "4 — Katılıyorum", value: 4 },
      { text: "5 — Kesinlikle katılıyorum", value: 5 }
    ]
  },
  {
    id: "s13",
    label: "8) Gelir ve giderlerimi dengelemekte zorlanıyorum.",
    options: [
      { text: "1 — Kesinlikle katılmıyorum", value: 1 },
      { text: "2 — Katılmıyorum", value: 2 },
      { text: "3 — Kararsızım", value: 3 },
      { text: "4 — Katılıyorum", value: 4 },
      { text: "5 — Kesinlikle katılıyorum", value: 5 }
    ]
  },
  {
    id: "s14",
    label: "9) Finansal konular genel stres düzeyimi artırıyor.",
    options: [
      { text: "1 — Kesinlikle katılmıyorum", value: 1 },
      { text: "2 — Katılmıyorum", value: 2 },
      { text: "3 — Kararsızım", value: 3 },
      { text: "4 — Katılıyorum", value: 4 },
      { text: "5 — Kesinlikle katılıyorum", value: 5 }
    ]
  }
];

const stepGroups = [
  {
    key: "budget",
    title: "Gelir ve gider",
    blurb: "Nakit akışı bütçe baskısı bileşenini besler.",
    questionIds: ["income", "expense"]
  },
  {
    key: "habits",
    title: "Davranış ve disiplin",
    blurb: "Takip, plan ve tasarruf alışkanlıkları davranış skorunu oluşturur.",
    questionIds: ["tracking", "budgetPlan", "saving"]
  },
  {
    key: "stress",
    title: "Finansal stres ölçeği",
    blurb: "Dört ifade Likert ölçeği ile stres boyutu normalize edilir.",
    questionIds: ["s11", "s12", "s13", "s14"]
  }
];

let currentStep = 0;
let lastResultPayload = null;

const resultCard = document.getElementById("result-card");
const resultSummary = document.getElementById("result-summary");
const resultFeedback = document.getElementById("result-feedback");
const deploymentBanner = document.getElementById("deployment-banner");
const analyzeBtn = document.getElementById("analyze-btn");
const resetBtn = document.getElementById("reset-btn");
const emailInput = document.getElementById("email");
const sendEmailInput = document.getElementById("send-email");
const consentInput = document.getElementById("consent");
const stepPrev = document.getElementById("step-prev");
const stepNext = document.getElementById("step-next");
const progressFill = document.getElementById("progress-fill");
const copyResultBtn = document.getElementById("copy-result-btn");

initAdminLinkHint();
renderStepPanels();
renderStepTrack();
updateStepUi();

stepPrev.addEventListener("click", () => {
  currentStep = Math.max(0, currentStep - 1);
  updateStepUi();
});

stepNext.addEventListener("click", () => {
  if (!validateStep(currentStep)) {
    alert("Bu bloktaki tüm soruları yanıtlayın.");
    return;
  }
  currentStep = Math.min(stepGroups.length - 1, currentStep + 1);
  updateStepUi();
});

analyzeBtn.addEventListener("click", async () => {
  if (!validateAllSteps()) {
    alert("Lütfen tüm bloklardaki soruları yanıtlayın. İlerlemek için sonraki blokları da doldurun.");
    return;
  }
  if (!consentInput.checked) {
    alert("Devam etmek için açık rıza onayını işaretlemeniz gerekir.");
    return;
  }

  const answers = readAnswers();
  const payload = {
    ...answers,
    email: emailInput.value.trim(),
    sendEmail: sendEmailInput.checked,
    consent: consentInput.checked
  };

  try {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Hesaplanıyor…";
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "API hatasi olustu.");
    }

    lastResultPayload = data;
    renderResult(data);
    resultCard.classList.remove("hidden");
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    alert(err.message);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "FSI hesapla";
  }
});

resetBtn.addEventListener("click", () => {
  currentStep = 0;
  emailInput.value = "";
  sendEmailInput.checked = false;
  consentInput.checked = false;
  for (const q of questions) {
    const el = document.getElementById(q.id);
    if (el) el.value = "";
  }
  resultCard.classList.add("hidden");
  lastResultPayload = null;
  deploymentBanner.classList.add("hidden");
  deploymentBanner.textContent = "";
  updateStepUi();
});

copyResultBtn.addEventListener("click", async () => {
  if (!lastResultPayload) return;
  const text = buildCopyText(lastResultPayload);
  try {
    await navigator.clipboard.writeText(text);
    copyResultBtn.textContent = "Kopyalandı";
    setTimeout(() => {
      copyResultBtn.textContent = "Özeti kopyala";
    }, 2000);
  } catch (_e) {
    alert("Panoya kopyalanamadı. Tarayıcı iznini kontrol edin.");
  }
});

function initAdminLinkHint() {
  const adminLink = document.getElementById("admin-link");
  const host = window.location.hostname || "";
  if (host.endsWith("vercel.app") || host.endsWith("vercel.com")) {
    adminLink.title =
      "Yönetim paneli SQLite ve oturum gerektirir; tam işlev için uygulamayı yerelde çalıştırın.";
  }
}

function questionsForGroup(group) {
  return questions.filter((q) => group.questionIds.includes(q.id));
}

function renderStepPanels() {
  const container = document.getElementById("step-panels");
  container.innerHTML = stepGroups
    .map((group, index) => {
      const qs = questionsForGroup(group);
      const fields = qs.map((q) => renderQuestionField(q)).join("");
      return `
        <div class="step-panel" data-step="${index}" role="region" aria-labelledby="step-title-${index}">
          <div class="step-panel__head">
            <p class="step-panel__eyebrow">Blok ${index + 1} / ${stepGroups.length}</p>
            <h3 class="step-panel__title" id="step-title-${index}">${escapeHtml(group.title)}</h3>
            <p class="step-panel__blurb">${escapeHtml(group.blurb)}</p>
          </div>
          <div class="step-panel__fields">${fields}</div>
        </div>
      `;
    })
    .join("");
}

function renderQuestionField(q) {
  const options = [`<option value="">Seçiniz</option>`]
    .concat(q.options.map((o) => `<option value="${o.value}">${escapeHtml(o.text)}</option>`))
    .join("");

  return `
    <div class="question">
      <label for="${q.id}">${escapeHtml(q.label)}</label>
      <select id="${q.id}" name="${q.id}" required>${options}</select>
    </div>
  `;
}

function renderStepTrack() {
  const ol = document.getElementById("step-track");
  ol.innerHTML = stepGroups
    .map((group, index) => {
      let state = "";
      if (index === currentStep) state = "is-active";
      else if (index < currentStep) state = "is-done";
      return `
        <li class="step-track__item ${state}">
          <span class="step-track__n" aria-hidden="true">${index + 1}</span>
          <span class="step-track__text">
            <strong>${escapeHtml(group.title)}</strong>
            <span>${escapeHtml(group.blurb)}</span>
          </span>
        </li>
      `;
    })
    .join("");
}

function updateStepUi() {
  renderStepTrack();
  document.querySelectorAll(".step-panel").forEach((panel) => {
    const idx = Number(panel.dataset.step);
    panel.classList.toggle("is-active", idx === currentStep);
    panel.hidden = idx !== currentStep;
  });
  stepPrev.disabled = currentStep === 0;
  stepNext.textContent = currentStep === stepGroups.length - 1 ? "Son bloktasınız" : "Sonraki blok";
  stepNext.disabled = currentStep === stepGroups.length - 1;
  const pct = ((currentStep + 1) / stepGroups.length) * 100;
  progressFill.style.width = `${pct}%`;
}

function validateStep(stepIndex) {
  const group = stepGroups[stepIndex];
  for (const id of group.questionIds) {
    const el = document.getElementById(id);
    if (!el || el.value === "") return false;
  }
  return true;
}

function validateAllSteps() {
  return stepGroups.every((_g, i) => validateStep(i));
}

function readAnswers() {
  const output = {};
  for (const q of questions) {
    output[q.id] = Number(document.getElementById(q.id).value);
  }
  return output;
}

function resolveComponents(r) {
  if (r.components) {
    return r.components;
  }
  const behaviorRisk = Number.isFinite(r.behaviorRisk)
    ? r.behaviorRisk
    : 1 - Number(r.behaviorScore);
  return {
    stressShare: 0.55 * Number(r.stressNorm),
    budgetShare: 0.25 * Number(r.budgetPressure),
    behaviorShare: 0.2 * behaviorRisk
  };
}

function renderResult(data) {
  const r = data.result;
  const tips = data.feedbackList || [];
  const fsiPct = (r.weightedFSI * 100).toFixed(1);
  const stressPct = (r.stressNorm * 100).toFixed(1);
  const comps = resolveComponents(r);
  const dialClass = `fsi-dial fsi-dial--${r.css}`;

  if (data.deploymentNote) {
    deploymentBanner.textContent = data.deploymentNote;
    deploymentBanner.classList.remove("hidden");
  } else {
    deploymentBanner.classList.add("hidden");
    deploymentBanner.textContent = "";
  }

  const recordLine =
    data.submissionId != null
      ? `<p class="session-line">Kayıt numarası: <strong>#${data.submissionId}</strong></p>`
      : `<p class="session-line session-line--muted">Bulut önizlemesi: sonuç yalnızca bu oturumda tutulur.</p>`;

  resultSummary.innerHTML = `
    ${recordLine}
    <div class="result-visual">
      <div class="${dialClass}" style="--fsi:${Number(r.weightedFSI)}">
        <div class="fsi-dial__inner">
          <span class="fsi-dial__value">${fsiPct}%</span>
          <span class="fsi-dial__label">FSI</span>
          <span class="badge badge--pill ${r.css}">${escapeHtml(r.level)}</span>
        </div>
      </div>
      <div class="result-breakdown">
        <h3 class="breakdown-title">Model katkıları</h3>
        <p class="breakdown-lead">Her çubuk ilgili terimin FSI içindeki payını gösterir (toplamı FSI ile örtüşür).</p>
        ${renderBreakdownRow("Stres (0,55 × normalize ölçek)", comps.stressShare, "var(--chart-stress)")}
        ${renderBreakdownRow("Bütçe baskısı (0,25 × baskı)", comps.budgetShare, "var(--chart-budget)")}
        ${renderBreakdownRow("Davranış riski (0,20 × (1 − davranış))", comps.behaviorShare, "var(--chart-behavior)")}
        <div class="metric-grid metric-grid--tight">
          <div class="metric metric--ghost">
            <div class="metric__label">Stres ölçeği toplamı</div>
            <div class="metric__value">${r.stressRaw} / 20</div>
          </div>
          <div class="metric metric--ghost">
            <div class="metric__label">Stres (normalize)</div>
            <div class="metric__value">${stressPct}%</div>
          </div>
          <div class="metric metric--ghost">
            <div class="metric__label">Bütçe farkı (gelir − gider)</div>
            <div class="metric__value">${formatCurrency(r.budgetGap)} TL</div>
          </div>
          <div class="metric metric--ghost">
            <div class="metric__label">Davranış skoru</div>
            <div class="metric__value">${Number(r.behaviorScore).toFixed(2)} / 1,00</div>
          </div>
        </div>
      </div>
    </div>
  `;

  resultFeedback.innerHTML = `
    <div class="feedback-block">
      <h3>Önerilen aksiyonlar</h3>
      <ul>${tips.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderBreakdownRow(label, share, colorVar) {
  const width = Math.min(100, Math.max(0, share * 100));
  const value = (share * 100).toFixed(1);
  return `
    <div class="breakdown-row">
      <div class="breakdown-row__label">
        <span>${escapeHtml(label)}</span>
        <span class="breakdown-row__value">${value} birim</span>
      </div>
      <div class="breakdown-bar" role="presentation">
        <span class="breakdown-bar__fill" style="width:${width}%; background:${colorVar};"></span>
      </div>
    </div>
  `;
}

function buildCopyText(data) {
  const r = data.result;
  const tips = data.feedbackList || [];
  const lines = [
    "BudgetMind — FSI özeti",
    `FSI: ${(r.weightedFSI * 100).toFixed(1)}%`,
    `Risk: ${r.level}`,
    `Stres (norm): ${(r.stressNorm * 100).toFixed(1)}%`,
    `Bütçe farkı: ${formatCurrency(r.budgetGap)} TL`,
    `Davranış skoru: ${Number(r.behaviorScore).toFixed(2)} / 1`,
    "",
    "Öneriler:",
    ...tips.map((t, i) => `${i + 1}. ${t}`)
  ];
  if (data.submissionId != null) lines.splice(2, 0, `Kayıt: #${data.submissionId}`);
  if (data.deploymentNote) lines.push("", data.deploymentNote);
  return lines.join("\n");
}

function formatCurrency(v) {
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toLocaleString("tr-TR")}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
