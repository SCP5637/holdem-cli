/**
 * 输入处理模块
 * 管理命令行的异步用户输入和验证
 */

import * as readline from 'readline';
import { PlayerAction } from '../types/game';

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
export async function getGameConfig(): Promise<{ numPlayers: number; humanPosition: number }> {
  console.log('\n=== 德州扑克 ===\n');

  const numPlayers = await getNumberInput('输入玩家数量 (2-8): ', 2, 8);
  const humanPosition = await getNumberInput(`输入你的座位位置 (1-${numPlayers}): `, 1, numPlayers);

  return { numPlayers, humanPosition: humanPosition - 1 };
}

/**
 * 等待用户按 Enter 键继续
 * @param message - 可选的显示消息
 */
export async function waitForEnter(message: string = '按 Enter 键继续...'): Promise<void> {
  await getInput(message);
}
