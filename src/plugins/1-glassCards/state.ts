/**
 * 玻璃卡片状态追踪
 * 获胜者的底牌在牌局结束后被标记为"玻璃"，洗回牌池
 */

import { Card } from '../../types/card';

function cardKey(card: Card): string {
  return `${card.suit}-${card.rank}`;
}

const glassCards = new Set<string>();

export function markGlass(card: Card): void {
  glassCards.add(cardKey(card));
}

export function isGlass(card: Card): boolean {
  return glassCards.has(cardKey(card));
}

export function resetGlass(): void {
  glassCards.clear();
}

/** 获取所有玻璃卡牌的key列表 */
export function getAllGlassCardKeys(): string[] {
  return [...glassCards];
}

/** 用于新对局开始时清空所有玻璃标记 */
export function getGlassCount(): number {
  return glassCards.size;
}
