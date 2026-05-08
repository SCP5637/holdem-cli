/**
 * 激进型 — 高频下注加注，持续施压
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, drawEquityBonus, delay, getTotalPot } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'aggressor',
  difficulty: AIDifficulty.High,
  description: '激进型，高频下注加注，持续施压',
  style: '激进'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(1000 + Math.random() * 2000);

  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;
  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  const drawBonus = drawEquityBonus(draws.hasFlushDraw, draws.hasStraightDraw, draws.openEnded, draws.comboDraw);
  const effectiveStrength = Math.max(hs, drawBonus);
  const aggressionLevel = 0.35; // 高于平均侵略性

  // 任何可下注的情景，高概率主动下注
  if (effectiveStrength > 0.5 && availableActions.includes(PlayerAction.Raise)) {
    const fraction = effectiveStrength > 0.8 ? 0.85 : 0.55;
    const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
    return { action: PlayerAction.Raise, amount };
  }

  // 面对下注: 用边缘牌也加注(3-bet light)
  if (toCall > 0 && effectiveStrength > 0.35 && Math.random() < aggressionLevel && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.6);
    return { action: PlayerAction.Raise, amount };
  }

  // 无人下注 → 主动下注(领先下注/donk bet)
  if (toCall === 0 && Math.random() < 0.5 && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.4);
    return { action: PlayerAction.Raise, amount };
  }

  // 跟注
  if (availableActions.includes(PlayerAction.Call)) {
    return { action: PlayerAction.Call };
  }

  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  // 激进型几乎不弃牌
  if (availableActions.includes(PlayerAction.AllIn)) {
    return { action: PlayerAction.AllIn };
  }

  return { action: PlayerAction.Call };
}
