/**
 * GTO平衡型 — MDF跟注，极化范围，平衡诈唬:价值比
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, delay, getTotalPot, shouldBluff } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'gtoBalanced',
  difficulty: AIDifficulty.Ultra,
  description: 'GTO平衡型，MDF防守，极化范围，平衡诈唬频率',
  style: 'GTO'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(2000 + Math.random() * 3000);

  const activeOpponents = ctx.state.players.filter(p => p.isActive && !p.isAllIn && p.id !== ctx.player.id).length;
  const { equity } = ctx.monteCarlo.computeEquity(ctx.player.hand, ctx.state.communityCards, activeOpponents, 10000);
  const hs = calculateHandStrength(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;
  const totalPot = getTotalPot(ctx.state);

  // GTO诈唬频率: 下注中约25-33%应是诈唬
  const gtoBluffRatio = 0.28;

  // MDF (最小防守频率) = pot / (pot + bet)
  const mdf = toCall > 0 ? totalPot / (totalPot + toCall) : 1.0;
  const callThreshold = 1.0 - mdf; // 用前callThreshold%的牌跟注

  // 河牌圈: 极化策略
  if (ctx.state.communityCards.length === 5) {
    const isValueHand = equity > 0.75;
    const isBluffCandidate = equity < 0.25;
    const isMarginal = !isValueHand && !isBluffCandidate;

    // 价值牌: 下注
    if (isValueHand && availableActions.includes(PlayerAction.Raise)) {
      const fraction = equity > 0.9 ? 1.0 : 0.66;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }

    // 诈唬牌: 按GTO频率诈唬. 识人术下不诈唬
    if (shouldBluff(ctx) && isBluffCandidate && Math.random() < gtoBluffRatio && availableActions.includes(PlayerAction.Raise)) {
      const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.66); // 与价值同注以平衡
      return { action: PlayerAction.Raise, amount };
    }

    // 边缘牌: MDF跟注
    if (toCall > 0 && equity > callThreshold * 0.6 && availableActions.includes(PlayerAction.Call)) {
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

  // 非河牌圈: 使用权益 + MDF混合
  const po = calculatePotOdds(ctx.state, ctx.player);

  if (equity > 0.7) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const fraction = equity > 0.85 ? 0.75 : 0.5;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }
  }

  // 听牌: 半诈唬
  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  if (shouldBluff(ctx) && draws.comboDraw && Math.random() < 0.5 && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.5);
    return { action: PlayerAction.Raise, amount };
  }

  if (equity > po * 1.05) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) return { action: PlayerAction.Check };
    if (availableActions.includes(PlayerAction.Call)) return { action: PlayerAction.Call };
  }

  // MDF跟注: 用足够强的牌防守
  if (toCall > 0 && equity > callThreshold * 0.7 && availableActions.includes(PlayerAction.Call)) {
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
