// pages/api/gradeWithGemini.js
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = { api: { bodyParser: true } };

function tryJson(text) {
  try {
    const fence = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    const raw = fence ? fence[1] : text;
    return JSON.parse(raw);
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });
  const { studentAnswer = '', correctAnswer = '' } = req.body || {};
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return res.status(500).json({ error: 'Missing GOOGLE_API_KEY' });

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
Grade the student's short answer from 0-100 based on semantic correctness and completeness.

Correct answer (teacher):
"""${correctAnswer}"""

Student answer (transcribed):
"""${studentAnswer}"""

Return STRICT JSON (no extra prose):
{"score": 88, "feedback": "One brief, specific sentence."}
`.trim();

    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() ?? '';
    const parsed = tryJson(text) || {};
    let score = Number(parsed.score);
    if (!Number.isFinite(score)) score = 0;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const feedback = String(parsed.feedback || '').slice(0, 1000);

    res.status(200).json({ score, feedback, model: 'gemini-1.5-flash', raw: text });
  } catch (e) {
    console.error('[Gemini] error', e);
    res.status(500).json({ error: 'Gemini request failed' });
  }
}