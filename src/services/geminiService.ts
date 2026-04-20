import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateQuestionsAI(subject: string, topic: string, difficulty: string, count: number, contextText?: string) {
  try {
    const prompt = `Generate ${count} MCQ questions based on the following context.
    Subject: ${subject}
    Topic: ${topic}
    Difficulty: ${difficulty}
    
    Context Information:
    ${contextText || 'Using general knowledge about ' + topic}

    IMPORTANT: Analyze if a question requires a diagram, figure, or visual aid (e.g., if it refers to "the diagram", "figure 1", "this circuit", "following graph", etc.).
    If it does, set "needsImage" to true and provide a short "imageDescription".

    MATHEMATICAL CONTENT: For any mathematical expressions, equations, or scientific notation (integration, differentiation, complex physics formulas, etc.), you MUST use LaTeX formatting wrapped in dollar signs ($...$ for inline, $$...$$ for block).

    Return ONLY a JSON array in this format:
    [
      {
        "text": "Question text here (with LaTeX if needed)?",
        "options": { "A": "Opt 1", "B": "Opt 2", "C": "Opt 3", "D": "Opt 4" },
        "answer": "A",
        "difficulty": "${difficulty}",
        "explanation": "Why A is correct (with LaTeX if needed)",
        "subject": "${subject}",
        "needsImage": true/false,
        "imageDescription": "Description of the required diagram if needsImage is true"
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
