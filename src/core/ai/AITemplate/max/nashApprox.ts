/**
 * 纳什近似的 — 范围构建，ICM压力感知，多街规划
 */

import { PlayerAction, GamePhase } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, drawEquityBonus, delay, getTotalPot, chenScore } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'nashApprox',
  difficulty: AIDifficulty.Max,
  description: '纳什近似型，范围思维，筹码压力感知，多街规划',
  style: '纳什'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(3000 + Math.random() * 4000);

  const activeOpponents = ctx.state.players.filter(p => p.isActive && !p.isAllIn && p.id !== ctx.player.id).length;
  const { equity } = ctx.monteCarlo.computeEquity(ctx.player.hand, ctx.state.communityCards, activeOpponents, 12000);
  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;
  const totalPot = getTotalPot(ctx.state);
  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  const drawBonus = drawEquityBonus(draws.hasFlushDraw, draws.hasStraightDraw, draws.openEnded, draws.comboDraw);
  const combined = hs * 0.35 + equity * 0.40 + drawBonus * 0.15 + (1 - po) * 0.10;

  // 筹码压力因子: SPR (stack-to-pot ratio) 影响策略
  const spr = totalPot > 0 ? ctx.player.chips / totalPot : 20;
  const isShortStack = spr < 5;
  const isDeepStack = spr > 20;

  // MDF
  const mdf = toCall > 0 ? totalPot / (totalPot + toCall) : 1.0;

  // 翻牌前: 使用Chen公式 + 位置调整范围
  if (ctx.state.currentPhase === GamePhase.PreFlop && ctx.state.communityCards.length === 0) {
    const chen = chenScore(ctx.player.hand[0], ctx.player.hand[1]);
    // Chen分 >= 8 是好牌, >= 6 是可玩牌
    const isPremium = chen >= 8;
    const isPlayable = chen >= 6;

    if (isPremium && availableActions.includes(PlayerAction.Raise)) {
      const fraction = chen >= 10 ? 0.8 : 0.5;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }

    if (isPlayable) {
      if (toCall === 0 && availableActions.includes(PlayerAction.Raise) && Math.random() < 0.3) {
        const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.4);
        return { action: PlayerAction.Raise, amount };
      }
      if (toCall > 0 && availableActions.includes(PlayerAction.Call)) return { action: PlayerAction.Call };
      if (availableActions.includes(PlayerAction.Check)) return { action: PlayerAction.Check };
    }

    // 短筹码翻前: 用稍宽范围全下施压
    if (isShortStack && chen >= 5 && availableActions.includes(PlayerAction.AllIn)) {
      return { action: PlayerAction.AllIn };
    }

    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Fold)) return { action: PlayerAction.Fold };
    return { action: PlayerAction.Check };
  }

  // === 翻牌后 ===
  const street = ctx.state.communityCards.length; // 3=flop, 4=turn, 5=river

  // 多街规划: 根据街数调整激进度
  const streetAggression: Record<number, { valueBet: number; bluffFreq: number; callWider: boolean }> = {
    3: { valueBet: 0.7, bluffFreq: 0.25, callWider: true },   // 翻牌: 较宽
    4: { valueBet: 0.75, bluffFreq: 0.22, callWider: false },  // 转牌: 收紧
    5: { valueBet: 0.82, bluffFreq: 0.20, callWider: false }   // 河牌: 最紧
  };

  const sa = streetAggression[street] || streetAggression[3];

  // 短筹码: 更激进的推all-in
  if (isShortStack && combined > 0.6 && availableActions.includes(PlayerAction.AllIn)) {
    return { action: PlayerAction.AllIn };
  }

  // 深筹码: 更多操作空间, 更频繁的小注
  if (isDeepStack && combined > 0.55 && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.35);
    return { action: PlayerAction.Raise, amount };
  }

  // 价值下注
  if (combined > sa.valueBet) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const fraction = combined > 0.9 ? 0.85 : 0.6;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) return { action: PlayerAction.AllIn };
  }

  // 平衡诈唬
  if (combined < 0.20 && Math.random() < sa.bluffFreq && toCall > 0 && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.55);
    return { action: PlayerAction.Raise, amount };
  }

  // 跟注
  if (combined > po * 0.9) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) return { action: PlayerAction.Check };
    if (availableActions.includes(PlayerAction.Call)) return { action: PlayerAction.Call };
  }

  // MDF防守
  const callThreshold = 1.0 - mdf;
  const mdfMultiplier = sa.callWider ? 0.5 : 0.7;
  if (toCall > 0 && combined > callThreshold * mdfMultiplier && availableActions.includes(PlayerAction.Call)) {
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
