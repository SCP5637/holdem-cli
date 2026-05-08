/**
 * 陷阱型 — 过牌加注，慢打强牌，欺骗性
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, delay, getTotalPot } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'trapper',
  difficulty: AIDifficulty.High,
  description: '陷阱型，过牌-加注，慢打强牌，极具欺骗性',
  style: '陷阱'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(2000 + Math.random() * 3500);

  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;

  // 超强牌(>0.9): 慢打! 过牌设陷阱
  if (hs > 0.9) {
    // 有人下注 → 加注(陷阱触发)
    if (toCall > 0 && availableActions.includes(PlayerAction.Raise)) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 1.0, 0.66); // 大加注
      return { action: PlayerAction.Raise, amount };
    }
    // 无人下注 → 小下注诱饵
    if (toCall === 0 && availableActions.includes(PlayerAction.Raise) && Math.random() < 0.4) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.25); // 小注引诱
      return { action: PlayerAction.Raise, amount };
    }
    // 否则假装弱牌过牌
    if (availableActions.includes(PlayerAction.Check)) {
      return { action: PlayerAction.Check };
    }
  }

  // 强牌(>0.8): 混合策略
  if (hs > 0.8) {
    if (toCall > 0 && availableActions.includes(PlayerAction.Raise) && Math.random() < 0.5) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.75);
      return { action: PlayerAction.Raise, amount };
    }
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      return { action: PlayerAction.Check }; // 继续慢打
    }
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 中等牌力: 正常打
  if (hs > 0.5) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 弱牌但有听牌: 跟注看牌
  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  if (draws.hasFlushDraw || draws.hasStraightDraw) {
    if (toCall <= ctx.player.chips * 0.05 && availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 诈唬: 偶尔用弱牌加注制造欺骗形象
  if (hs < 0.3 && Math.random() < 0.08 && availableActions.includes(PlayerAction.Raise) && toCall > 0) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.5);
    return { action: PlayerAction.Raise, amount };
  }

  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  if (availableActions.includes(PlayerAction.Fold)) {
    return { action: PlayerAction.Fold };
  }

  return { action: PlayerAction.Check };
}
