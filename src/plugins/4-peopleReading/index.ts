import { VariantDef, PluginModule } from '../types';
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
      // 摊牌时不干预
      if (ctx.showAllCards) return null;
      if (ctx.isHuman) return { show: false };
      return { show: true };
    },
  },
};

LOOKUP.set(4, module);

export default variant;
