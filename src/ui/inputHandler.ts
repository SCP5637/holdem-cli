/**
 * 输入处理模块
 * 管理命令行的异步用户输入和验证
 */

import * as readline from 'readline';
import { PlayerAction } from '../types/game';
import { LLMAssignment, LLMPreset } from '../types/llm';
import { loadLLMPresets, upsertLLMPreset } from '../core/llmPresetStore';

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
    console.log('  1. 新增或覆盖预设');
    console.log('  2. 完成');

    const choice = await getNumberInput('选择操作: ', 1, 2);

    if (choice === 2) {
      return presets;
    }

    const preset = await getLLMPresetInput();
    presets = await upsertLLMPreset(preset);
    console.log(`已保存预设: ${preset.name}`);
  }
}

async function getLLMPresetInput(): Promise<LLMPreset> {
  const name = await getRequiredInput('预设名称: ');
  const baseUrl = await getRequiredInput('OpenAI 兼容 API Base URL，例如 https://api.openai.com/v1: ');
  const apiKey = await getRequiredInput('API Key: ');
  const model = await getRequiredInput('模型名称，例如 gpt-4o-mini: ');
  const temperatureInput = await getInput('temperature，可留空默认 0.2: ');
  const maxTokensInput = await getInput('max tokens，可留空默认 120: ');

  return {
    name,
    baseUrl,
    apiKey,
    model,
    temperature: parseOptionalNumber(temperatureInput),
    maxTokens: parseOptionalNumber(maxTokensInput)
  };
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

async function getRequiredInput(question: string): Promise<string> {
  while (true) {
    const input = await getInput(question);

    if (input.length > 0) {
      return input;
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
    console.log(`  ${index + 1}. ${preset.name} - ${preset.model} - ${preset.baseUrl}`);
  });
}

function parseOptionalNumber(input: string): number | undefined {
  if (input === '') {
    return undefined;
  }

  const value = Number(input);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * 等待用户按 Enter 键继续
 * @param message - 可选的显示消息
 */
export async function waitForEnter(message: string = '按 Enter 键继续...'): Promise<void> {
  await getInput(message);
}
