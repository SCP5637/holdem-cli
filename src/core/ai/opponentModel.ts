/**
 * 对手建模系统
 * 跨手牌追踪统计数据，分类原型，提供剥削调整
 */

import { PlayerAction } from '../../types/game';
import { OpponentModel, OpponentArchetype, OpponentStats } from './types';

interface RawStats {
  handsPlayed: number;
  voluntarilyPutMoneyIn: number;
  preflopRaises: number;
  totalBets: number;
  totalRaises: number;
  totalCalls: number;
  foldsToCBet: number;
  facedCBet: number;
  wentToShowdown: number;
  showdownCount: number;
}

const MIN_HANDS_FOR_CLASSIFY = 10;

export function createOpponentModel(): OpponentModel {
  const stats = new Map<number, RawStats>();

  function ensure(playerId: number): RawStats {
    if (!stats.has(playerId)) {
      stats.set(playerId, {
        handsPlayed: 0, voluntarilyPutMoneyIn: 0, preflopRaises: 0,
        totalBets: 0, totalRaises: 0, totalCalls: 0,
        foldsToCBet: 0, facedCBet: 0, wentToShowdown: 0, showdownCount: 0
      });
    }
    return stats.get(playerId)!;
  }

  return {
    recordAction(playerId: number, action: PlayerAction, toCall: number, pot: number): void {
      const s = ensure(playerId);
      s.handsPlayed++;

      if (action === PlayerAction.Call || action === PlayerAction.Raise) {
        if (toCall > 0 || action === PlayerAction.Raise) {
          s.voluntarilyPutMoneyIn++;
        }
      }

      if (action === PlayerAction.Raise) {
        s.totalRaises++;
        s.totalBets++;
      }
      if (action === PlayerAction.Call) {
        s.totalCalls++;
      }
      if (action === PlayerAction.Fold && pot > 0) {
        // potentially folding to a c-bet or bet
      }
    },

    recordShowdown(playerId: number): void {
      const s = ensure(playerId);
      s.wentToShowdown++;
      s.showdownCount++;
    },

    getArchetype(playerId: number): OpponentArchetype {
      const s = ensure(playerId);
      if (s.handsPlayed < MIN_HANDS_FOR_CLASSIFY) return OpponentArchetype.Unknown;

      const vpip = s.voluntarilyPutMoneyIn / s.handsPlayed;
      const pfr = s.totalRaises / s.handsPlayed;
      const af = s.totalCalls > 0 ? (s.totalBets + s.totalRaises) / s.totalCalls : s.totalBets + s.totalRaises;

      if (vpip < 0.15 && pfr < 0.10) return OpponentArchetype.Nit;
      if (vpip < 0.25 && pfr > 0.15 && af > 1.5) return OpponentArchetype.TAG;
      if (vpip > 0.28 && pfr > 0.18 && af > 2.0) return OpponentArchetype.LAG;
      if (vpip > 0.35 && af > 3.0) return OpponentArchetype.Maniac;
      if (vpip > 0.30 && af < 1.2) return OpponentArchetype.CallingStation;

      return OpponentArchetype.Unknown;
    },

    getStats(playerId: number): OpponentStats {
      const s = ensure(playerId);
      const af = s.totalCalls > 0 ? (s.totalBets + s.totalRaises) / s.totalCalls : s.totalBets + s.totalRaises;
      return {
        handsPlayed: s.handsPlayed,
        vpip: s.handsPlayed > 0 ? s.voluntarilyPutMoneyIn / s.handsPlayed : 0,
        pfr: s.handsPlayed > 0 ? s.totalRaises / s.handsPlayed : 0,
        af,
        foldsToCBet: s.facedCBet > 0 ? s.foldsToCBet / s.facedCBet : 0,
        wtsd: s.handsPlayed > 0 ? s.wentToShowdown / s.handsPlayed : 0
      };
    }
  };
}
