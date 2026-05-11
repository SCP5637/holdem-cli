/**
 * 蒙特卡洛权益模拟引擎
 * 通过随机补全公共牌和对手手牌来计算当前手牌的胜率
 */

import { Card, Suit, Rank, RANK_VALUES } from '../../types/card';
import { evaluateHand } from '../handEvaluator';
import { MonteCarloEngine } from './types';
import { PluginManager } from '../../plugins/manager';

/**
 * 创建52张标准牌组
 */
function createDeck(): Card[] {
  const suits = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
  const ranks = Object.values(Rank).filter(v => typeof v === 'string') as Rank[];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/**
 * Fisher-Yates洗牌
 */
function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardKey(card: Card): string {
  return `${card.suit}-${card.rank}`;
}

function compareHands(result1: ReturnType<typeof evaluateHand>, result2: ReturnType<typeof evaluateHand>): number {
  if (result1.rank !== result2.rank) return result1.rank - result2.rank;
  for (let i = 0; i < Math.min(result1.kickers.length, result2.kickers.length); i++) {
    if (result1.kickers[i] !== result2.kickers[i]) return result1.kickers[i] - result2.kickers[i];
  }
  return 0;
}

export function createMonteCarloEngine(): MonteCarloEngine {
  return {
    computeEquity(hole: Card[], board: Card[], numOpponents: number, numSims = 5000): { win: number; tie: number; equity: number } {
      const knownCards = [...hole, ...board];
      const knownKeys = new Set(knownCards.map(cardKey));

      // 插件返回额外可见卡（玻璃卡等），作为已知死卡排除
      const extra = PluginManager.hookAll('getVisibleCards');
      for (const r of extra) {
        if (Array.isArray(r)) for (const k of r as string[]) knownKeys.add(k);
      }

      const remainingDeck = createDeck().filter(c => !knownKeys.has(cardKey(c)));

      if (board.length >= 5) {
        // 河牌圈：只需模拟对手手牌
        let wins = 0;
        let ties = 0;

        for (let s = 0; s < numSims; s++) {
          const shuffled = shuffleDeck(remainingDeck);
          const myResult = evaluateHand([...hole, ...board]);
          let bestOpp: ReturnType<typeof evaluateHand> | null = null;

          for (let o = 0; o < numOpponents; o++) {
            const oppHole = [shuffled[o * 2], shuffled[o * 2 + 1]];
            const oppResult = evaluateHand([...oppHole, ...board]);
            if (!bestOpp || compareHands(oppResult, bestOpp) > 0) {
              bestOpp = oppResult;
            }
          }

          if (bestOpp) {
            const cmp = compareHands(myResult, bestOpp);
            if (cmp > 0) wins++;
            else if (cmp === 0) ties++;
          } else {
            wins++;
          }
        }
        return { win: wins / numSims, tie: ties / numSims, equity: (wins + ties / 2) / numSims };
      }

      // 非河牌圈：发完剩余公共牌 + 对手手牌
      const cardsToDeal = 5 - board.length;
      let wins = 0;
      let ties = 0;

      for (let s = 0; s < numSims; s++) {
        const shuffled = shuffleDeck(remainingDeck);
        const futureBoard = shuffled.slice(0, cardsToDeal);
        const fullBoard = [...board, ...futureBoard];
        const myResult = evaluateHand([...hole, ...fullBoard]);
        let bestOpp: ReturnType<typeof evaluateHand> | null = null;

        let offset = cardsToDeal;
        for (let o = 0; o < numOpponents; o++) {
          const oppHole = [shuffled[offset], shuffled[offset + 1]];
          offset += 2;
          const oppResult = evaluateHand([...oppHole, ...fullBoard]);
          if (!bestOpp || compareHands(oppResult, bestOpp) > 0) {
            bestOpp = oppResult;
          }
        }

        if (bestOpp) {
          const cmp = compareHands(myResult, bestOpp);
          if (cmp > 0) wins++;
          else if (cmp === 0) ties++;
        } else {
          wins++;
        }
      }

      return {
        win: wins / numSims,
        tie: ties / numSims,
        equity: (wins + ties / 2) / numSims
      };
    }
  };
}
