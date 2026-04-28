/**
 * 牌组管理系统
 * 处理卡牌创建、洗牌和发牌操作
 */

import { Card, Suit, Rank } from '../types/card';

/**
 * 创建一副标准的52张牌
 * @returns 按顺序排列的新牌组
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  const suits = Object.values(Suit);
  const ranks = Object.values(Rank);

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

  return deck;
}

/**
 * 使用Fisher-Yates算法洗牌
 * @param deck - 要洗的牌组（原地修改）
 * @returns 洗好的牌组
 */
export function shuffleDeck(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * 从牌组顶部发指定数量的牌
 * @param deck - 要发牌的牌组（原地修改）
 * @param count - 发牌数量
 * @returns 发出的牌数组
 */
export function dealCards(deck: Card[], count: number): Card[] {
  return deck.splice(0, count);
}

/**
 * 创建并洗牌，用于游戏
 * @returns 洗好的52张牌组
 */
export function createShuffledDeck(): Card[] {
  return shuffleDeck(createDeck());
}
