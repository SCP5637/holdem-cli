/**
 * TAG基础型 — 紧凶，ABC扑克，听牌感知
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, drawEquityBonus, delay } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'tagBasic',
  difficulty: AIDifficulty.Medium,
  description: '紧凶型，ABC扑克打法，感知听牌',
  style: 'TAG'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(2000 + Math.random() * 3000);

  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;

  // 听牌加成
  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  const drawBonus = drawEquityBonus(draws.hasFlushDraw, draws.hasStraightDraw, draws.openEnded, draws.comboDraw);
  const effectiveStrength = Math.max(hs, drawBonus);

  // 强牌或强听牌 → 加注
  if (effectiveStrength > 0.75) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const fraction = effectiveStrength > 0.85 ? 0.75 : 0.5;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) return { action: PlayerAction.AllIn };
  }

  // 中等牌力: 跟注
  if (effectiveStrength > po * 1.1) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      // 15%概率半诈唬加注
      if (drawBonus > 0.1 && Math.random() < 0.15 && availableActions.includes(PlayerAction.Raise)) {
        const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.5);
        return { action: PlayerAction.Raise, amount };
      }
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 弱牌
  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  if (availableActions.includes(PlayerAction.Fold)) {
    return { action: PlayerAction.Fold };
  }

  return { action: PlayerAction.Check };
}
