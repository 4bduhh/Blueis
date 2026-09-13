// Vercel Serverless Function — /api/chat
// Keeps the Gemini API key on the server. The browser never sees it.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing message' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY' });
  }

  // Turn our simple {role, text} history into Gemini's "contents" format.
  const contents = [];

  // A short system-style instruction, sent as the first user turn context.
  contents.push({
    role: 'user',
    parts: [{
      text: 'You are the friendly AI assistant embedded on the Blueis website. ' +
            'Answer briefly and helpfully. If you do not know something about ' +
            'Blueis specifically, say so honestly instead of making things up.'
    }]
  });
  contents.push({ role: 'model', parts: [{ text: 'Understood, I will help visitors of Blueis.' }] });

  if (Array.isArray(history)) {
    history.slice(-10).forEach((turn) => {
      if (!turn || !turn.text) return;
      contents.push({
        role: turn.role === 'user' ? 'user' : 'model',
        parts: [{ text: String(turn.text).slice(0, 2000) }]
      });
    });
  }

  contents.push({ role: 'user', parts: [{ text: message.slice(0, 2000) }] });

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
        })
      }
    );

    const data = await upstream.json();

    if (!upstream.ok) {
      console.error('Gemini API error:', data);
      return res.status(502).json({ error: 'Upstream AI error' });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      "Sorry, I couldn't come up with a reply just now.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat function error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
