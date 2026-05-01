/**
 * 扑克手牌评估系统
 * 实现标准扑克手牌排名逻辑，从7张可用卡牌（2张底牌 + 5张公共牌）中确定最佳5张手牌
 */

import { Card, Rank, Suit, RANK_VALUES } from '../types/card';
import { HandRank, HandResult } from '../types/game';

/**
 * 从7张可用卡牌中评估最佳5张扑克手牌
 * @param cards - 7张卡牌数组（2张底牌 + 5张公共牌）
 * @returns 手牌等级和相关信息
 */
export function evaluateHand(cards: Card[]): { rank: HandRank; kickers: number[]; description: string } {
  if (cards.length < 2) {
    return { rank: HandRank.HighCard, kickers: [], description: '无效手牌' };
  }

  if (cards.length < 5) {
    const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
    return { rank: HandRank.HighCard, kickers: values, description: `${getRankName(values[0])}高牌` };
  }

  const bestHand = findBestHand(cards);
  return bestHand;
}

/**
 * 从可用卡牌中找到最佳5张组合
 * @param cards - 可用卡牌数组
 * @returns 找到的最佳手牌
 */
function findBestHand(cards: Card[]): { rank: HandRank; kickers: number[]; description: string } {
  const combinations = getCombinations(cards, 5);
  let bestRank = HandRank.HighCard;
  let bestKickers: number[] = [];
  let bestDescription = '高牌';

  for (const combo of combinations) {
    const result = evaluateFiveCardHand(combo);
    if (result.rank > bestRank ||
        (result.rank === bestRank && compareKickers(result.kickers, bestKickers) > 0)) {
      bestRank = result.rank;
      bestKickers = result.kickers;
      bestDescription = result.description;
    }
  }

  return { rank: bestRank, kickers: bestKickers, description: bestDescription };
}

/**
 * 评估5张手牌并返回其等级
 * @param cards - 恰好5张的卡牌数组
 * @returns 手牌评估结果
 */
function evaluateFiveCardHand(cards: Card[]): { rank: HandRank; kickers: number[]; description: string } {
  const values = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  const uniqueValues = [...new Set(values)];
  const isStraight = checkStraight(uniqueValues);

  const counts: Record<number, number> = {};
  for (const v of values) {
    counts[v] = (counts[v] || 0) + 1;
  }
  const countValues = Object.values(counts).sort((a, b) => b - a);

  if (isFlush && isStraight) {
    const isRoyal = values[0] === 14 && values[1] === 13;
    if (isRoyal) {
      return { rank: HandRank.RoyalFlush, kickers: values, description: '皇家同花顺' };
    }
    return { rank: HandRank.StraightFlush, kickers: values, description: `${getRankName(values[0])}大同花顺` };
  }

  if (countValues[0] === 4) {
    const quads = parseInt(Object.keys(counts).find(k => counts[parseInt(k)] === 4)!);
    const kicker = values.find(v => v !== quads)!;
    return { rank: HandRank.FourOfAKind, kickers: [quads, kicker], description: `四条${getRankName(quads)}` };
  }

  if (countValues[0] === 3 && countValues[1] === 2) {
    const trips = parseInt(Object.keys(counts).find(k => counts[parseInt(k)] === 3)!);
    const pair = parseInt(Object.keys(counts).find(k => counts[parseInt(k)] === 2)!);
    return { rank: HandRank.FullHouse, kickers: [trips, pair], description: `${getRankName(trips)}葫芦${getRankName(pair)}` };
  }

  if (isFlush) {
    return { rank: HandRank.Flush, kickers: values, description: `${getRankName(values[0])}大同花` };
  }

  if (isStraight) {
    const straightHigh = getStraightHigh(uniqueValues);
    return { rank: HandRank.Straight, kickers: [straightHigh], description: `${getRankName(straightHigh)}大顺子` };
  }

  if (countValues[0] === 3) {
    const trips = parseInt(Object.keys(counts).find(k => counts[parseInt(k)] === 3)!);
    const kickers = values.filter(v => v !== trips).slice(0, 2);
    return { rank: HandRank.ThreeOfAKind, kickers: [trips, ...kickers], description: `三条${getRankName(trips)}` };
  }

  if (countValues[0] === 2 && countValues[1] === 2) {
    const pairs = Object.keys(counts)
      .filter(k => counts[parseInt(k)] === 2)
      .map(k => parseInt(k))
      .sort((a, b) => b - a);
    const kicker = values.find(v => !pairs.includes(v))!;
    return { rank: HandRank.TwoPair, kickers: [...pairs, kicker], description: `${getRankName(pairs[0])}${getRankName(pairs[1])}两对` };
  }

  if (countValues[0] === 2) {
    const pair = parseInt(Object.keys(counts).find(k => counts[parseInt(k)] === 2)!);
    const kickers = values.filter(v => v !== pair).slice(0, 3);
    return { rank: HandRank.OnePair, kickers: [pair, ...kickers], description: `一对${getRankName(pair)}` };
  }

  return { rank: HandRank.HighCard, kickers: values, description: `${getRankName(values[0])}高牌` };
}

/**
 * 检查给定数值是否形成顺子
 * @param sortedUniqueValues - 排序后的唯一卡牌数值
 * @returns 如果数值形成顺子则返回true
 */
function checkStraight(sortedUniqueValues: number[]): boolean {
  if (sortedUniqueValues.length < 5) return false;

  for (let i = 0; i <= sortedUniqueValues.length - 5; i++) {
    if (sortedUniqueValues[i] - sortedUniqueValues[i + 4] === 4) {
      return true;
    }
  }

  if (sortedUniqueValues.includes(14)) {
    const lowValues = sortedUniqueValues.map(v => v === 14 ? 1 : v).sort((a, b) => b - a);
    for (let i = 0; i <= lowValues.length - 5; i++) {
      if (lowValues[i] - lowValues[i + 4] === 4) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 获取顺子的高牌数值
 * @param sortedUniqueValues - 排序后的唯一卡牌数值
 * @returns 高牌数值（A-2-3-4-5顺子为5）
 */
function getStraightHigh(sortedUniqueValues: number[]): number {
  for (let i = 0; i <= sortedUniqueValues.length - 5; i++) {
    if (sortedUniqueValues[i] - sortedUniqueValues[i + 4] === 4) {
      return sortedUniqueValues[i];
    }
  }

  if (sortedUniqueValues.includes(14)) {
    const hasLowStraight = [14, 2, 3, 4, 5].every(v =>
      sortedUniqueValues.includes(v) || (v === 14 && sortedUniqueValues.includes(14))
    );
    if (hasLowStraight) return 5;
  }

  return sortedUniqueValues[0];
}

/**
 * 获取点数数值的名称
 * @param value - 数值点数
 * @returns 点数名称
 */
function getRankName(value: number): string {
  const names: Record<number, string> = {
    14: 'A', 13: 'K', 12: 'Q', 11: 'J',
    10: '10', 9: '9', 8: '8', 7: '7',
    6: '6', 5: '5', 4: '4', 3: '3', 2: '2'
  };
  return names[value] || value.toString();
}

/**
 * 比较两个踢脚数组以确定哪个更高
 * @param a - 第一个踢脚数组
 * @param b - 第二个踢脚数组
 * @returns 正数表示a > b，负数表示a < b，0表示相等
 */
function compareKickers(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

/**
 * 从数组中生成k个元素的所有组合
 * @param arr - 源数组
 * @param k - 组合大小
 * @returns 所有组合的数组
 */
function getCombinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];

  const result: T[][] = [];
  const first = arr[0];
  const rest = arr.slice(1);

  for (const combo of getCombinations(rest, k - 1)) {
    result.push([first, ...combo]);
  }

  result.push(...getCombinations(rest, k));
  return result;
}

/**
 * 确定多名玩家中的获胜者
 * @param results - 每位玩家的手牌结果数组
 * @returns 获胜玩家ID数组
 */
export function determineWinners(results: HandResult[]): number[] {
  if (results.length === 0) return [];

  let bestRank = HandRank.HighCard;
  let bestKickers: number[] = [];
  const winners: number[] = [];

  for (const result of results) {
    if (result.handRank > bestRank) {
      bestRank = result.handRank;
      bestKickers = result.kickers;
      winners.length = 0;
      winners.push(result.playerId);
    } else if (result.handRank === bestRank) {
      const comparison = compareKickers(result.kickers, bestKickers);
      if (comparison > 0) {
        bestKickers = result.kickers;
        winners.length = 0;
        winners.push(result.playerId);
      } else if (comparison === 0) {
        winners.push(result.playerId);
      }
    }
  }

  return winners;
}
