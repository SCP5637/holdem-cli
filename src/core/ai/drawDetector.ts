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

  // Check if hole cards are same suit and board has 2+ of that suit (4+ total)
  if (hole.length >= 2 && hole[0].suit === hole[1].suit) {
    const boardOfSuit = board.filter(c => c.suit === hole[0].suit).length;
    if (boardOfSuit >= 2) return true;
  }

  // Check if each hole card individually has 3+ board cards of same suit
  for (const h of hole) {
    const boardOfSuit = board.filter(c => c.suit === h.suit).length;
    if (boardOfSuit >= 3) return true;
  }

  return false;
}

function checkStraightDraw(cards: Card[]): { hasStraightDraw: boolean; openEnded: boolean; gutshot: boolean } {
  const values = [...new Set(cards.map(c => RANK_VALUES[c.rank]))].sort((a, b) => a - b);

  // Add A-as-1 for wheel draws
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

    // With 5 cards to come (flop: 2 to come, turn: 1 to come)
    // On flop: need 1 card to complete → 4 outs (gutshot) or 8 outs (open-ended)
    // On turn: need 1 card
    // Currently we have 2 hole + up to 5 board cards = up to 7
    if (needed.length === 1) {
      bestHasDraw = true;
      // Open-ended: the missing card is at either end of a 4-card sequence
      const existing4 = values.filter(v => v >= values[i] && v < values[i] + 5);
      if (existing4.length >= 4) {
        const min = Math.min(...existing4);
        const max = Math.max(...existing4);
        // Open-ended: missing either low end or high end (not both)
        if (needed[0] === min - 1 || needed[0] === max + 1) {
          bestOpenEnded = true;
        } else {
          bestGutshot = true;
        }
      }
    }

    if (needed.length === 2 && cards.length >= 5) {
      // We have 3 to a straight, need 2 specific cards
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
