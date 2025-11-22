
import { ModelOption } from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface GenerateOptions {
  model: string;
  systemInstruction: string;
  prompt: string;
  jsonMode?: boolean;
}

export async function generateCompletion({ model, systemInstruction, prompt, jsonMode = false }: GenerateOptions): Promise<string> {
  // Explicitly use the provided OpenRouter key.
  // We ignore process.env.API_KEY here because it usually contains a Google GenAI key
  // which causes 401 Unauthorized errors when sent to OpenRouter endpoints.
  const apiKey = "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";
  
  if (!apiKey) {
    throw new Error("API Key not found");
  }

  const messages = [
    { role: "system", content: systemInstruction },
    { role: "user", content: prompt }
  ];

  const body: any = {
    model: model,
    messages: messages,
    temperature: 0.7,
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": typeof window !== 'undefined' ? window.location.origin : "https://consultai.app",
        "X-Title": "ConsultAI Debate",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`OpenRouter API Error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content || "";
    } else {
      throw new Error("No content returned from model");
    }
  } catch (error) {
    console.error("LLM Generation Failed:", error);
    throw error;
  }
}
