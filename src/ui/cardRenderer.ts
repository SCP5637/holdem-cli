/**
 * 文本化卡牌可视化模块
 * 使用 ASCII 艺术渲染卡牌，支持花色符号和颜色编码
 */

import { Card, Suit, Rank, SUIT_SYMBOLS, SUIT_COLORS, RESET_COLOR } from '../types/card';

/**
 * 获取卡牌点数的显示字符
 * @param rank - 卡牌点数
 * @returns 单字符或双字符表示
 */
function getRankDisplay(rank: Rank): string {
  if (rank === Rank.Ten) {
    return '10';
  }
  return rank;
}

/**
 * 将单张卡牌渲染为 ASCII 艺术
 * @param card - 要渲染的卡牌
 * @param hidden - 是否渲染为背面
 * @returns 表示卡牌各行的字符串数组
 */
export function renderCard(card: Card, hidden: boolean = false): string[] {
  if (hidden) {
    return [
      '┌─────┐',
      '│░░░░░│',
      '│░░░░░│',
      '│░░░░░│',
      '└─────┘'
    ];
  }

  const suit = SUIT_SYMBOLS[card.suit];
  const rank = getRankDisplay(card.rank);
  const color = SUIT_COLORS[card.suit];
  const reset = RESET_COLOR;

  // 卡牌内部宽度为5个字符
  // 左上角：rank靠左，后面补空格
  const topRank = rank.padEnd(5, ' ');
  // 右下角：前面补空格，rank靠右
  const bottomRank = rank.padStart(5, ' ');

  return [
    `${color}┌─────┐${reset}`,
    `${color}│${topRank}│${reset}`,
    `${color}│  ${suit}  │${reset}`,
    `${color}│${bottomRank}│${reset}`,
    `${color}└─────┘${reset}`
  ];
}

/**
 * 并排渲染多张卡牌
 * @param cards - 要渲染的卡牌数组
 * @param hiddenIndices - 需要渲染为背面的卡牌索引
 * @returns 所有卡牌水平排列的单一字符串
 */
export function renderCards(cards: Card[], hiddenIndices: number[] = []): string {
  if (cards.length === 0) {
    return '';
  }

  const cardLines: string[][] = cards.map((card, index) =>
    renderCard(card, hiddenIndices.includes(index))
  );

  const lines: string[] = [];
  for (let i = 0; i < 5; i++) {
    lines.push(cardLines.map(card => card[i]).join(' '));
  }

  return lines.join('\n');
}

/**
 * 使用简单文本表示渲染卡牌（用于终端兼容性回退）
 * @param card - 要渲染的卡牌
 * @returns 简单的字符串表示
 */
export function renderCardSimple(card: Card): string {
  const suit = SUIT_SYMBOLS[card.suit];
  const color = SUIT_COLORS[card.suit];
  const reset = RESET_COLOR;
  return `${color}[${card.rank}${suit}]${reset}`;
}

/**
 * 使用简单文本表示渲染多张卡牌
 * @param cards - 要渲染的卡牌数组
 * @returns 所有卡牌的字符串
 */
export function renderCardsSimple(cards: Card[]): string {
  return cards.map(renderCardSimple).join(' ');
}
