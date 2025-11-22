
import { DebateAgent, AgentRole } from '../types';

// Use 'notionists' for a sketched, intellectual look fitting the Hansard theme
const getAvatar = (seed: string) => 
  `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}`;

export const AGENTS: Record<AgentRole, DebateAgent> = {
  [AgentRole.PRO]: {
    id: AgentRole.PRO,
    name: "The Proponent",
    title: "Affirmative Action",
    avatarUrl: getAvatar("Proponent"),
    color: "bg-amber-600",
    systemInstruction: "You are the Proponent in a formal debate. Your goal is to argue IN FAVOR of the given topic. Be persuasive, logical, and cite general principles. Keep your arguments punchy (under 100 words). Use a confident, forward-looking tone."
  },
  [AgentRole.CON]: {
    id: AgentRole.CON,
    name: "The Skeptic",
    title: "Constructive Opposition",
    avatarUrl: getAvatar("Skeptic"),
    color: "bg-stone-600",
    systemInstruction: "You are the Skeptic in a formal debate. Your goal is to argue AGAINST the given topic. Scrutinize the proposition, point out flaws, risks, and unintended consequences. Be analytical and sharp. Keep your arguments punchy (under 100 words)."
  },
  [AgentRole.JUDGE]: {
    id: AgentRole.JUDGE,
    name: "The Chamber",
    title: "Voting System",
    avatarUrl: `https://api.dicebear.com/9.x/icons/svg?seed=Scale`,
    color: "bg-gray-800",
    systemInstruction: "You are the Voting Chamber AI. Analyze the last two arguments. Provide a JSON response with: 1. 'proScore' (0-100) representing the strength of the affirmative side (50 if tied). 2. 'reasoning' (1 sentence). 3. 'isConcluded' (boolean). Set 'isConcluded' to true if one side has achieved a dominant victory (>80% score), if the opposing arguments are repetitive, or if the core conflict is resolved. Do not prolong the debate unnecessarily."
  },
  [AgentRole.MODERATOR]: {
    id: AgentRole.MODERATOR,
    name: "Speaker",
    title: "House Speaker",
    avatarUrl: getAvatar("Speaker"),
    color: "bg-amber-800",
    systemInstruction: "You are the Speaker of the House. Briefly introduce the topic and the debaters."
  }
};
