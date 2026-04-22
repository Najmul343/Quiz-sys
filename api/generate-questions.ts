type VercelRequest = {
  method?: string;
  body?: any;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (payload: any) => void;
  setHeader: (name: string, value: string[]) => void;
};

const buildPrompt = (subject: string, topic: string, difficulty: string, count: number, contextText?: string) => `Generate ${count} MCQ questions based on the following context.
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}

Context Information:
${contextText || `Using general knowledge about ${topic}`}

IMPORTANT: Analyze if a question requires a diagram, figure, or visual aid (e.g., if it refers to "the diagram", "figure 1", "this circuit", "following graph", etc.).
If it does, set "needsImage" to true and provide a short "imageDescription".

MATHEMATICAL CONTENT: For any mathematical expressions, equations, or scientific notation, use LaTeX formatting wrapped in dollar signs.

FORMATTING RULES:
- Write the question text and explanation in clean markdown.
- Preserve readable line breaks for match-the-following, assertions/reasons, tables, paragraph cases, and step-based explanations.
- Use short bullet lists in explanations when it improves clarity.
- Use **bold** only for key labels or headings when useful.
- Do not return HTML.
- If the question contains List-I / List-II or columns to match, place each item on its own line.

Return ONLY a JSON array in this format:
[
  {
    "text": "Question text here?",
    "options": { "A": "Opt 1", "B": "Opt 2", "C": "Opt 3", "D": "Opt 4" },
    "answer": "A",
    "difficulty": "${difficulty}",
    "explanation": "Why A is correct",
    "subject": "${subject}",
    "needsImage": true,
    "imageDescription": "Description if needed"
  }
]`;

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

async function callGemini(apiKey: string, model: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: "application/json",
      },
    }),
  });

  const data = (await resp.json().catch(() => ({}))) as GeminiResponse;
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Gemini request failed (${resp.status}).`);
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('No response from Gemini.');
  return text;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing Gemini API key on server.' });
    }

    const { subject, topic, difficulty, count, contextText } = req.body || {};
    const parsedCount = Number(count);

    if (!subject || !topic || !difficulty || !Number.isFinite(parsedCount) || parsedCount < 1) {
      return res.status(400).json({ error: 'Subject, topic, difficulty, and a question count greater than 0 are required.' });
    }

    const prompt = buildPrompt(subject, topic, difficulty, parsedCount, contextText);
    const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash"];

    let text = "";
    let lastError: unknown = null;
    for (const model of modelsToTry) {
      try {
        // eslint-disable-next-line no-await-in-loop
        text = await callGemini(apiKey, model, prompt);
        break;
      } catch (e) {
        lastError = e;
      }
    }

    if (!text) {
      return res.status(502).json({ error: lastError instanceof Error ? lastError.message : 'No response from Gemini.' });
    }

    const questions = JSON.parse(text);
    if (!Array.isArray(questions)) {
      return res.status(502).json({ error: 'Gemini returned invalid question data.' });
    }

    return res.status(200).json({ questions });
  } catch (error) {
    console.error('AI question generation API error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown AI generation failure.'
    });
  }
}
