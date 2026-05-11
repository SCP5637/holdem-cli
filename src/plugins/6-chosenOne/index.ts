/**
 * 天选之子 — 每手牌随机一名玩家获得万能牌加持
 *
 * 机制:
 * 1. 发牌后随机选一名活跃玩家为天选之子, 名字变金
 * 2. 天选之子额外获得一张万能牌 (明牌, 所有人可见, 金色)
 * 3. 万能牌可当作任意花色点数, 摊牌时自动求最佳替换
 * 4. 牌局结束恢复
 */

import { VariantDef, PluginModule } from '../types';
import { GameState } from '../../types/game';
import { WILDCARD_CARD, GOLD_COLOR, RESET_COLOR } from '../../types/card';
import { LOOKUP } from '../manager';
import { setChosen, getChosen, clearChosen } from './state';
import {
  renderWildcardFull,
  renderWildcardCompact,
  renderWildcardSimple,
  renderWildcardLabel,
} from './renderer';

const variant: VariantDef = {
  id: 6,
  name: '天选之子',
  description: '每手牌随机一名玩家获得天选加持，额外获得一张金色万能牌（明牌）',
  tags: [],
  isDev: false,
};

/** 从字符串剥离 ANSI 颜色码 */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export const module: PluginModule = {
  variant,
  handlers: {
    /** 发牌后: 抽天选之子, 加万能牌, 名变金 */
    onHandStart(state: GameState): null {
      const active = state.players.filter(p => p.isActive && p.chips > 0);
      if (active.length === 0) return null;

      const chosen = active[Math.floor(Math.random() * active.length)];
      setChosen(chosen.id);
      chosen.name = GOLD_COLOR + stripAnsi(chosen.name) + RESET_COLOR;
      chosen.hand.push(WILDCARD_CARD);
      return null;
    },

    /** 牌局结束: 恢复名称, 清空状态 */
    onHandResolve(state: GameState, _winners: number[]): null {
      const cid = getChosen();
      if (cid !== null) {
        const p = state.players.find(x => x.id === cid);
        if (p) p.name = stripAnsi(p.name);
      }
      clearChosen();
      return null;
    },

    /** 万能牌永远可见 */
    cardVisibility(card: { suit: string; rank: string }): { visible: boolean } | null {
      if (card.suit === 'wild' && card.rank === '*') return { visible: true };
      return null;
    },

    /** 万能牌金色渲染 */
    renderCard(ctx: { card: { suit: string; rank: string }; hidden: boolean; mode: string }): string[] | string | null {
      if (!(ctx.card.suit === 'wild' && ctx.card.rank === '*')) return null;

      switch (ctx.mode) {
        case 'full':    return renderWildcardFull();
        case 'compact': return renderWildcardCompact();
        case 'simple':  return renderWildcardSimple();
        case 'label':   return renderWildcardLabel();
        default:        return null;
      }
    },

    /** LLM上下文: 告知天选之子与万能牌 */
    getLLMContext(ctx: { state: GameState; playerId: number }): string | null {
      const cid = getChosen();
      if (cid === null) return null;

      const chosenPlayer = ctx.state.players.find(p => p.id === cid);
      if (!chosenPlayer) return null;

      const isMe = cid === ctx.playerId;
      if (isMe) {
        return `[天选之子规则] 本手牌你是天选之子！你的手牌中含有一张金色万能牌⭐，可当作任意花色点数。你的名字显示为金色。善用此牌！`;
      } else {
        return `[天选之子规则] ${chosenPlayer.name}是本手牌的天选之子，他持有一张金色万能牌⭐（明牌、可见），可当作任意花色点数。决策时需考虑此信息：该玩家持有万能牌，牌力极强。不要对该玩家诈唬。`;
      }
    },

    /** getVisibleCards — 万能牌为额外卡牌不在牌组中，无需排除 */
  },
};

LOOKUP.set(6, module);

export default variant;
