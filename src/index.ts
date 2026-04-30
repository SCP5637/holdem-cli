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
import { renderGameState, renderHandResult, renderAction, renderGameOver, clearScreen, startWaitingAnimation } from './ui/gameRenderer';
import { loadLLMPresets } from './core/llmPresetStore';
import { LLMPreset } from './types/llm';
import { logger } from './core/logger';

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MIN_PLAYERS = 2;

/**
 * 游戏主入口
 */
async function main(): Promise<void> {
  // 检查是否启用调试模式（通过环境变量或启动参数）
  const debugMode = process.argv.includes('--debug') || process.env.HOLDEM_DEBUG === 'true';
  await logger.initialize(debugMode);

  logger.info('GAME', '游戏启动', { debugMode });

  try {
    const { numPlayers, humanPosition, llmAssignments } = await getGameConfig();

    const config: GameConfig = {
      numPlayers,
      startingChips: STARTING_CHIPS,
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      humanPlayerIndex: humanPosition,
      llmAssignments
    };

    logger.info('GAME', '游戏配置', config);

    const llmPresets = await loadLLMPresets();
    const llmPresetMap = new Map(llmPresets.map(p => [p.name, p]));

    logger.info('GAME', '已加载 LLM 预设', { presets: llmPresets.map(p => p.name) });

    let state = createGame(config);
    logger.info('GAME', '游戏创建成功', { players: state.players.map(p => ({ name: p.name, isHuman: p.isHuman, llmPreset: p.llmPresetName })) });

    while (getActivePlayerCount(state) >= MIN_PLAYERS) {
      await playHand(state, llmPresetMap);

      if (getActivePlayerCount(state) < MIN_PLAYERS) {
        break;
      }

      await waitForEnter('\n按 Enter 键开始下一手牌...');
      prepareNewHand(state);
    }

    renderGameOver(state);
    logger.info('GAME', '游戏结束');
  } finally {
    await logger.destroy();
  }
}

/**
 * 执行单轮扑克手牌
 * @param state - 当前游戏状态
 * @param llmPresetMap - LLM预设映射
 */
async function playHand(state: GameState, llmPresetMap: Map<string, LLMPreset>): Promise<void> {
  logger.info('GAME', '开始新的一手牌', { hand: state.handNumber, dealer: state.dealerIndex });
  renderGameState(state);

  while (!isHandOver(state)) {
    await playBettingRound(state, llmPresetMap);

    if (isHandOver(state)) {
      break;
    }

    if (isBettingRoundComplete(state)) {
      const prevPhase = state.currentPhase;
      advancePhase(state);
      logger.logPhaseChange(prevPhase, state.currentPhase);
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

      // 如果是AI玩家，显示动态等待动画
      let stopAnimation: (() => void) | null = null;
      if (!player.isHuman) {
        const thinkingMessage = player.llmPresetName
          ? `[LLM] ${player.name} 正在思考`
          : `${player.name} 正在思考`;
        stopAnimation = startWaitingAnimation(thinkingMessage);
      }

      const action = await getAction(state, player, llmPresetMap);

      // 停止动画
      if (stopAnimation) {
        stopAnimation();
      }

      if (action) {
        const success = executeAction(state, action.action, action.amount);

        if (success) {
          renderAction(player.name, action.action, action.amount);
          logger.logGameAction(player.name, action.action, action.amount);
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
  return await getAIAction(state);
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

main().catch(console.error);
