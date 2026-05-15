/**
 * 公共牌区域组件
 * 根据终端宽度选择5行ASCII或简单文本渲染
 */

import { Card } from '../../types/card';
import { Suit, Rank } from '../../types/card';
import { SerializedCard } from '../../types/network';
import { renderCards, renderCardsSimple, renderCardSimple } from '../cardRenderer';
import { Theme, themed } from '../theme';
import { centerAnsi } from '../engine/ansi';
import { PluginManager } from '../../plugins/manager';

export interface CommunityCardsData {
  cards: (Card | SerializedCard)[];
  phase?: string;
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

  // 检查每张牌的可见性（战争迷雾等插件）
  const hiddenIndices: number[] = [];
  for (let i = 0; i < cards.length; i++) {
    const vis = PluginManager.hook('cardVisibility', cards[i], { source: 'community', isShowdown: data.phase === 'showdown' });
    if (vis?.visible === false) {
      hiddenIndices.push(i);
    }
  }

  // 宽度>=80用完整5行ASCII，否则用简单文本（均处理隐藏牌）
  if (width >= 70) {
    const cardRender = renderCards(cards, hiddenIndices);
    for (const line of cardRender.split('\n')) {
      lines.push(centerAnsi(line, width));
    }
  } else {
    const parts = cards.map((c, i) =>
      hiddenIndices.includes(i) ? '[?]' : renderCardSimple(c)
    );
    lines.push(centerAnsi(parts.join(' '), width));
  }

  return lines;
}
