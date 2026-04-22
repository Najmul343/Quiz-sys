export async function generateQuestionsAI(subject: string, topic: string, difficulty: string, count: number, contextText?: string) {
  const parsedCount = Number(count);
  if (!subject || !topic || !difficulty || !Number.isFinite(parsedCount) || parsedCount < 1) {
    throw new Error("Please choose subject, chapter/topic, and at least 1 question.");
  }

  const requestBody = {
    subject,
    topic,
    difficulty,
    count: parsedCount,
    contextText,
  };

  try {
    const response = await fetch('/api/generate-questions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'AI generation request failed.');
    }

    if (!Array.isArray(payload?.questions)) {
      throw new Error('AI returned an invalid question format.');
    }

    return payload.questions;
  } catch (e) {
    // Local Vite dev server doesn't automatically serve Vercel functions.
    // Fallback to direct Gemini call when the serverless route isn't reachable.
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    if (!apiKey) throw e;

    const prompt = `Generate ${parsedCount} MCQ questions based on the following context.
Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}

Context Information:
${contextText || `Using general knowledge about ${topic}`}

Return ONLY a JSON array in this format:
[
  {
    "text": "Question text here?",
    "options": { "A": "Opt 1", "B": "Opt 2", "C": "Opt 3", "D": "Opt 4" },
    "answer": "A",
    "difficulty": "${difficulty}",
    "explanation": "Why A is correct",
    "subject": "${subject}"
  }
]`;

    const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash"];
    let lastError: unknown = e;
    for (const model of modelsToTry) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.5, responseMimeType: "application/json" },
          }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          throw new Error((data as any)?.error?.message || `Gemini request failed (${resp.status}).`);
        }
        const text = String((data as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') || '').trim();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('AI returned an invalid question format.');
        return parsed;
      } catch (err) {
        lastError = err;
      }
    }

    throw (lastError instanceof Error ? lastError : new Error('AI generation request failed.'));
  }
}
