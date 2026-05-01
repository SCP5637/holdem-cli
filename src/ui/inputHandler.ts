/**
 * 输入处理模块
 * 管理命令行的异步用户输入和验证
 */

import * as readline from 'readline';
import { PlayerAction } from '../types/game';
import { LLMAssignment, LLMPreset } from '../types/llm';
import { loadLLMPresets, upsertLLMPreset, deleteLLMPreset } from '../core/llmPresetStore';

/**
 * 创建 readline 接口用于用户输入
 * @returns 配置好的 readline 接口
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * 提示用户输入并返回响应
 * @param question - 显示的提示文本
 * @returns 解析为用户输入的 Promise
 */
export async function getInput(question: string): Promise<string> {
  const rl = createInterface();

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 提示用户选择数字选项
 * @param question - 显示的提示文本
 * @param min - 最小有效值
 * @param max - 最大有效值
 * @returns 解析为所选数字的 Promise
 */
export async function getNumberInput(question: string, min: number, max: number): Promise<number> {
  while (true) {
    const input = await getInput(question);
    const num = parseInt(input, 10);

    if (!isNaN(num) && num >= min && num <= max) {
      return num;
    }

    console.log(`输入无效。请输入 ${min} 到 ${max} 之间的数字。`);
  }
}

/**
 * 提示用户从可用动作中选择
 * @param actions - 可用动作数组
 * @returns 解析为所选动作和可选金额的 Promise
 */
export async function getPlayerAction(
  actions: PlayerAction[]
): Promise<{ action: PlayerAction; amount?: number }> {
  console.log('\n可选动作:');

  const actionMap: Map<number, PlayerAction> = new Map();
  let optionNumber = 1;

  for (const action of actions) {
    const displayText = getActionDisplayText(action);
    console.log(`  ${optionNumber}. ${displayText}`);
    actionMap.set(optionNumber, action);
    optionNumber++;
  }

  const choice = await getNumberInput('选择动作: ', 1, actions.length);
  const selectedAction = actionMap.get(choice)!;

  if (selectedAction === PlayerAction.Raise) {
    const amount = await getNumberInput('输入加注金额: ', 1, Number.MAX_SAFE_INTEGER);
    return { action: selectedAction, amount };
  }

  return { action: selectedAction };
}

/**
 * 获取动作的中文显示文本
 * @param action - 玩家动作
 * @returns 中文动作描述
 */
function getActionDisplayText(action: PlayerAction): string {
  const displayMap: Record<PlayerAction, string> = {
    [PlayerAction.Fold]: '弃牌',
    [PlayerAction.Check]: '过牌',
    [PlayerAction.Call]: '跟注',
    [PlayerAction.Raise]: '加注',
    [PlayerAction.AllIn]: '全押'
  };

  return displayMap[action];
}

/**
 * 提示用户输入初始游戏配置
 * @returns 解析为玩家数量和人类玩家位置的 Promise
 */
export async function getGameConfig(): Promise<{ numPlayers: number; humanPosition: number; llmAssignments: LLMAssignment[] }> {
  console.log('\n=== 德州扑克 ===\n');

  const presets = await configureLLMPresets();
  const numPlayers = await getNumberInput('输入玩家数量 (2-8): ', 2, 8);
  const humanPosition = await getNumberInput(`输入你的座位位置 (1-${numPlayers}): `, 1, numPlayers);
  const llmAssignments = await configureLLMOpponents(numPlayers, humanPosition - 1, presets);

  return { numPlayers, humanPosition: humanPosition - 1, llmAssignments };
}

async function configureLLMPresets(): Promise<LLMPreset[]> {
  let presets = await loadLLMPresets();

  console.log(`已加载 ${presets.length} 个 LLM API 预设。`);
  const shouldManage = await getYesNoInput('是否管理 LLM API 预设？(y/N): ', false);

  if (!shouldManage) {
    return presets;
  }

  while (true) {
    renderPresetList(presets);
    console.log('\n  --- 操作 ---');
    console.log('  1. 新增预设');
    console.log('  2. 覆盖预设');
    console.log('  3. 删除预设');
    console.log('  0. 完成');

    const choice = await getNumberInput('选择操作: ', 0, 3);

    if (choice === 0) {
      return presets;
    }

    if (choice === 1) {
      const preset = await getLLMPresetInput(presets, false);
      presets = await upsertLLMPreset(preset);
      console.log(`已新增预设: ${preset.name}`);
    } else if (choice === 2) {
      if (presets.length === 0) {
        console.log('没有可覆盖的预设，请先新增预设。');
        continue;
      }
      const presetIndex = await getNumberInput(`选择要覆盖的预设 (1-${presets.length}): `, 1, presets.length);
      const existingPreset = presets[presetIndex - 1];
      const preset = await getLLMPresetInput(presets, true, existingPreset);
      presets = await upsertLLMPreset(preset);
      console.log(`已覆盖预设: ${preset.name}`);
    } else if (choice === 3) {
      if (presets.length === 0) {
        console.log('没有可删除的预设。');
        continue;
      }
      const presetIndex = await getNumberInput(`选择要删除的预设 (1-${presets.length}): `, 1, presets.length);
      const presetToDelete = presets[presetIndex - 1];
      const confirmed = await getYesNoInput(`确认删除预设 "${presetToDelete.name}"? (y/N): `, false);
      if (confirmed) {
        presets = await deleteLLMPreset(presetToDelete.name);
        console.log(`已删除预设: ${presetToDelete.name}`);
      } else {
        console.log('已取消删除。');
      }
    }
  }
}

async function getLLMPresetInput(
  existingPresets: LLMPreset[],
  isUpdate: boolean,
  existingPreset?: LLMPreset
): Promise<LLMPreset> {
  const name = await getPresetNameInput(existingPresets, isUpdate, existingPreset?.name);
  const baseUrl = await getBaseUrlInput(existingPreset?.baseUrl);
  const apiKey = await getApiKeyInput(existingPreset?.apiKey);
  const model = await getRequiredInput('模型名称，例如 gpt-4o-mini: ', existingPreset?.model);
  const temperature = await getTemperatureInput(existingPreset?.temperature);
  const maxTokensInput = await getMaxTokensInput(existingPreset?.maxTokens);

  let customPrompt: string | undefined = existingPreset?.customPrompt;
  const useCustomPrompt = await getYesNoInput('是否设定自定义提示词？(y/N): ', false);
  if (useCustomPrompt) {
    console.log('请输入自定义提示词（多行输入，输入空行结束）：');
    customPrompt = await getMultilineInput();
  }

  return {
    name,
    baseUrl,
    apiKey,
    model,
    temperature,
    maxTokens: maxTokensInput,
    customPrompt
  };
}

async function getPresetNameInput(
  existingPresets: LLMPreset[],
  isUpdate: boolean,
  defaultValue?: string
): Promise<string> {
  while (true) {
    const prompt = defaultValue ? `预设名称 (${defaultValue}): ` : '预设名称: ';
    const input = await getInput(prompt);
    const name = input.trim() || defaultValue;

    if (!name) {
      console.log('预设名称不能为空。');
      continue;
    }

    const exists = existingPresets.some(p => p.name === name);

    if (isUpdate) {
      if (!exists) {
        console.log('该预设名称不存在，无法覆盖。');
        continue;
      }
    } else {
      if (exists) {
        console.log('该预设名称已存在，请使用其他名称或选择覆盖操作。');
        continue;
      }
    }

    return name;
  }
}

async function getBaseUrlInput(defaultValue?: string): Promise<string> {
  while (true) {
    const prompt = defaultValue
      ? `OpenAI 兼容 API Base URL (${defaultValue}): `
      : 'OpenAI 兼容 API Base URL，例如 https://api.openai.com/v1: ';
    const input = await getInput(prompt);
    const baseUrl = input.trim() || defaultValue;

    if (!baseUrl) {
      console.log('Base URL 不能为空。');
      continue;
    }

    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      console.log('Base URL 必须以 http:// 或 https:// 开头。');
      continue;
    }

    try {
      new URL(baseUrl);
    } catch {
      console.log('Base URL 格式无效，请输入有效的 URL。');
      continue;
    }

    return baseUrl;
  }
}

async function getApiKeyInput(defaultValue?: string): Promise<string> {
  while (true) {
    const prompt = defaultValue ? `API Key (${maskApiKey(defaultValue)}): ` : 'API Key: ';
    const input = await getInput(prompt);
    const apiKey = input.trim() || defaultValue;

    if (!apiKey) {
      console.log('API Key 不能为空。');
      continue;
    }

    if (apiKey.length < 8) {
      console.log('API Key 长度过短，请检查输入。');
      continue;
    }

    return apiKey;
  }
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '***';
  }
  return apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
}

async function getMaxTokensInput(defaultValue?: number): Promise<number | undefined> {
  const MAX_TOKENS_LIMIT = 1000000;

  while (true) {
    const prompt = defaultValue !== undefined
      ? `max tokens，可留空默认 ${defaultValue}: `
      : 'max tokens，可留空默认 120，支持 k/m 单位 (如 4k, 1m): ';
    const input = (await getInput(prompt)).trim().toLowerCase();

    if (input === '') {
      return defaultValue;
    }

    let value: number;

    if (input.endsWith('m')) {
      const num = parseFloat(input.slice(0, -1));
      if (isNaN(num) || num < 0) {
        console.log('输入无效，请输入正数或带 k/m 单位的数值。');
        continue;
      }
      value = Math.floor(num * 1000000);
    } else if (input.endsWith('k')) {
      const num = parseFloat(input.slice(0, -1));
      if (isNaN(num) || num < 0) {
        console.log('输入无效，请输入正数或带 k/m 单位的数值。');
        continue;
      }
      value = Math.floor(num * 1000);
    } else {
      value = parseInt(input, 10);
      if (isNaN(value) || value < 0) {
        console.log('输入无效，请输入正整数或带 k/m 单位的数值。');
        continue;
      }
    }

    if (value > MAX_TOKENS_LIMIT) {
      console.log(`max tokens 不能超过 1M (${MAX_TOKENS_LIMIT})，请重新输入。`);
      continue;
    }

    return value;
  }
}

async function configureLLMOpponents(numPlayers: number, humanPosition: number, presets: LLMPreset[]): Promise<LLMAssignment[]> {
  if (presets.length === 0) {
    return [];
  }

  const useLLM = await getYesNoInput('是否为电脑对手指定 LLM 控制？(y/N): ', false);

  if (!useLLM) {
    return [];
  }

  const assignments: LLMAssignment[] = [];

  for (let i = 0; i < numPlayers; i++) {
    if (i === humanPosition) {
      continue;
    }

    console.log(`\nPlayer ${i + 1}:`);
    console.log('  0. 普通 AI');
    presets.forEach((preset, index) => {
      console.log(`  ${index + 1}. ${preset.name} (${preset.model})`);
    });

    const choice = await getNumberInput('选择控制方式: ', 0, presets.length);

    if (choice > 0) {
      assignments.push({ playerIndex: i, presetName: presets[choice - 1].name });
    }
  }

  return assignments;
}

async function getRequiredInput(question: string, defaultValue?: string): Promise<string> {
  while (true) {
    const prompt = defaultValue ? `${question.replace(/: $/, '')} (${defaultValue}): ` : question;
    const input = await getInput(prompt);
    const value = input.trim() || defaultValue;

    if (value && value.length > 0) {
      return value;
    }

    console.log('输入不能为空。');
  }
}

async function getYesNoInput(question: string, defaultValue: boolean): Promise<boolean> {
  while (true) {
    const input = (await getInput(question)).toLowerCase();

    if (input === '') {
      return defaultValue;
    }

    if (input === 'y' || input === 'yes') {
      return true;
    }

    if (input === 'n' || input === 'no') {
      return false;
    }

    console.log('请输入 y 或 n。');
  }
}

function renderPresetList(presets: LLMPreset[]): void {
  console.log('\n当前 LLM API 预设:');

  if (presets.length === 0) {
    console.log('  [无]');
    return;
  }

  presets.forEach((preset, index) => {
    console.log(`  [#${index + 1}] ${preset.name} - ${preset.model} - ${preset.baseUrl}`);
  });
}

function parseOptionalNumber(input: string): number | undefined {
  if (input === '') {
    return undefined;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

async function getTemperatureInput(defaultValue?: number): Promise<number | undefined> {
  while (true) {
    const prompt = defaultValue !== undefined
      ? `temperature (0.95-1)，可留空默认 ${defaultValue}: `
      : 'temperature (0.95-1)，可留空默认 1: ';
    const input = (await getInput(prompt)).trim();

    if (input === '') {
      return defaultValue;
    }

    const value = parseFloat(input);
    if (isNaN(value)) {
      console.log('输入无效，请输入数字。');
      continue;
    }

    if (value < 0.95 || value > 1) {
      console.log('temperature 必须在 0.95 到 1 之间。');
      continue;
    }

    return value;
  }
}

async function getMultilineInput(): Promise<string> {
  const lines: string[] = [];
  while (true) {
    const line = await getInput('');
    if (line === '') {
      break;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/**
 * 等待用户按 Enter 键继续
 * @param message - 可选的显示消息
 */
export async function waitForEnter(message: string = '按 Enter 键继续...'): Promise<void> {
  await getInput(message);
}
