import { GoogleGenAI } from "@google/genai";

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

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: buildPrompt(subject, topic, difficulty, parsedCount, contextText) }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.5,
      }
    });

    const text = typeof response.text === 'function' ? response.text() : response.text;
    if (!text) {
      return res.status(502).json({ error: 'No response from Gemini.' });
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
