/**
 * 德州扑克游戏核心卡牌类型和枚举
 * 定义花色、点数和卡牌接口
 */

/**
 * 标准扑克牌的四种花色
 */
export enum Suit {
  Hearts = 'hearts',
  Diamonds = 'diamonds',
  Clubs = 'clubs',
  Spades = 'spades'
}

/**
 * 标准扑克牌的十三个点数
 * 按扑克牌大小从低到高排序
 */
export enum Rank {
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = '10',
  Jack = 'J',
  Queen = 'Q',
  King = 'K',
  Ace = 'A'
}

/**
 * 扑克牌，包含花色和点数
 */
export interface Card {
  suit: Suit;
  rank: Rank;
}

/**
 * 各点数的数值，用于手牌评估
 * A可以是14(高)或1(低)，视情况而定
 */
export const RANK_VALUES: Record<Rank, number> = {
  [Rank.Two]: 2,
  [Rank.Three]: 3,
  [Rank.Four]: 4,
  [Rank.Five]: 5,
  [Rank.Six]: 6,
  [Rank.Seven]: 7,
  [Rank.Eight]: 8,
  [Rank.Nine]: 9,
  [Rank.Ten]: 10,
  [Rank.Jack]: 11,
  [Rank.Queen]: 12,
  [Rank.King]: 13,
  [Rank.Ace]: 14
};

/**
 * 各花色的Unicode符号
 */
export const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.Hearts]: '♥',
  [Suit.Diamonds]: '♦',
  [Suit.Clubs]: '♣',
  [Suit.Spades]: '♠'
};

/**
 * 终端输出的ANSI颜色代码
 */
export const SUIT_COLORS: Record<Suit, string> = {
  [Suit.Hearts]: '\x1b[31m',
  [Suit.Diamonds]: '\x1b[31m',
  [Suit.Clubs]: '\x1b[37m',
  [Suit.Spades]: '\x1b[37m'
};

export const RESET_COLOR = '\x1b[0m';
