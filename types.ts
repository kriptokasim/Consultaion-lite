
export enum AgentRole {
  PRO = 'PRO',
  CON = 'CON',
  JUDGE = 'JUDGE',
  MODERATOR = 'MODERATOR'
}

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  isFree?: boolean;
}

export interface DebateAgent {
  id: AgentRole;
  name: string;
  title: string;
  avatarUrl: string;
  color: string;
  systemInstruction: string;
  modelId?: string; // The specific LLM model ID assigned to this agent
}

export interface TranscriptEntry {
  id: string;
  role: AgentRole;
  agentName: string;
  modelName?: string; // To display which LLM generated this
  text: string;
  timestamp: Date;
  citations?: string[];
}

export interface VoteState {
  proScore: number; // 0-100
  conScore: number; // 0-100 (usually 100 - proScore)
  reasoning: string;
}

export interface RoundSummary {
  roundNumber: number;
  proText: string;
  conText: string;
  judgeResult: {
    proScore: number;
    reasoning: string;
  };
}

export type AppState = 'SETUP' | 'DEBATING' | 'CONCLUDED';
