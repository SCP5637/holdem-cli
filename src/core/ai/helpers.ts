/**
 * 策略共享辅助函数
 */

import { Card, RANK_VALUES } from '../../types/card';
import { GameState, Player, PlayerAction, HandRank } from '../../types/game';
import { evaluateHand } from '../handEvaluator';

/** 计算手牌强度 0-1 */
export function calculateHandStrength(state: GameState, player: Player): number {
  const allCards: Card[] = [...player.hand, ...state.communityCards];
  if (allCards.length < 2) return 0.5;

  const evaluation = evaluateHand(allCards);
  const baseStrength = evaluation.rank / 9;
  const kickerBonus = evaluation.kickers.length > 0 ? (evaluation.kickers[0] / 14) * 0.1 : 0;
  return Math.min(baseStrength + kickerBonus, 1);
}

/** 计算跟注赔率 */
export function calculatePotOdds(state: GameState, player: Player): number {
  const toCall = state.currentBet - player.currentBet;
  if (toCall === 0) return 0;
  const totalPot = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0);
  return toCall / (totalPot + toCall);
}

/** 计算底池总额 */
export function getTotalPot(state: GameState): number {
  return state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0) + state.accumulatedPot;
}

/** 加注金额计算 (基于底池比例) */
export function calculateRaiseAmount(
  state: GameState,
  player: Player,
  fraction: number,
  minFraction?: number,
  maxFraction?: number
): number {
  const totalPot = getTotalPot(state);
  const minRaise = Math.max(state.minRaise, minFraction ? Math.floor(totalPot * minFraction) : state.minRaise);
  const maxRaise = Math.min(player.chips + player.currentBet, maxFraction ? Math.floor(totalPot * maxFraction) : player.chips + player.currentBet);

  const raise = Math.floor(totalPot * fraction);
  return Math.max(minRaise, Math.min(raise, maxRaise));
}

/** Chen公式: 快速手牌强度评分 (翻牌前) */
export function chenScore(card1: Card, card2: Card): number {
  const v1 = RANK_VALUES[card1.rank];
  const v2 = RANK_VALUES[card2.rank];
  const high = Math.max(v1, v2);

  // 高牌分: A=10, K=8, Q=7, J=6, others=rank/2
  const highScore: Record<number, number> = { 14: 10, 13: 8, 12: 7, 11: 6 };
  let score = highScore[high] ?? Math.floor(high / 2);

  // 对子加分
  if (v1 === v2) {
    score = Math.max(score * 2, 5);
  }

  // 同花加分
  if (card1.suit === card2.suit) {
    score += 2;
  }

  // 连牌加减分
  const gap = Math.abs(v1 - v2);
  if (gap === 0) { /* already handled as pair */ }
  else if (gap === 1) score += 1;
  else if (gap === 2) score -= 1;
  else if (gap === 3) score -= 2;
  else if (gap >= 4) score -= 5;

  return score;
}

/** 获取手牌排名描述 */
export function getHandRankDescription(player: Player, communityCards: Card[]): { rank: HandRank; description: string } {
  const allCards = [...player.hand, ...communityCards];
  if (allCards.length < 5) return { rank: HandRank.HighCard, description: '未完成' };
  const result = evaluateHand(allCards);
  return { rank: result.rank, description: result.description };
}

/** 随机延迟 (模拟思考) */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 听牌权益估算: 将听牌检测结果转为近似权益加成 */
export function drawEquityBonus(hasFlushDraw: boolean, hasStraightDraw: boolean, openEnded: boolean, comboDraw: boolean): number {
  let bonus = 0;
  if (comboDraw) bonus = 0.25;
  else if (hasFlushDraw) bonus = 0.19;
  else if (hasStraightDraw && openEnded) bonus = 0.17;
  else if (hasStraightDraw) bonus = 0.09;
  return bonus;
}

/** 根据底池赔率判断是否值得跟注 */
export function shouldCallByOdds(equity: number, potOdds: number, threshold = 0.9): boolean {
  if (potOdds === 0) return true;
  return equity > potOdds * threshold;
}
