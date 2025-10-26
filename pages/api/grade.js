// pages/api/grade.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { question = '', expectedAnswer = '', studentAnswer = '' } = req.body || {};

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing GOOGLE_API_KEY' });

  // Use a model that exists for your project (you listed these via ListModels).
  const MODEL = 'models/gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:generateContent?key=${apiKey}`;

  const prompt = `
You are grading a short-answer question. Compare the student's answer to the expected answer.
Return ONLY a JSON object on one line with fields: score (0-100 integer) and rationale (short string).
Question: ${question}
Expected answer: ${expectedAnswer}
Student answer: ${studentAnswer}
JSON:
`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }]}],
      }),
    });
    const j = await r.json();
    const text =
      j?.candidates?.[0]?.content?.parts?.[0]?.text ??
      j?.candidates?.[0]?.content?.parts?.[0]?.inline_data?.data ??
      '';

    // Try to parse the JSON the model returned
    let parsed = { score: null, rationale: '' };
    try {
      // grab the first {...} block
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch (_) {}

    const score = Number.isFinite(Number(parsed.score)) ? Math.round(Number(parsed.score)) : null;
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : '';

    return res.status(200).json({ score, rationale, model: MODEL, raw: text });
  } catch (e) {
    console.error('[grade api] error', e);
    return res.status(500).json({ error: 'Gemini call failed' });
  }
}