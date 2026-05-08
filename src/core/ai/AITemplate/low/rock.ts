/**
 * 岩石型 — 超紧弱，只玩顶级牌，从不诈唬
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, delay } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'rock',
  difficulty: AIDifficulty.Low,
  description: '超紧弱型，只玩顶级手牌，从不诈唬',
  style: '岩石'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(1500 + Math.random() * 2000);

  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;

  // 岩石型: 手牌强度阈值极高
  // 强度 > 0.85 才考虑加注, 强度 > 0.7 才跟注, 否则弃牌
  if (hs > 0.85) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.5); // 小加注, 保守
      return { action: PlayerAction.Raise, amount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) return { action: PlayerAction.AllIn };
  }

  if (hs > 0.7) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 弱牌: 免费看牌可过牌, 否则弃牌
  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  // 极低赔率时才考虑跟注 (绝望跟注)
  if (po < 0.1 && availableActions.includes(PlayerAction.Call) && hs > 0.4) {
    return { action: PlayerAction.Call };
  }

  return { action: PlayerAction.Fold };
}
