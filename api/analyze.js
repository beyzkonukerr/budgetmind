"use strict";

const {
  normalizeInput,
  calculateScore,
  generateFeedback
} = require("../lib/scoring.cjs");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }
  try {
    const input = normalizeInput(req.body);
    const result = calculateScore(input);
    const feedbackList = generateFeedback(result);
    return res.status(200).json({
      submissionId: null,
      result,
      feedbackList,
      deploymentNote:
        "Bu bulut ortamında sonuç veritabanına yazılmaz ve e-posta gönderimi yapılmaz. Yönetim paneli ve kayıt için uygulamayı yerelde `npm start` ile çalıştırın."
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Analiz islemi basarisiz oldu."
    });
  }
};
