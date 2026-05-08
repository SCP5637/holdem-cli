/**
 * LAG基础型 — 松凶，范围宽，频繁施压
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, drawEquityBonus, delay, getTotalPot } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'lagBasic',
  difficulty: AIDifficulty.Medium,
  description: '松凶型，宽范围入池，频繁施加压力',
  style: 'LAG'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(1500 + Math.random() * 2500);

  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;

  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  const drawBonus = drawEquityBonus(draws.hasFlushDraw, draws.hasStraightDraw, draws.openEnded, draws.comboDraw);
  const effectiveStrength = Math.max(hs, drawBonus);
  const bluffChance = 0.15; // 15%诈唬率

  // 强牌: 大加注
  if (effectiveStrength > 0.7) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.8, 0.5);
      return { action: PlayerAction.Raise, amount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) return { action: PlayerAction.AllIn };
  }

  // 中等牌力或听牌: 倾向于加注施压
  if (effectiveStrength > 0.4 || drawBonus > 0.1) {
    if (availableActions.includes(PlayerAction.Raise) && Math.random() < 0.4) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.55);
      return { action: PlayerAction.Raise, amount };
    }
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      // 即使没人下注也可能主动下注(领先下注)
      if (Math.random() < 0.3 && availableActions.includes(PlayerAction.Raise)) {
        const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.4);
        return { action: PlayerAction.Raise, amount };
      }
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 纯诈唬: 用弱牌加注
  if (Math.random() < bluffChance && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.33);
    return { action: PlayerAction.Raise, amount };
  }

  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  if (availableActions.includes(PlayerAction.Call)) {
    return { action: PlayerAction.Call };
  }

  return { action: PlayerAction.Fold };
}
