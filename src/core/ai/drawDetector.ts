/**
 * 听牌检测器 — 从底牌+公共牌检测各种听牌
 */

import { Card, Suit, RANK_VALUES } from '../../types/card';
import { DrawResult } from './types';

export function detectDraws(hole: Card[], board: Card[]): DrawResult {
  const allCards = [...hole, ...board];
  if (board.length === 0) {
    return { hasFlushDraw: false, hasStraightDraw: false, openEnded: false, gutshot: false, overcards: 0, comboDraw: false };
  }

  const hasFlushDraw = checkFlushDraw(hole, board);
  const { hasStraightDraw, openEnded, gutshot } = checkStraightDraw(allCards);
  const overcards = countOvercards(hole, board);
  const comboDraw = hasFlushDraw && hasStraightDraw;

  return { hasFlushDraw, hasStraightDraw, openEnded: openEnded && hasStraightDraw, gutshot: gutshot && hasStraightDraw, overcards, comboDraw };
}

function checkFlushDraw(hole: Card[], board: Card[]): boolean {
  const suitCounts: Record<Suit, number> = {} as Record<Suit, number>;
  for (const card of board) {
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }
  for (const card of hole) {
    const count = (suitCounts[card.suit] || 0) + (board.filter(c => c.suit === card.suit).length > 0 ? 0 : 0);
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }

  // 检查底牌同花且公共牌有 2+ 张同色（共 4+ 张）
  if (hole.length >= 2 && hole[0].suit === hole[1].suit) {
    const boardOfSuit = board.filter(c => c.suit === hole[0].suit).length;
    if (boardOfSuit >= 2) return true;
  }

  // 分别检查每张底牌是否与 3+ 张公共牌同色
  for (const h of hole) {
    const boardOfSuit = board.filter(c => c.suit === h.suit).length;
    if (boardOfSuit >= 3) return true;
  }

  return false;
}

function checkStraightDraw(cards: Card[]): { hasStraightDraw: boolean; openEnded: boolean; gutshot: boolean } {
  const values = [...new Set(cards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => a - b);

  // 加入 A-as-1 用于轮盘顺检测
  if (values.includes(14)) {
    values.unshift(1);
  }

  let bestHasDraw = false;
  let bestOpenEnded = false;
  let bestGutshot = false;

  for (let i = 0; i < values.length; i++) {
    const needed: number[] = [];
    for (let v = values[i]; v < values[i] + 5; v++) {
      if (!values.includes(v)) {
        needed.push(v);
      }
    }

    if (needed.length === 0) continue; // already have a straight

    // 剩余5张待发（翻牌圈:2张，转牌圈:1张）
    // 翻牌圈: 需1张完成 → 4张补牌（卡顺）或8张补牌（两头顺）
    // 转牌圈: 需1张
    // 当前有 2底牌 + 最多5公共牌 = 最多7张
    if (needed.length === 1) {
      bestHasDraw = true;
      // 两头顺：缺的牌在4连张序列两端之一
      const existing4 = values.filter(v => v >= values[i] && v < values[i] + 5);
      if (existing4.length >= 4) {
        const min = Math.min(...existing4);
        const max = Math.max(...existing4);
        // 两头顺：缺低端或高端（非两端都缺）
        if (needed[0] === min - 1 || needed[0] === max + 1) {
          bestOpenEnded = true;
        } else {
          bestGutshot = true;
        }
      }
    }

    if (needed.length === 2 && cards.length >= 5) {
      // 有3张成顺，需2张特定牌
      const existing3 = values.filter(v => v >= values[i] && v < values[i] + 5);
      if (existing3.length === 3) {
        bestHasDraw = true;
        bestGutshot = true; // backdoor straight draw
      }
    }
  }

  return { hasStraightDraw: bestHasDraw, openEnded: bestOpenEnded, gutshot: bestGutshot };
}

function countOvercards(hole: Card[], board: Card[]): number {
  if (board.length === 0) return 0;
  const highestBoard = Math.max(...board.map(c => RANK_VALUES[c.rank]));
  return hole.filter(c => RANK_VALUES[c.rank] > highestBoard).length;
}
