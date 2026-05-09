/**
 * 玩家座位组件
 * 4种密度模式: full / compact / slim / minimal
 */

import { Card, Suit, Rank } from '../../types/card';
import { Theme, themed, chipText } from '../theme';
import { renderCards, renderCardsSimple, renderCardsCompact } from '../cardRenderer';
import { padVisual, visualWidth } from '../terminal';
import { padAnsi } from '../engine/ansi';

export interface PlayerSeatData {
  name: string;
  chips: number;
  currentBet: number;
  hand: (Card | { suit: string; rank: string })[];
  isActive: boolean;
  isAllIn: boolean;
  isCurrentPlayer: boolean;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  isHuman: boolean;
  isRemote?: boolean;
  isYou?: boolean;
  showCards: boolean;
}

export type SeatDensity = 'full' | 'compact' | 'slim' | 'minimal';

const BOX_H = '─';
const BOX_V = '│';

export function renderPlayerSeat(data: PlayerSeatData, theme: Theme, width: number, density: SeatDensity): string[] {
  switch (density) {
    case 'full': return renderFull(data, theme, width);
    case 'compact': return renderCompact(data, theme, width);
    case 'slim': return renderSlim(data, theme, width);
    case 'minimal': return renderMinimal(data, theme, width);
  }
}

/** 判断使用哪种密度 */
export function densityForWidth(w: number): SeatDensity {
  if (w >= 30) return 'full';
  if (w >= 22) return 'compact';
  if (w >= 14) return 'slim';
  return 'minimal';
}

/** Full: 名+筹码+下注+位置+牌 */
function renderFull(data: PlayerSeatData, theme: Theme, width: number): string[] {
  const innerW = width - 2;
  const b = theme.border;
  const lines: string[] = [];

  // 顶部边框
  lines.push(themed('┌' + BOX_H.repeat(innerW) + '┐', b));

  // 第1行: 状态指示+名称+位置徽章
  const cursor = data.isCurrentPlayer ? themed('▶', theme.highlight) : ' ';
  const badges = buildBadges(data, theme);
  let nameLine = `${cursor} ${truncate(data.name, innerW - 6 - visualWidth(badges))} ${badges}`;
  if (!data.isActive) nameLine = themed(nameLine, theme.dim);
  lines.push(themed(BOX_V, b) + padVisual(nameLine, innerW) + themed(BOX_V, b));

  // 第2行: 筹码 + 下注
  const chipsStr = themed('筹码:', theme.dim) + ' ' + chipText(data.chips);
  const betStr = themed('下注:', theme.dim) + ' ' + chipText(data.currentBet);
  const infoLine = `${chipsStr}  ${betStr}`;
  lines.push(themed(BOX_V, b) + padVisual(infoLine, innerW) + themed(BOX_V, b));

  // 第3-7行: 手牌(如适用)
  if (data.hand.length > 0 && data.showCards) {
    const cards = data.hand.map(toCardType);
    const cardRender = renderCards(cards);
    for (const line of cardRender.split('\n')) {
      lines.push(themed(BOX_V, b) + padVisual(line, innerW) + themed(BOX_V, b));
    }
  } else if (!data.isActive) {
    lines.push(themed(BOX_V, b) + padVisual(themed('  (已弃牌)', theme.dim), innerW) + themed(BOX_V, b));
  } else if (data.hand.length > 0 && !data.showCards) {
    // 对手牌背：用5行隐藏卡牌匹配人类玩家牌面高度
    const backColor = data.isAllIn ? theme.dim : theme.cardBack;
    const cards = data.hand.map(toCardType);
    const hiddenRender = renderCards(cards, [0, 1]);
    for (const line of hiddenRender.split('\n')) {
      lines.push(themed(BOX_V, b) + padVisual(themed(line, backColor), innerW) + themed(BOX_V, b));
    }
  }

  // 底部
  lines.push(themed('└' + BOX_H.repeat(innerW) + '┘', b));

  return lines;
}

/** Compact: 名+筹码+位置+简牌 */
function renderCompact(data: PlayerSeatData, theme: Theme, width: number): string[] {
  const innerW = width - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push(themed('┌' + BOX_H.repeat(innerW) + '┐', b));

  const cursor = data.isCurrentPlayer ? themed('▶', theme.highlight) : ' ';
  const badges = buildBadges(data, theme);
  let nameLine = `${cursor} ${truncate(data.name, innerW - 5 - visualWidth(badges))} ${badges}`;
  if (!data.isActive) nameLine = themed(nameLine, theme.dim);
  lines.push(themed(BOX_V, b) + padVisual(nameLine, innerW) + themed(BOX_V, b));

  const chipsStr = chipText(data.chips);
  const betStr = data.currentBet > 0 ? ' ' + themed('注:', theme.dim) + ' ' + chipText(data.currentBet) : '';
  lines.push(themed(BOX_V, b) + padVisual(chipsStr + betStr, innerW) + themed(BOX_V, b));

  // 3行紧凑牌(中间密度)
  if (data.hand.length > 0 && data.showCards) {
    const cards = data.hand.map(toCardType);
    const cardRender = renderCardsCompact(cards);
    for (const line of cardRender.split('\n')) {
      lines.push(themed(BOX_V, b) + padVisual(line, innerW) + themed(BOX_V, b));
    }
  } else if (!data.isActive) {
    lines.push(themed(BOX_V, b) + padVisual(themed('(已弃牌)', theme.dim), innerW) + themed(BOX_V, b));
  } else if (data.hand.length > 0 && !data.showCards) {
    const backColor = data.isAllIn ? theme.dim : theme.cardBack;
    lines.push(themed(BOX_V, b) + padVisual(themed('┌───┐ ┌───┐', backColor), innerW) + themed(BOX_V, b));
    lines.push(themed(BOX_V, b) + padVisual(themed('│ ? │ │ ? │', backColor), innerW) + themed(BOX_V, b));
    lines.push(themed(BOX_V, b) + padVisual(themed('└───┘ └───┘', backColor), innerW) + themed(BOX_V, b));
  }

  lines.push(themed('└' + BOX_H.repeat(innerW) + '┘', b));
  return lines;
}

/** Slim: 名+筹码同行 */
function renderSlim(data: PlayerSeatData, theme: Theme, width: number): string[] {
  const innerW = width - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push(themed('┌' + BOX_H.repeat(innerW) + '┐', b));

  const cursor = data.isCurrentPlayer ? themed('▶', theme.highlight) : ' ';
  const badges = buildBadges(data, theme);
  const shortName = truncate(data.name, 6);
  const lineText = `${cursor}${shortName} ${badges} ${chipText(data.chips)}`;
  const styled = data.isActive ? lineText : themed(lineText, theme.dim);
  lines.push(themed(BOX_V, b) + padVisual(styled, innerW) + themed(BOX_V, b));

  // 简牌
  if (data.hand.length > 0 && data.showCards) {
    const simple = renderCardsSimple(data.hand.map(toCardType));
    lines.push(themed(BOX_V, b) + padVisual(simple, innerW) + themed(BOX_V, b));
  } else if (data.hand.length > 0 && !data.showCards) {
    lines.push(themed(BOX_V, b) + padVisual(themed('[?] [?]', theme.cardBack), innerW) + themed(BOX_V, b));
  }

  lines.push(themed('└' + BOX_H.repeat(innerW) + '┘', b));
  return lines;
}

/** Minimal: 仅名+筹码 */
function renderMinimal(data: PlayerSeatData, theme: Theme, width: number): string[] {
  const innerW = width - 2;
  const b = theme.border;
  const lines: string[] = [];

  const cursor = data.isCurrentPlayer ? themed('▶', theme.highlight) : ' ';
  const badges = buildBadges(data, theme);
  const nameLine = `${cursor}${truncate(data.name, 5)}${badges} ${chipText(data.chips)}`;
  const styled = data.isActive ? nameLine : themed(nameLine, theme.dim);

  lines.push(themed('┌' + BOX_H.repeat(innerW) + '┐', b));
  lines.push(themed(BOX_V, b) + padVisual(styled, innerW) + themed(BOX_V, b));
  lines.push(themed('└' + BOX_H.repeat(innerW) + '┘', b));
  return lines;
}

function buildBadges(data: PlayerSeatData, theme: Theme): string {
  const badges: string[] = [];
  if (data.isDealer) badges.push(themed('D', theme.dealer));
  if (data.isSmallBlind) badges.push(themed('SB', theme.dim));
  if (data.isBigBlind) badges.push(themed('BB', theme.dim));
  if (data.isYou) badges.push(themed('(你)', theme.accent));
  if (data.isRemote) badges.push(themed('[网]', theme.accent));
  if (data.isAllIn) badges.push(themed('ALL-IN', theme.warning));
  return badges.join(' ');
}

function truncate(s: string, maxLen: number): string {
  if (visualWidth(s) <= maxLen) return s;
  let result = '';
  let w = 0;
  for (const ch of s) {
    const cw = visualWidth(ch);
    if (w + cw > maxLen) break;
    result += ch;
    w += cw;
  }
  return result;
}

function toCardType(card: Card | { suit: string; rank: string }): Card {
  if (typeof (card as Card).suit === 'string' && ['hearts', 'diamonds', 'clubs', 'spades'].includes((card as Card).suit)) {
    return card as Card;
  }
  const sc = card as { suit: string; rank: string };
  return { suit: sc.suit as Suit, rank: sc.rank as Rank };
}
