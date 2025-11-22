
import { ModelOption } from "../types";

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "google/gemini-2.0-flash-lite-preview-02-05:free",
    name: "Gemini 2.0 Flash Lite",
    provider: "Google",
    isFree: true
  },
  {
    id: "google/gemini-2.0-pro-exp-02-05:free",
    name: "Gemini 2.0 Pro",
    provider: "Google",
    isFree: true
  },
  {
    id: "deepseek/deepseek-r1:free",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    isFree: true
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B",
    provider: "Meta",
    isFree: true
  },
  {
    id: "mistralai/mistral-small-24b-instruct-2501:free",
    name: "Mistral Small 3",
    provider: "Mistral",
    isFree: true
  },
  {
    id: "microsoft/phi-3-mini-128k-instruct:free",
    name: "Phi-3 Mini",
    provider: "Microsoft",
    isFree: true
  },
  // Paid fallbacks if user has credits, or for comparison
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

export const DEFAULT_MODELS = {
  PRO: "google/gemini-2.0-flash-lite-preview-02-05:free",
  CON: "deepseek/deepseek-r1:free",
  JUDGE: "google/gemini-2.0-pro-exp-02-05:free",
  MODERATOR: "google/gemini-2.0-flash-lite-preview-02-05:free"
};
