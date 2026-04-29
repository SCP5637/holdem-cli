export interface LLMPreset {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMAssignment {
  playerIndex: number;
  presetName: string;
}
