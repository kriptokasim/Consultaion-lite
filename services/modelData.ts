
import { ModelOption } from "../types";

export const AVAILABLE_MODELS: ModelOption[] = [
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
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash",
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
  PRO: "meta-llama/llama-3.3-70b-instruct:free",
  CON: "mistralai/mistral-small-24b-instruct-2501:free",
  JUDGE: "meta-llama/llama-3.3-70b-instruct:free",
  MODERATOR: "microsoft/phi-3-mini-128k-instruct:free"
};
