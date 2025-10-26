// pages/api/grade.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const API_KEY = process.env.GOOGLE_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: "Missing GOOGLE_API_KEY" });

  const { question = "", expectedAnswer = "", studentAnswer = "" } = req.body || {};

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    // Use a stable, supported model
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
Grade a short answer from 0-100.

Question: ${question}
Teacher answer: ${expectedAnswer}
Student answer: ${studentAnswer}

Output STRICT JSON ONLY:
{"score": <integer 0-100>, "rationale": "<<=200 chars>"}
    `.trim();

    const resp = await model.generateContent([{ text: prompt }]);
    const raw = resp.response?.text?.() ?? "";
    // Tolerate fenced JSON
    const text = raw.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // ultra-simple fallback if JSON parsing fails
      const s = (studentAnswer || "").toLowerCase();
      const e = (expectedAnswer || "").toLowerCase();
      const close = s && e && (s.includes(e) || e.includes(s));
      parsed = { score: close ? 95 : 10, rationale: "Fallback heuristic score." };
    }

    return res.status(200).json({
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      rationale: String(parsed.rationale || "").slice(0, 200),
      model: "gemini-2.5-flash",
    });
  } catch (err) {
    console.error("[/api/grade] error", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}