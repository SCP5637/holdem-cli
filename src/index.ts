/**
 * 德州扑克游戏主入口
 * 协调游戏初始化、主游戏循环和手牌执行
 */

import { GameState, GameConfig, PlayerAction, GamePhase, Player } from './types/game';
import { createGame, executeAction, nextPlayer, isBettingRoundComplete, advancePhase, determineHandWinners, awardPot, isHandOver, prepareNewHand, getCurrentPlayer, getAvailableActions } from './core/gameState';
import { getAIAction } from './core/aiPlayer';
import { getLLMAction } from './core/llmPlayer';
import { evaluateHand } from './core/handEvaluator';
import { getGameConfig, getPlayerAction, waitForEnter } from './ui/inputHandler';
import { renderGameState, renderHandResult, renderAction, renderGameOver, clearScreen } from './ui/gameRenderer';
import { loadLLMPresets } from './core/llmPresetStore';
import { LLMPreset } from './types/llm';

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MIN_PLAYERS = 2;

/**
 * 游戏主入口
 */
async function main(): Promise<void> {
  const { numPlayers, humanPosition, llmAssignments } = await getGameConfig();

  const config: GameConfig = {
    numPlayers,
    startingChips: STARTING_CHIPS,
    smallBlind: SMALL_BLIND,
    bigBlind: BIG_BLIND,
    humanPlayerIndex: humanPosition,
    llmAssignments
  };

  const llmPresets = await loadLLMPresets();
  const llmPresetMap = new Map(llmPresets.map(p => [p.name, p]));

  let state = createGame(config);

  while (getActivePlayerCount(state) >= MIN_PLAYERS) {
    await playHand(state, llmPresetMap);

    if (getActivePlayerCount(state) < MIN_PLAYERS) {
      break;
    }

    await waitForEnter('\n按 Enter 键开始下一手牌...');
    prepareNewHand(state);
  }

  renderGameOver(state);
}

/**
 * 执行单轮扑克手牌
 * @param state - 当前游戏状态
 * @param llmPresetMap - LLM预设映射
 */
async function playHand(state: GameState, llmPresetMap: Map<string, LLMPreset>): Promise<void> {
  renderGameState(state);

  while (!isHandOver(state)) {
    await playBettingRound(state, llmPresetMap);

    if (isHandOver(state)) {
      break;
    }

    if (isBettingRoundComplete(state)) {
      advancePhase(state);
      renderGameState(state);
    }
  }

  await resolveHand(state);
}

/**
 * 执行单轮下注
 * @param state - 当前游戏状态
 * @param llmPresetMap - LLM预设映射
 */
async function playBettingRound(state: GameState, llmPresetMap: Map<string, LLMPreset>): Promise<void> {
  const activePlayers = state.players.filter(p => p.isActive && !p.isAllIn);

  if (activePlayers.length <= 1) {
    return;
  }

  let roundComplete = false;

  while (!roundComplete) {
    const player = getCurrentPlayer(state);

    if (player.isActive && !player.isAllIn) {
      renderGameState(state);

      const action = await getAction(state, player, llmPresetMap);

      if (action) {
        const success = executeAction(state, action.action, action.amount);

        if (success) {
          renderAction(player.name, action.action, action.amount);

          if (!player.isHuman) {
            await delay(1000);
          }
        }
      }
    }

    if (isBettingRoundComplete(state)) {
      roundComplete = true;
    } else {
      nextPlayer(state);
    }
  }
}

/**
 * 获取当前玩家的动作（人类、LLM 或普通 AI）
 * @param state - 当前游戏状态
 * @param player - 当前玩家
 * @param llmPresetMap - LLM预设映射
 * @returns 所选动作和可选金额
 */
async function getAction(state: GameState, player: Player, llmPresetMap: Map<string, LLMPreset>): Promise<{ action: PlayerAction; amount?: number } | null> {
  const availableActions = getAvailableActions(state);

  if (availableActions.length === 0) {
    return null;
  }

  if (player.isHuman) {
    return await getPlayerAction(availableActions);
  }

  // 检查玩家是否配置了LLM
  if (player.llmPresetName) {
    const preset = llmPresetMap.get(player.llmPresetName);
    if (preset) {
      return await getLLMAction(state, preset);
    }
  }

  // 默认使用普通AI
  return getAIAction(state);
}

/**
 * 结算手牌并分配底池
 * @param state - 当前游戏状态
 */
async function resolveHand(state: GameState): Promise<void> {
  const winners = determineHandWinners(state);

  const handDescriptions = new Map<number, string>();
  for (const player of state.players) {
    if (player.isActive) {
      const allCards = [...player.hand, ...state.communityCards];
      const evaluation = evaluateHand(allCards);
      handDescriptions.set(player.id, evaluation.description);
    }
  }

  renderGameState(state, true);
  renderHandResult(state, winners, handDescriptions);

  awardPot(state, winners);

  await waitForEnter();
}

/**
 * 获取仍有筹码的玩家数量
 * @param state - 当前游戏状态
 * @returns 活跃玩家数量
 */
function getActivePlayerCount(state: GameState): number {
  return state.players.filter(p => p.chips > 0 || p.currentBet > 0).length;
}

/**
 * 创建 AI 回合的延迟
 * @param ms - 延迟毫秒数
 * @returns 延迟后解析的 Promise
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(console.error);
