
import { ModelOption } from "../types";

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B",
    provider: "Meta",
    isFree: true
  },
  {
    id: "qwen/qwen-2.5-vl-72b-instruct:free",
    name: "Qwen 2.5 72B",
    provider: "Qwen",
    isFree: true
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash",
    provider: "Google",
    isFree: true
  },
  {
    id: "deepseek/deepseek-r1-distill-llama-70b:free",
    name: "DeepSeek R1 (Llama)",
    provider: "DeepSeek",
    isFree: true
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    isFree: false
  },
  {
    id: "anthropic/claude-3.5-haiku",
    name: "Claude 3.5 Haiku",
    provider: "Anthropic",
    isFree: false
  }
];

// Distribute defaults across different providers to minimize rate limit collisions
export const DEFAULT_MODELS = {
  PRO: "meta-llama/llama-3.3-70b-instruct:free",      // Meta
  CON: "qwen/qwen-2.5-vl-72b-instruct:free",          // Qwen/Alibaba
  JUDGE: "google/gemini-2.0-flash-exp:free",          // Google
  MODERATOR: "meta-llama/llama-3.3-70b-instruct:free" // Meta (Reliable fallback)
};
