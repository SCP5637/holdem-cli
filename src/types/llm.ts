export interface LLMPreset {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxThinkingTimeMs?: number;
  customPrompt?: string;
}

export interface LLMAssignment {
  playerIndex: number;
  presetName: string;
}
