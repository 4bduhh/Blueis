// Vercel Serverless Function — /api/chat
// Keeps the Gemini API key on the server. The browser never sees it.
// Uses Google's Interactions API (the successor to the old generateContent endpoint).

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

  // Build the "input" as a sequence of steps (user_input / model_output),
  // which is how the Interactions API represents multi-turn conversation.
  const input = [];

  if (Array.isArray(history)) {
    history.slice(-10).forEach((turn) => {
      if (!turn || !turn.text) return;
      input.push({
        type: turn.role === 'user' ? 'user_input' : 'model_output',
        content: [{ type: 'text', text: String(turn.text).slice(0, 2000) }]
      });
    });
  }

  input.push({
    type: 'user_input',
    content: [{ type: 'text', text: message.slice(0, 2000) }]
  });

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: 'gemini-flash-latest',
          system_instruction:
            'You are the friendly AI assistant embedded on the Blueis website. ' +
            'Answer briefly and helpfully. Here is what you know about Blueis:\n' +
            '- Blueis is a No.1 3D animation website / studio, providing 3D animation services.\n' +
            '- Founder: Abdulla Ashif — a tech guy and entrepreneur.\n' +
            "- Founder's Instagram: https://www.instagram.com/_4bduhh_/\n" +
            '- Blueis official Instagram: https://www.instagram.com/blueis.in/\n' +
            'If you do not know something about Blueis beyond this, say so honestly ' +
            'instead of making things up.',
          input,
          generation_config: { max_output_tokens: 300 }
        })
      }
    );

    const data = await upstream.json();

    if (!upstream.ok || data.status === 'failed') {
      console.error('Gemini API error:', JSON.stringify(data));
      return res.status(502).json({ error: 'Upstream AI error' });
    }

    // Find the model's output step and pull out its text content.
    const outputStep = Array.isArray(data.steps)
      ? data.steps.find((s) => s.type === 'model_output')
      : null;

    const reply =
      outputStep?.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('') || "Sorry, I couldn't come up with a reply just now.";

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat function error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}