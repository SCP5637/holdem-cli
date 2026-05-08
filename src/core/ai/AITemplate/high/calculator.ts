/**
 * 计算型 — 蒙特卡洛权益驱动，数学正确决策
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculatePotOdds, calculateRaiseAmount, delay, getTotalPot } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'calculator',
  difficulty: AIDifficulty.High,
  description: '计算型，蒙特卡洛权益模拟，数学正确',
  style: '计算型'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(1500 + Math.random() * 2000);

  const activeOpponents = ctx.state.players.filter(p => p.isActive && !p.isAllIn && p.id !== ctx.player.id).length;
  const { equity } = ctx.monteCarlo.computeEquity(ctx.player.hand, ctx.state.communityCards, activeOpponents, 5000);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;

  // 权益远超赔率 → 加注
  if (equity > 0.65) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const fraction = equity > 0.80 ? 0.85 : 0.6;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) return { action: PlayerAction.AllIn };
  }

  // 权益 > 跟注所需权益 → 跟注
  const requiredEquity = po;
  if (equity > requiredEquity * 1.05) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      // 10%概率价值下注
      if (equity > 0.55 && Math.random() < 0.10 && availableActions.includes(PlayerAction.Raise)) {
        const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.5);
        return { action: PlayerAction.Raise, amount };
      }
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 权益不足但接近且有隐含赔率: 翻牌/转牌跟小注
  if (equity > requiredEquity * 0.8 && ctx.state.communityCards.length < 5 && toCall <= ctx.player.chips * 0.05) {
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  if (availableActions.includes(PlayerAction.Fold)) {
    return { action: PlayerAction.Fold };
  }

  return { action: PlayerAction.Check };
}
