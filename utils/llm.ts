
import { ModelOption } from "../types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface GenerateOptions {
  model: string;
  systemInstruction: string;
  prompt: string;
  jsonMode?: boolean;
}

export async function generateCompletion({ model, systemInstruction, prompt, jsonMode = false }: GenerateOptions): Promise<string> {
  // Retrieve API key from environment variables to keep it secure and out of the repo.
  // Prioritize OPENROUTER_API_KEY if set, otherwise fall back to API_KEY.
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.API_KEY;
  
  if (!apiKey) {
    console.error("Missing API Key. Please set OPENROUTER_API_KEY in your .env file.");
    throw new Error("API Key not found. Please configure OPENROUTER_API_KEY in your environment.");
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

  let attempt = 0;
  const maxRetries = 3;

  while (attempt < maxRetries) {
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

      // Handle Rate Limits (429) by retrying with backoff
      if (response.status === 429) {
        attempt++;
        if (attempt >= maxRetries) {
          const errorData = await response.text();
          throw new Error(`OpenRouter API Error: ${response.status} - ${errorData}`);
        }
        console.warn(`Rate limit hit (429). Retrying attempt ${attempt + 1} in ${attempt * 2}s...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        continue;
      }

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
      // If we've exhausted retries or it's a fatal error, rethrow
      if (attempt >= maxRetries - 1) {
        console.error("LLM Generation Failed:", error);
        throw error;
      }
      // If it was a network error (fetch failed), increment and retry
      attempt++;
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  
  throw new Error("Failed to generate completion after multiple attempts");
}
