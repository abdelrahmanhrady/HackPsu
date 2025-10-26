// pages/api/friendlyFeedback.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const API_KEY = process.env.GOOGLE_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: "Missing GOOGLE_API_KEY" });

  const { text = "" } = req.body || {};
  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const resp = await model.generateContent([{ text }]);
    const raw = resp.response?.text?.() ?? "";
    res.status(200).json({ simplified: raw.trim() });
  } catch (err) {
    console.error("[friendlyFeedback] error", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
}
