/**
 * 游戏状态管理系统
 * 处理游戏初始化、下注轮和状态转换
 */

import { GameState, Player, GamePhase, GameConfig, PlayerAction, HandResult } from '../types/game';
import { Card } from '../types/card';
import { createShuffledDeck, dealCards } from './deck';
import { evaluateHand, determineWinners } from './handEvaluator';

/**
 * 使用指定配置创建新游戏
 * @param config - 游戏配置选项
 * @returns 初始游戏状态
 */
export function createGame(config: GameConfig): GameState {
  const players: Player[] = [];
  const llmAssignmentMap = new Map((config.llmAssignments ?? []).map(item => [item.playerIndex, item.presetName]));

  for (let i = 0; i < config.numPlayers; i++) {
    const llmPresetName = llmAssignmentMap.get(i);

    players.push({
      id: i,
      name: i === config.humanPlayerIndex ? 'You' : llmPresetName ? `Player ${i + 1} [LLM]` : `Player ${i + 1}`,
      chips: config.startingChips,
      hand: [],
      isActive: true,
      isHuman: i === config.humanPlayerIndex,
      llmPresetName,
      currentBet: 0,
      hasActed: false,
      isAllIn: false
    });
  }

  const deck = createShuffledDeck();

  const state: GameState = {
    players,
    communityCards: [],
    pot: 0,
    currentPhase: GamePhase.PreFlop,
    currentPlayerIndex: 0,
    dealerIndex: 0,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    currentBet: 0,
    minRaise: config.bigBlind,
    deck,
    handNumber: 1
  };

  postBlinds(state);
  dealHoleCards(state);
  setFirstToAct(state);

  return state;
}

/**
 * 下大小盲注
 * @param state - 当前游戏状态
 */
function postBlinds(state: GameState): void {
  const smallBlindIndex = (state.dealerIndex + 1) % state.players.length;
  const bigBlindIndex = (state.dealerIndex + 2) % state.players.length;

  placeBet(state, smallBlindIndex, state.smallBlind);
  placeBet(state, bigBlindIndex, state.bigBlind);

  state.currentBet = state.bigBlind;
}

/**
 * 给每个活跃玩家发两张底牌
 * @param state - 当前游戏状态
 */
function dealHoleCards(state: GameState): void {
  for (const player of state.players) {
    if (player.isActive) {
      player.hand = dealCards(state.deck, 2);
    }
  }
}

/**
 * 根据当前阶段设置第一个行动的玩家
 * @param state - 当前游戏状态
 */
function setFirstToAct(state: GameState): void {
  if (state.currentPhase === GamePhase.PreFlop) {
    state.currentPlayerIndex = (state.dealerIndex + 3) % state.players.length;
  } else {
    state.currentPlayerIndex = (state.dealerIndex + 1) % state.players.length;
  }

  skipInactivePlayers(state);
}

/**
 * 跳过不活跃或全押的玩家
 * @param state - 当前游戏状态
 */
function skipInactivePlayers(state: GameState): void {
  const startIndex = state.currentPlayerIndex;
  let attempts = 0;

  while (attempts < state.players.length) {
    const player = state.players[state.currentPlayerIndex];
    if (player.isActive && !player.isAllIn && player.chips > 0) {
      return;
    }
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    attempts++;
  }
}

/**
 * 玩家下注
 * @param state - 当前游戏状态
 * @param playerIndex - 下注玩家的索引
 * @param amount - 下注金额
 */
function placeBet(state: GameState, playerIndex: number, amount: number): void {
  const player = state.players[playerIndex];
  const actualBet = Math.min(amount, player.chips);

  player.chips -= actualBet;
  player.currentBet += actualBet;
  state.pot += actualBet;

  if (player.chips === 0) {
    player.isAllIn = true;
  }
}

/**
 * 执行玩家动作并更新游戏状态
 * @param state - 当前游戏状态
 * @param action - 要执行的动作
 * @param amount - 可选的加注金额
 * @returns 如果动作有效并执行则返回true
 */
export function executeAction(state: GameState, action: PlayerAction, amount?: number): boolean {
  const player = state.players[state.currentPlayerIndex];

  if (!player.isActive || player.isAllIn) {
    return false;
  }

  switch (action) {
    case PlayerAction.Fold:
      player.isActive = false;
      break;

    case PlayerAction.Check:
      if (player.currentBet < state.currentBet) {
        return false;
      }
      break;

    case PlayerAction.Call:
      const callAmount = state.currentBet - player.currentBet;
      if (callAmount > 0) {
        placeBet(state, state.currentPlayerIndex, callAmount);
      }
      break;

    case PlayerAction.Raise:
      if (!amount || amount < state.minRaise) {
        return false;
      }
      const raiseAmount = amount - player.currentBet;
      if (raiseAmount > player.chips) {
        return false;
      }
      placeBet(state, state.currentPlayerIndex, raiseAmount);
      state.currentBet = player.currentBet;
      state.minRaise = amount;
      resetHasActed(state);
      break;

    case PlayerAction.AllIn:
      const allInAmount = player.chips;
      if (allInAmount > 0) {
        placeBet(state, state.currentPlayerIndex, allInAmount);
        if (player.currentBet > state.currentBet) {
          state.currentBet = player.currentBet;
          resetHasActed(state);
        }
      }
      break;
  }

  player.hasActed = true;
  return true;
}

/**
 * 重置所有非全押、未弃牌玩家的hasActed标志
 * @param state - 当前游戏状态
 */
function resetHasActed(state: GameState): void {
  for (const player of state.players) {
    if (player.isActive && !player.isAllIn) {
      player.hasActed = false;
    }
  }
}

/**
 * 移动到下一个玩家
 * @param state - 当前游戏状态
 */
export function nextPlayer(state: GameState): void {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  skipInactivePlayers(state);
}

/**
 * 检查当前下注轮是否完成
 * @param state - 当前游戏状态
 * @returns 如果下注轮完成则返回true
 */
export function isBettingRoundComplete(state: GameState): boolean {
  const activePlayers = state.players.filter(p => p.isActive);

  if (activePlayers.length <= 1) {
    return true;
  }

  const nonAllInPlayers = activePlayers.filter(p => !p.isAllIn);

  if (nonAllInPlayers.length === 0) {
    return true;
  }

  return nonAllInPlayers.every(p => p.hasActed && p.currentBet === state.currentBet);
}

/**
 * 推进游戏到下一阶段
 * @param state - 当前游戏状态
 */
export function advancePhase(state: GameState): void {
  resetBets(state);

  switch (state.currentPhase) {
    case GamePhase.PreFlop:
      state.communityCards.push(...dealCards(state.deck, 3));
      state.currentPhase = GamePhase.Flop;
      break;
    case GamePhase.Flop:
      state.communityCards.push(...dealCards(state.deck, 1));
      state.currentPhase = GamePhase.Turn;
      break;
    case GamePhase.Turn:
      state.communityCards.push(...dealCards(state.deck, 1));
      state.currentPhase = GamePhase.River;
      break;
    case GamePhase.River:
      state.currentPhase = GamePhase.Showdown;
      break;
  }

  if (state.currentPhase !== GamePhase.Showdown) {
    setFirstToAct(state);
  }
}

/**
 * 重置下注，开始新的下注轮
 * @param state - 当前游戏状态
 */
function resetBets(state: GameState): void {
  for (const player of state.players) {
    player.currentBet = 0;
    player.hasActed = false;
  }
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
}

/**
 * 确定手牌的获胜者
 * @param state - 当前游戏状态
 * @returns 获胜玩家ID数组
 */
export function determineHandWinners(state: GameState): number[] {
  const activePlayers = state.players.filter(p => p.isActive);

  if (activePlayers.length === 1) {
    return [activePlayers[0].id];
  }

  const results: HandResult[] = activePlayers.map(player => {
    const allCards = [...player.hand, ...state.communityCards];
    const evaluation = evaluateHand(allCards);
    return {
      playerId: player.id,
      handRank: evaluation.rank,
      kickers: evaluation.kickers,
      description: evaluation.description
    };
  });

  return determineWinners(results);
}

/**
 * 将底池分配给获胜者
 * @param state - 当前游戏状态
 * @param winnerIds - 获胜玩家ID数组
 */
export function awardPot(state: GameState, winnerIds: number[]): void {
  const share = Math.floor(state.pot / winnerIds.length);
  const remainder = state.pot % winnerIds.length;

  for (let i = 0; i < winnerIds.length; i++) {
    const winner = state.players.find(p => p.id === winnerIds[i])!;
    winner.chips += share + (i < remainder ? 1 : 0);
  }

  state.pot = 0;
}

/**
 * 检查手牌是否结束（只剩一个活跃玩家或摊牌完成）
 * @param state - 当前游戏状态
 * @returns 如果手牌结束则返回true
 */
export function isHandOver(state: GameState): boolean {
  const activePlayers = state.players.filter(p => p.isActive);
  return activePlayers.length <= 1 || state.currentPhase === GamePhase.Showdown;
}

/**
 * 准备新一手牌
 * @param state - 当前游戏状态
 */
export function prepareNewHand(state: GameState): void {
  state.deck = createShuffledDeck();
  state.communityCards = [];
  state.pot = 0;
  state.currentPhase = GamePhase.PreFlop;
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.handNumber++;

  for (const player of state.players) {
    player.hand = [];
    player.isActive = player.chips > 0;
    player.currentBet = 0;
    player.hasActed = false;
    player.isAllIn = false;
  }

  state.dealerIndex = (state.dealerIndex + 1) % state.players.length;

  postBlinds(state);
  dealHoleCards(state);
  setFirstToAct(state);
}

/**
 * 获取当前玩家
 * @param state - 当前游戏状态
 * @returns 当前玩家
 */
export function getCurrentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

/**
 * 获取当前玩家可用的动作
 * @param state - 当前游戏状态
 * @returns 可用动作数组
 */
export function getAvailableActions(state: GameState): PlayerAction[] {
  const player = getCurrentPlayer(state);
  const actions: PlayerAction[] = [];

  if (!player.isActive || player.isAllIn) {
    return actions;
  }

  actions.push(PlayerAction.Fold);

  const toCall = state.currentBet - player.currentBet;

  if (toCall === 0) {
    actions.push(PlayerAction.Check);
  } else {
    actions.push(PlayerAction.Call);
  }

  if (player.chips > toCall) {
    actions.push(PlayerAction.Raise);
  }

  if (player.chips > 0) {
    actions.push(PlayerAction.AllIn);
  }

  return actions;
}
