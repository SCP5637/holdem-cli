/**
 * ABC标准型 — 标准扎实打法，位置感知，偶尔诈唬
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, drawEquityBonus, delay, getTotalPot } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'abcSolid',
  difficulty: AIDifficulty.Medium,
  description: '标准扎实型，位置感知，偶尔诈唬',
  style: 'ABC'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(2000 + Math.random() * 3000);

  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;

  // 位置因子: 后位(庄家附近)更激进
  const positionFactor = 1 + ((ctx.state.players.length - ctx.state.currentPlayerIndex - 1 + ctx.state.dealerIndex) % ctx.state.players.length) / ctx.state.players.length * 0.5;

  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  const drawBonus = drawEquityBonus(draws.hasFlushDraw, draws.hasStraightDraw, draws.openEnded, draws.comboDraw);
  const effectiveStrength = Math.max(hs, drawBonus) * positionFactor;
  const bluffChance = 0.08; // 8%基础诈唬率

  if (effectiveStrength > 0.80) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.66);
      return { action: PlayerAction.Raise, amount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) return { action: PlayerAction.AllIn };
  }

  // 中等牌力: 后位且有听牌时偶尔半诈唬
  if (effectiveStrength > 0.55) {
    if (positionFactor > 1.2 && drawBonus > 0.1 && Math.random() < 0.20 && availableActions.includes(PlayerAction.Raise)) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.5);
      return { action: PlayerAction.Raise, amount };
    }
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      if (Math.random() < bluffChance && availableActions.includes(PlayerAction.Raise)) {
        const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.33);
        return { action: PlayerAction.Raise, amount };
      }
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 弱牌但有听牌: 跟小注
  if (drawBonus > 0.15 && toCall <= ctx.player.chips * 0.05 && availableActions.includes(PlayerAction.Call)) {
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
