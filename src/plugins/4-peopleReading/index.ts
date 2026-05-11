import { VariantDef, PluginModule } from '../types';
import { GameState } from '../../types/game';
import { LOOKUP } from '../manager';

const variant: VariantDef = {
  id: 4,
  name: '识人术',
  description: '你看不到自己的牌，但能看到其他人的牌',
  tags: ['#1'],
  isDev: false,
};

export const module: PluginModule = {
  variant,
  handlers: {
    /** 反转座位牌面可见性：自己隐藏，别人展示 */
    seatVisibility(ctx: { isHuman: boolean; showAllCards: boolean; defaultShow: boolean }): { show: boolean } | null {
      if (ctx.showAllCards) return null;
      if (ctx.isHuman) return { show: false };
      return { show: true };
    },

    /** LLM上下文：告知信息不对称情况 */
    getLLMContext(ctx: { state: GameState; playerId: number }): string | null {
      const me = ctx.state.players.find(p => p.id === ctx.playerId);
      if (!me) return null;
      if (me.isHuman) {
        return '[识人术规则] 你看不到自己的手牌。你能看到所有其他玩家的手牌。请结合其他玩家信息决策。';
      } else {
        return '[识人术规则] 人类玩家能看穿你的手牌(但他看不到自己的手牌)。做决策时需考虑这一信息泄露：你的诈唬对人类玩家无效，你的强牌反而可能引诱人类玩家。"';
      }
    },
  },
};

LOOKUP.set(4, module);

export default variant;
