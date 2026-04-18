import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateQuestionsAI(subject: string, topic: string, difficulty: string, count: number) {
  try {
    const prompt = `Generate ${count} MCQ questions about ${subject}.
    Topic details: ${topic}
    Difficulty: ${difficulty}
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

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("AI Question Generation Error:", error);
    throw error;
  }
}
