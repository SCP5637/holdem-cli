/**
 * 完全自适应型 — 全技术融合: MC + GTO + 对手建模 + 多街规划
 */

import { PlayerAction } from '../../../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, StrategyMetadata, OpponentArchetype } from '../../types';
import { calculateHandStrength, calculatePotOdds, calculateRaiseAmount, drawEquityBonus, delay, getTotalPot } from '../../helpers';

export const metadata: StrategyMetadata = {
  name: 'fullAdaptive',
  difficulty: AIDifficulty.Max,
  description: '完全自适应型，融合全部技术，实时调整剥削策略',
  style: '完全自适应'
};

export async function decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }> {
  const { availableActions } = ctx;
  if (availableActions.length === 0) return { action: PlayerAction.Fold };

  await delay(2500 + Math.random() * 3500);

  const activeOpponents = ctx.state.players.filter(p => p.isActive && !p.isAllIn && p.id !== ctx.player.id).length;
  const { equity } = ctx.monteCarlo.computeEquity(ctx.player.hand, ctx.state.communityCards, activeOpponents, 15000);
  const hs = calculateHandStrength(ctx.state, ctx.player);
  const po = calculatePotOdds(ctx.state, ctx.player);
  const toCall = ctx.state.currentBet - ctx.player.currentBet;
  const totalPot = getTotalPot(ctx.state);

  const draws = ctx.drawDetector.detectDraws(ctx.player.hand, ctx.state.communityCards);
  const drawBonus = drawEquityBonus(draws.hasFlushDraw, draws.hasStraightDraw, draws.openEnded, draws.comboDraw);

  // 综合评分: 手牌强度30% + 蒙特卡洛权益40% + 听牌加成20% + 位置10%
  const posInGame = ctx.state.players.length > 0
    ? 1 - (ctx.state.currentPlayerIndex / ctx.state.players.length)
    : 0.5;
  const combined = hs * 0.30 + equity * 0.40 + drawBonus * 0.20 + posInGame * 0.10;
  const mdf = toCall > 0 ? totalPot / (totalPot + toCall) : 1.0;

  // 对手分析: 加权平均所有对手的原型
  let bluffFreq = 0.18;
  let valueThreshold = 0.72;
  let foldThreshold = 0.30;
  let overbetFreq = 0.0;

  for (const opp of ctx.state.players) {
    if (!opp.isActive || opp.id === ctx.player.id) continue;
    const arch = ctx.opponentModel.getArchetype(opp.id);
    switch (arch) {
      case OpponentArchetype.Nit:
        bluffFreq += 0.08;
        foldThreshold += 0.10;
        overbetFreq += 0.05;
        break;
      case OpponentArchetype.LAG:
        bluffFreq -= 0.05;
        foldThreshold -= 0.08;
        valueThreshold += 0.03;
        break;
      case OpponentArchetype.Maniac:
        bluffFreq -= 0.08;
        foldThreshold -= 0.12;
        valueThreshold -= 0.03;
        break;
      case OpponentArchetype.CallingStation:
        bluffFreq -= 0.10;
        valueThreshold -= 0.05;
        break;
    }
  }

  bluffFreq = Math.max(0.03, Math.min(0.40, bluffFreq));
  valueThreshold = Math.max(0.55, Math.min(0.88, valueThreshold));
  foldThreshold = Math.max(0.10, Math.min(0.55, foldThreshold));

  // === 决策 ===

  // 超强牌: 考虑超额下注
  if (combined > 0.88) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const fraction = Math.random() < overbetFreq ? 1.25 : 0.85;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }
    if (availableActions.includes(PlayerAction.AllIn)) return { action: PlayerAction.AllIn };
  }

  // 价值下注
  if (combined > valueThreshold) {
    if (availableActions.includes(PlayerAction.Raise)) {
      const fraction = combined > 0.82 ? 0.75 : 0.55;
      const amount = calculateRaiseAmount(ctx.state, ctx.player, fraction);
      return { action: PlayerAction.Raise, amount };
    }
  }

  // 平衡诈唬
  if (combined < 0.22 && Math.random() < bluffFreq && toCall > 0 && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.6);
    return { action: PlayerAction.Raise, amount };
  }

  // 听牌半诈唬
  if (drawBonus > 0.12 && Math.random() < 0.35 && availableActions.includes(PlayerAction.Raise)) {
    const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.4);
    return { action: PlayerAction.Raise, amount };
  }

  // 跟注/过牌
  if (combined > po * 0.85) {
    if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
      // 翻前/翻牌无下注时主动下注
      if (ctx.state.communityCards.length <= 3 && combined > 0.5 && Math.random() < 0.25 && availableActions.includes(PlayerAction.Raise)) {
        const amount = calculateRaiseAmount(ctx.state, ctx.player, 0.45);
        return { action: PlayerAction.Raise, amount };
      }
      return { action: PlayerAction.Check };
    }
    if (availableActions.includes(PlayerAction.Call)) return { action: PlayerAction.Call };
  }

  // MDF防守
  const callThreshold = 1.0 - mdf;
  if (toCall > 0 && combined > callThreshold * 0.55 && availableActions.includes(PlayerAction.Call)) {
    return { action: PlayerAction.Call };
  }

  if (combined < foldThreshold && toCall > 0 && availableActions.includes(PlayerAction.Fold)) {
    return { action: PlayerAction.Fold };
  }

  if (toCall === 0 && availableActions.includes(PlayerAction.Check)) {
    return { action: PlayerAction.Check };
  }

  if (availableActions.includes(PlayerAction.Call)) {
    return { action: PlayerAction.Call };
  }

  return { action: PlayerAction.Fold };
}
