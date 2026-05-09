/**
 * 公共牌区域组件
 * 根据终端宽度选择5行ASCII或简单文本渲染
 */

import { Card } from '../../types/card';
import { Suit, Rank } from '../../types/card';
import { SerializedCard } from '../../types/network';
import { renderCards, renderCardsSimple } from '../cardRenderer';
import { Theme, themed } from '../theme';
import { centerAnsi } from '../engine/ansi';

export interface CommunityCardsData {
  cards: (Card | SerializedCard)[];
}

export function renderCommunityCards(data: CommunityCardsData, theme: Theme, width: number): string[] {
  const lines: string[] = [];

  if (data.cards.length === 0) {
    const placeholder = themed('[ 等待发牌 ]', theme.dim);
    lines.push(centerAnsi(placeholder, width));
    return lines;
  }

  const cards = data.cards.map(c => {
    if (typeof (c as Card).suit === 'string') {
      return c as Card;
    }
    const sc = c as SerializedCard;
    return { suit: sc.suit as Suit, rank: sc.rank as Rank } as Card;
  });

  // 宽度>=80用完整5行ASCII，否则用简单文本
  if (width >= 70) {
    const cardRender = renderCards(cards);
    for (const line of cardRender.split('\n')) {
      lines.push(centerAnsi(line, width));
    }
  } else {
    const simple = renderCardsSimple(cards);
    lines.push(centerAnsi(simple, width));
  }

  return lines;
}
