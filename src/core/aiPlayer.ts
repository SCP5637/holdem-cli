/**
 * AI对手逻辑
 * 实现电脑控制玩家的决策算法
 */

import { GameState, Player, PlayerAction } from '../types/game';
import { getAvailableActions, getCurrentPlayer } from './gameState';
import { evaluateHand } from './handEvaluator';
import { Card } from '../types/card';

/**
 * 根据游戏状态和手牌强度决定AI的动作
 * @param state - 当前游戏状态
 * @returns 所选动作和可选加注金额
 */
export function getAIAction(state: GameState): { action: PlayerAction; amount?: number } {
  const player = getCurrentPlayer(state);
  const availableActions = getAvailableActions(state);

  if (availableActions.length === 0) {
    return { action: PlayerAction.Fold };
  }

  const handStrength = calculateHandStrength(state, player);
  const potOdds = calculatePotOdds(state, player);
  const aggression = calculateAggression(state);

  return makeDecision(state, player, handStrength, potOdds, aggression, availableActions);
}

/**
 * 计算AI手牌的相对强度（0-1范围）
 * @param state - 当前游戏状态
 * @param player - AI玩家
 * @returns 0到1之间的手牌强度值
 */
function calculateHandStrength(state: GameState, player: Player): number {
  const allCards: Card[] = [...player.hand, ...state.communityCards];

  if (allCards.length < 2) {
    return 0.5;
  }

  const evaluation = evaluateHand(allCards);
  const baseStrength = evaluation.rank / 9;

  const kickerBonus = evaluation.kickers.length > 0
    ? (evaluation.kickers[0] / 14) * 0.1
    : 0;

  return Math.min(baseStrength + kickerBonus, 1);
}

/**
 * 计算AI玩家的底池赔率
 * @param state - 当前游戏状态
 * @param player - AI玩家
 * @returns 底池赔率比例
 */
function calculatePotOdds(state: GameState, player: Player): number {
  const toCall = state.currentBet - player.currentBet;

  if (toCall === 0) {
    return 1;
  }

  return toCall / (state.pot + toCall);
}

/**
 * 根据游戏状态计算侵略性因子
 * @param state - 当前游戏状态
 * @returns 0.5到1.5之间的侵略性因子
 */
function calculateAggression(state: GameState): number {
  const activePlayers = state.players.filter(p => p.isActive).length;
  const baseAggression = 1;
  const positionFactor = (state.players.length - state.currentPlayerIndex) / state.players.length;

  return baseAggression + (positionFactor * 0.5);
}

/**
 * 基于手牌强度、底池赔率和侵略性做出决策
 * @param state - 当前游戏状态
 * @param player - AI玩家
 * @param handStrength - 计算的手牌强度
 * @param potOdds - 计算的底池赔率
 * @param aggression - 侵略性因子
 * @param availableActions - 玩家可用动作
 * @returns 所选动作和可选加注金额
 */
function makeDecision(
  state: GameState,
  player: Player,
  handStrength: number,
  potOdds: number,
  aggression: number,
  availableActions: PlayerAction[]
): { action: PlayerAction; amount?: number } {
  const toCall = state.currentBet - player.currentBet;
  const adjustedStrength = handStrength * aggression;

  if (adjustedStrength < potOdds * 0.5) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Fold)) {
      return { action: PlayerAction.Fold };
    }
  }

  if (adjustedStrength > 0.8) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const raiseAmount = calculateRaiseAmount(state, player, handStrength);
      return { action: PlayerAction.Raise, amount: raiseAmount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) {
      return { action: PlayerAction.AllIn };
    }
  }

  if (adjustedStrength > 0.6) {
    if (state.currentBet === 0 && availableActions.includes(PlayerAction.Raise)) {
      const raiseAmount = calculateRaiseAmount(state, player, handStrength);
      return { action: PlayerAction.Raise, amount: raiseAmount };
    }
  }

  if (toCall === 0) {
    if (availableActions.includes(PlayerAction.Check)) {
      return { action: PlayerAction.Check };
    }
  }

  if (availableActions.includes(PlayerAction.Call)) {
    return { action: PlayerAction.Call };
  }

  if (availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  return { action: PlayerAction.Fold };
}

/**
 * 根据手牌强度和游戏状态计算适当的加注金额
 * @param state - 当前游戏状态
 * @param player - AI玩家
 * @param handStrength - 计算的手牌强度
 * @returns 加注金额
 */
function calculateRaiseAmount(state: GameState, player: Player, handStrength: number): number {
  const minRaise = state.minRaise;
  const maxRaise = player.chips + player.currentBet;

  const potSizeFactor = state.pot / state.bigBlind;
  const strengthMultiplier = 1 + (handStrength * 2);

  let raiseAmount = Math.floor(minRaise * strengthMultiplier);

  if (potSizeFactor > 10) {
    raiseAmount = Math.floor(state.pot * 0.75);
  }

  raiseAmount = Math.max(raiseAmount, minRaise);
  raiseAmount = Math.min(raiseAmount, maxRaise);

  return raiseAmount;
}
