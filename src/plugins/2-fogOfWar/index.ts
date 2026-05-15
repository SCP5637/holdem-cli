/**
 * 战争迷雾 — 公共牌第一张以牌背隐藏，加注累积探索后可揭开
 *
 * 机制:
 * 1. 翻牌圈第一张公共牌对所有玩家隐藏（牌背朝上，仍占一个牌位）
 * 2. 加注金额 >= 大盲注×2，该加注者获得 1 次探索次数
 * 3. 某玩家探索次数 >= 3 后，该玩家可看穿迷雾牌
 * 4. 摊牌时迷雾自动揭开（所有玩家可见）
 * 5. 探索次数跨牌局累积，整局游戏不清零
 */

import { VariantDef, PluginModule } from '../types';
import { GameState, PlayerAction } from '../../types/game';
import { LOOKUP } from '../manager';
import {
  cardKey, setFogCardKey, getFogCardKey,
  setHumanPlayerId, getHumanPlayerId,
  addExploration, getExploration, resetExploration
} from './state';

const REQUIRED_EXPLORATION = 3;

const variant: VariantDef = {
  id: 2,
  name: '战争迷雾',
  description: '公共牌第一张隐藏，加注≥2BB累积探索，3次探索后揭开',
  tags: ['#3'],
  isDev: false,
};

export const module: PluginModule = {
  variant,
  handlers: {
    /** 游戏开始: 重置所有探索计数 */
    onGameStart(): null {
      resetExploration();
      return null;
    },

    /** 每手开始: 记录人类玩家ID, 清迷雾牌 */
    onHandStart(state: GameState): null {
      setFogCardKey(null);
      const human = state.players.find(p => p.isHuman);
      if (human) setHumanPlayerId(human.id);
      return null;
    },

    /** 阶段推进: 翻牌时锁定第一张公共牌为迷雾牌 */
    onPhaseAdvanced(state: GameState, prevPhase: string): null {
      if (prevPhase === 'preflop' && state.communityCards.length >= 1) {
        setFogCardKey(cardKey(state.communityCards[0]));
      }
      return null;
    },

    /** 玩家执行动作后: 检测加注是否触发探索 */
    onActionExecuted(
      state: GameState,
      playerId: number,
      action: PlayerAction,
      amount?: number
    ): null {
      if (action !== PlayerAction.Raise) return null;
      if (amount === undefined || amount < state.bigBlind * 2) return null;
      addExploration(playerId);
      return null;
    },

    /** 牌局结算: 清迷雾牌 (探索计数保留) */
    onHandResolve(_state: GameState, _winners: number[]): null {
      setFogCardKey(null);
      return null;
    },

    /** 卡牌可见性: 迷雾牌对未达标玩家隐藏 */
    cardVisibility(
      card: { suit: string; rank: string },
      ctx?: { source?: string; isShowdown?: boolean }
    ): { visible: boolean } | null {
      if (ctx?.source !== 'community') return null;
      const fogKey = getFogCardKey();
      if (!fogKey || cardKey(card) !== fogKey) return null;
      // 摊牌: 迷雾全揭开
      if (ctx?.isShowdown) return null;
      // 人类玩家探索 >= 3: 可见
      const humanId = getHumanPlayerId();
      if (humanId >= 0 && getExploration(humanId) >= REQUIRED_EXPLORATION) return null;
      // 不达标: 隐藏
      return { visible: false };
    },

    /** LLM上下文: 告知迷雾状态及各方探索进度 */
    getLLMContext(ctx: { state: GameState; playerId: number }): string | null {
      const fogKey = getFogCardKey();
      if (!fogKey) return null;

      const visibleCount = ctx.state.communityCards.length - 1;
      const me = ctx.state.players.find(p => p.id === ctx.playerId);
      const myExploration = getExploration(ctx.playerId);
      const humanId = getHumanPlayerId();
      const humanExploration = humanId >= 0 ? getExploration(humanId) : 0;

      let lines = [
        `[战争迷雾] 公共牌第一张被迷雾笼罩。你(${me?.name || '?'})探索${myExploration}/${REQUIRED_EXPLORATION}。`,
        `人类玩家探索${humanExploration}/${REQUIRED_EXPLORATION}。`,
        `规则: 加注≥${ctx.state.bigBlind * 2}筹码获得1次探索，${REQUIRED_EXPLORATION}次后可看穿迷雾。当前可见公共牌${visibleCount}张。`,
      ];

      if (myExploration >= REQUIRED_EXPLORATION) {
        lines.push('你已探索足够次数，可看到迷雾牌。');
      }

      return lines.join(' ');
    },
  },
};

LOOKUP.set(2, module);

export default variant;
