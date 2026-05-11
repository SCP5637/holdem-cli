import { VariantDef, PluginModule } from '../types';
import { Card } from '../../types/card';
import { GameState } from '../../types/game';
import { renderGlassCardFull, renderGlassCardCompact, renderGlassCardSimple } from './renderer';
import { isGlass, markGlass, resetGlass } from './state';
import { LOOKUP } from '../manager';

const variant: VariantDef = {
  id: 1,
  name: '玻璃卡片',
  description: '获胜玩家的两张底牌变成玻璃卡片，洗回牌组',
  tags: ['#3'],
  isDev: true,
};

export const module: PluginModule = {
  variant,
  handlers: {
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
  },
};

LOOKUP.set(1, module);

export default variant;
