import * as fs from 'fs/promises';
import * as path from 'path';
import { LLMPreset } from '../types/llm';

const LOCAL_DIR = '.holdem-local';
const PRESETS_FILE = 'llm-presets.json';

export function getLLMPresetsPath(): string {
  return path.join(process.cwd(), LOCAL_DIR, PRESETS_FILE);
}

export async function loadLLMPresets(): Promise<LLMPreset[]> {
  const filePath = getLLMPresetsPath();

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as { presets?: LLMPreset[] };
    return Array.isArray(data.presets) ? data.presets.filter(isValidPreset) : [];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    console.log(`读取 LLM 预设失败，将使用空预设列表: ${(error as Error).message}`);
    return [];
  }
}

export async function saveLLMPresets(presets: LLMPreset[]): Promise<void> {
  const filePath = getLLMPresetsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ presets }, null, 2), 'utf-8');
}

export async function upsertLLMPreset(preset: LLMPreset): Promise<LLMPreset[]> {
  const presets = await loadLLMPresets();
  const index = presets.findIndex(item => item.name === preset.name);

  if (index >= 0) {
    presets[index] = preset;
  } else {
    presets.push(preset);
  }

  await saveLLMPresets(presets);
  return presets;
}

function isValidPreset(value: LLMPreset): boolean {
  return Boolean(value && value.name && value.baseUrl && value.apiKey && value.model);
}
