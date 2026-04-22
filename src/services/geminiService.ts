export async function generateQuestionsAI(subject: string, topic: string, difficulty: string, count: number, contextText?: string) {
  const parsedCount = Number(count);
  if (!subject || !topic || !difficulty || !Number.isFinite(parsedCount) || parsedCount < 1) {
    throw new Error("Please choose subject, chapter/topic, and at least 1 question.");
  }

  const response = await fetch('/api/generate-questions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject,
      topic,
      difficulty,
      count: parsedCount,
      contextText,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'AI generation request failed.');
  }

  if (!Array.isArray(payload?.questions)) {
    throw new Error('AI returned an invalid question format.');
  }

  return payload.questions;
}
