/**
 * 新手型 — 基础手牌评估，略带随机性，偏被动
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, delay } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'beginner',
  difficulty: AIDifficulty.Low,
  description: '新手型，基本手牌认知，偶尔随机决策',
  style: '新手'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(1500 + Math.random() * 2500);

  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;

  // 10%概率随机选择一个可行动作 (新手的不确定性)
  if (Math.random() < 0.10) {
    const randomAction = availableActions[Math.floor(Math.random() * availableActions.length)];
    if (randomAction === PlayerAction.Raise) {
      const amount = ctx.state.minRaise;
      return { action: PlayerAction.Raise, amount };
    }
    return { action: randomAction };
  }

  // 强度 > 0.75 加注
  if (hs > 0.75 && availableActions.includes(PlayerAction.Raise)) {
    const amount = ctx.state.minRaise + Math.floor(Math.random() * ctx.state.minRaise);
    return { action: PlayerAction.Raise, amount };
  }

  // 强度 > 0.5 跟注/过牌
  if (hs > 0.5 || po < 0.3) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Call)) {
      return { action: PlayerAction.Call };
    }
  }

  // 弱牌: 小额跟注也跟
  if (toCall <= ctx.player.chips * 0.02 && availableActions.includes(PlayerAction.Call)) {
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
