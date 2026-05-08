/**
 * 跟注站 — 松被动，几乎不弃牌，极少加注
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, delay, getTotalPot } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'callingStation',
  difficulty: AIDifficulty.Low,
  description: '跟注站型，喜欢看牌，极少弃牌或加注',
  style: '跟注站'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(1000 + Math.random() * 1500);

  const hs = calculateHandStrength(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;

  // 偶尔(5%)随机加注制造一点变化
  if (Math.random() < 0.05 && availableActions.includes(PlayerAction.Raise)) {
    const totalPot = getTotalPot(ctx.state);
    const amount = Math.floor(totalPot * 0.3);
    return { action: PlayerAction.Raise, amount };
  }

  // 牌极弱(<0.15)且需付费才弃牌
  if (hs < 0.15 && toCall > 0 && ctx.player.chips > toCall * 3) {
    if (availableActions.includes(PlayerAction.Fold)) {
      return { action: PlayerAction.Fold };
    }
  }

  // 免费当然是过牌
  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  // 任何情况都倾向于跟注
  if (availableActions.includes(PlayerAction.Call)) {
    return { action: PlayerAction.Call };
  }

  if (availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  return { action: PlayerAction.Fold };
}
