import { VariantDef, PluginModule } from '../types';
import { Card, SUIT_SYMBOLS } from '../../types/card';
import { GameState } from '../../types/game';
import { renderGlassCardFull, renderGlassCardCompact, renderGlassCardSimple } from './renderer';
import { isGlass, markGlass, resetGlass } from './state';
import { LOOKUP } from '../manager';

function fmtCard(c: Card): string {
  return `${c.rank}${SUIT_SYMBOLS[c.suit]}`;
}

const variant: VariantDef = {
  id: 1,
  name: '水晶之夜',
  description: '获胜玩家的两张底牌变成玻璃卡片，洗回牌组',
  tags: ['#4'],
  isDev: false,
};

export const module: PluginModule = {
  variant,
  handlers: {
    /** 玻璃卡强制可见（透明属性） */
    cardVisibility(card: Card): { visible: boolean } | null {
      if (isGlass(card)) return { visible: true };
      return null;
    },


    /** 卡牌渲染：玻璃卡用玻璃样式，无视hidden（透明可见） */
    renderCard(ctx: { card: Card; hidden: boolean; mode: string }): string[] | string | null {
      if (!isGlass(ctx.card)) return null; // 非玻璃卡，走默认渲染

      // 玻璃卡 — 无论hidden都可见渲染
      switch (ctx.mode) {
        case 'full': return renderGlassCardFull(ctx.card);
        case 'compact': return renderGlassCardCompact(ctx.card);
        case 'simple': return renderGlassCardSimple(ctx.card);
        default: return null;
      }
    },

    /** 牌局结算：获胜者的底牌标记为玻璃，下次洗入牌池 */
    onHandResolve(state: GameState, winnerIds: number[]): null {
      for (const pid of winnerIds) {
        const p = state.players.find(x => x.id === pid);
        if (p && p.hand) {
          for (const card of p.hand) {
            markGlass(card);
          }
        }
      }
      return null;
    },

    /** 新对局：清空玻璃标记 */
    onGameStart(): null {
      resetGlass();
      return null;
    },

    /** LLM上下文：告知哪些卡牌为玻璃卡（所有人可见） */
    getLLMContext(ctx: { state: GameState; playerId: number }): string | null {
      const list: string[] = [];
      for (const p of ctx.state.players) {
        for (const c of p.hand) {
          if (isGlass(c)) list.push(`${fmtCard(c)}(${p.name})`);
        }
      }
      for (const c of ctx.state.communityCards) {
        if (isGlass(c)) list.push(`${fmtCard(c)}(公共牌)`);
      }
      if (list.length === 0) return null;
      return `[玻璃卡片规则] 以下玻璃卡牌所有人可见: ${list.join(',')}。`;
    },
  },
};

LOOKUP.set(1, module);

export default variant;
