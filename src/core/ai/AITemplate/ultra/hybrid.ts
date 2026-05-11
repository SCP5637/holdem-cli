/**
 * 混合型 — GTO基线 + 情景剥削
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, drawEquityBonus, delay, getTotalPot, shouldBluff } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'hybrid',
  difficulty: AIDifficulty.Ultra,
  description: '混合型，GTO基线策略融入情景剥削',
  style: '混合'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(2500 + Math.random() * 3000);

  const activeOpponents = ctx.state.players.filter(p => p.isActive && !p.isAllIn && p.id !== ctx.player.id).length;
  const { equity } = ctx.monteCarlo.computeEquity(ctx.player.hand, ctx.state.communityCards, activeOpponents, 8000);
  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;
  const totalPot = getTotalPot(ctx.state);

  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  const drawBonus = drawEquityBonus(draws.hasFlushDraw, draws.hasStraightDraw, draws.openEnded, draws.comboDraw);
  const combinedStrength = hs * 0.5 + equity * 0.3 + drawBonus * 0.2;
  const mdf = toCall > 0 ? totalPot / (totalPot + toCall) : 1.0;

  // GTO基线: 极化范围
  if (combinedStrength > 0.78) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const fraction = combinedStrength > 0.88 ? 0.85 : 0.6;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) return { action: PlayerAction.AllIn };
  }

  // GTO诈唬: 用最底部的牌按比例诈唬. 识人术下不诈唬
  if (shouldBluff(ctx) && combinedStrength < 0.25 && Math.random() < 0.22 && availableActions.includes(PlayerAction.Raise) && toCall > 0) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.6);
    return { action: PlayerAction.Raise, amount };
  }

  // 听牌半诈唬. 识人术下不诈唬
  if (shouldBluff(ctx) && drawBonus > 0.15 && Math.random() < 0.30 && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.45);
    return { action: PlayerAction.Raise, amount };
  }

  // 跟注/过牌
  if (combinedStrength > po) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) return { action: PlayerAction.Check };
    if (availableActions.includes(PlayerAction.Call)) return { action: PlayerAction.Call };
  }

  // MDF防守
  const callThreshold = 1.0 - mdf;
  if (toCall > 0 && combinedStrength > callThreshold * 0.65 && availableActions.includes(PlayerAction.Call)) {
    return { action: PlayerAction.Call };
  }

  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  if (availableActions.includes(PlayerAction.Fold)) {
    return { action: PlayerAction.Fold };
  }

  return { action: PlayerAction.Check };
}
