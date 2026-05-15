/**
 * 反向战争迷雾 — 玩家第一张手牌自己不可见
 *
 * 机制:
 * 1. 每手牌发牌后，人类玩家的第一张底牌对自己隐藏（牌背显示）
 * 2. 其他玩家看不到该牌（正常规则），摊牌时揭示
 * 3. AI/LLM对手知道该玩家自己看不到此牌，可利用此信息
 */

import { VariantDef, PluginModule } from '../types';
import { GameState } from '../../types/game';
import { SUIT_SYMBOLS } from '../../types/card';
import { LOOKUP } from '../manager';
import { cardKey, setHiddenHoleKey, getHiddenHoleKey } from './state';

const variant: VariantDef = {
  id: 3,
  name: '反向战争迷雾',
  description: '玩家第一张底牌自己不可见',
  tags: ['#2'],
  isDev: false,
};

export const module: PluginModule = {
  variant,
  handlers: {
    /** 发牌后: 记录人类玩家第一张底牌 */
    onHandStart(state: GameState): null {
      const human = state.players.find(p => p.isHuman);
      if (human && human.hand.length >= 1) {
        setHiddenHoleKey(cardKey(human.hand[0]));
      } else {
        setHiddenHoleKey(null);
      }
      return null;
    },

    /** 结算: 清除标记 */
    onHandResolve(_state: GameState, _winners: number[]): null {
      setHiddenHoleKey(null);
      return null;
    },

    /** 隐藏卡: 人类玩家看自己手牌时第一张不可见 */
    cardVisibility(
      card: { suit: string; rank: string },
      ctx?: { source?: string; isOwnHand?: boolean; isShowdown?: boolean }
    ): { visible: boolean } | null {
      const hiddenKey = getHiddenHoleKey();
      if (!hiddenKey) return null;
      if (cardKey(card) !== hiddenKey) return null;
      // 仅在玩家查看自己手牌时隐藏，摊牌时正常显示
      if (ctx?.isOwnHand) {
        return { visible: false };
      }
      return null;
    },

    /** LLM上下文: 告知人类玩家的信息缺失 */
    getLLMContext(ctx: { state: GameState; playerId: number }): string | null {
      const me = ctx.state.players.find(p => p.id === ctx.playerId);
      if (!me) return null;
      if (me.isHuman) {
        return `[反向战争迷雾规则] 你的一张底牌被迷雾笼罩，你自己不可见。你只知道另一张底牌的信息。决策时需考虑信息不完整。`;
      } else {
        // AI/LLM对手: 可以利用人类玩家信息不全
        const human = ctx.state.players.find(p => p.isHuman);
        if (!human) return null;
        const visibleCards = human.hand.filter((c, i) => i !== 0);
        const visibleDesc = visibleCards.map(c => `${c.rank}${SUIT_SYMBOLS[c.suit]}`).join(',');
        return `[反向战争迷雾规则] 人类玩家${human.name}有一张底牌自己不可见（他不知道自己有这张牌）。他只能看到: ${visibleDesc || '无'}。可以利用他的信息不完整进行诈唬或价值下注。`;
      }
    },
  },
};

LOOKUP.set(3, module);

export default variant;
