"use strict";

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function normalizeInput(body) {
  const requiredKeys = [
    "income",
    "expense",
    "tracking",
    "budgetPlan",
    "saving",
    "s11",
    "s12",
    "s13",
    "s14"
  ];

  for (const key of requiredKeys) {
    if (body[key] === undefined || body[key] === null || body[key] === "") {
      throw new Error(`Eksik alan: ${key}`);
    }
  }
  if (body.consent !== true) {
    throw new Error("Analiz icin acik riza onayi zorunlu.");
  }

  const normalized = {
    email: body.email ? String(body.email).trim() : "",
    sendEmail: Boolean(body.sendEmail),
    income: Number(body.income),
    expense: Number(body.expense),
    tracking: Number(body.tracking),
    budgetPlan: Number(body.budgetPlan),
    saving: Number(body.saving),
    s11: Number(body.s11),
    s12: Number(body.s12),
    s13: Number(body.s13),
    s14: Number(body.s14)
  };

  if (!Number.isFinite(normalized.income) || normalized.income <= 0) {
    throw new Error("Gelir degeri gecersiz.");
  }

  return normalized;
}

function calculateScore(a) {
  const budgetGap = a.income - a.expense;
  const budgetPressure = clamp01((a.expense - a.income) / Math.max(1, a.income));
  const stressRaw = a.s11 + a.s12 + a.s13 + a.s14;
  const stressNorm = clamp01((stressRaw - 4) / 16);
  const behaviorScore = (a.tracking + a.budgetPlan + a.saving) / 3;
  const behaviorRisk = 1 - behaviorScore;
  const weightedFSI =
    0.55 * stressNorm + 0.25 * budgetPressure + 0.2 * behaviorRisk;

  let level = "Dusuk Risk";
  let css = "low";
  if (weightedFSI >= 0.6) {
    level = "Yuksek Risk";
    css = "high";
  } else if (weightedFSI >= 0.4) {
    level = "Orta Risk";
    css = "medium";
  }

  const components = {
    stressShare: 0.55 * stressNorm,
    budgetShare: 0.25 * budgetPressure,
    behaviorShare: 0.2 * behaviorRisk
  };

  return {
    weightedFSI,
    stressRaw,
    stressNorm,
    behaviorScore,
    budgetGap,
    budgetPressure,
    behaviorRisk,
    level,
    css,
    components
  };
}

function generateFeedback(r) {
  const tips = [];
  if (r.budgetGap < 0) {
    tips.push(
      "Harcama gelirden yuksek. Zorunlu giderleri onceliklendirip haftalik harcama limiti belirleyin."
    );
  } else {
    tips.push(
      "Gelir-gider dengesi uygun. Aylik sabit tasarruf transferini otomatik hale getirin."
    );
  }

  if (r.behaviorScore < 0.6) {
    tips.push(
      "Takip, butce plani ve tasarruf davranislarinda sureklilik dusuk. 50/30/20 modelini deneyin."
    );
  } else {
    tips.push(
      "Davranis disiplini guclu. Acil durum fonunu en az 3 aylik gider seviyesine cikarabilirsiniz."
    );
  }

  if (r.stressNorm >= 0.6) {
    tips.push(
      "Stres seviyesi yuksek. Harcamalari zorunlu/istege bagli olarak ayirip gereksiz kalemleri azaltin."
    );
  } else if (r.stressNorm >= 0.4) {
    tips.push(
      "Orta duzey finansal stres var. Donemsel gider piklerine ozel harcama tavani belirleyin."
    );
  } else {
    tips.push(
      "Stres seviyesi dusuk. Mevcut rutini koruyup aylik performans izleme raporu tutabilirsiniz."
    );
  }
  return tips;
}

module.exports = {
  clamp01,
  normalizeInput,
  calculateScore,
  generateFeedback
};
