/**
 * 玻璃卡片渲染器
 * 淡蓝灰底模拟透明效果 + 逐字符随机高亮边框模拟玻璃反光
 */

import { Card, SUIT_SYMBOLS, RANK_VALUES } from '../../types/card';

const BASE = '\x1b[38;5;153m';       // 淡蓝灰
const R = '\x1b[0m';
const SUIT_DIM = '\x1b[38;5;109m';   // 暗青绿(牌面内容)
const HIGHLIGHTS = [                    // 高亮反光色池
  '\x1b[38;5;195m',   // 亮青
  '\x1b[38;5;231m',   // 白
  '\x1b[38;5;159m',   // 亮蓝绿
  '\x1b[38;5;117m',   // 浅蓝
  '\x1b[38;5;189m',   // 极浅蓝
  '\x1b[38;5;87m',    // 亮绿青
];

function getRankDisplay(rank: string): string {
  return rank === 'T' ? '10' : rank;
}

/** 确定性伪随机生成器 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

function suitIdx(card: Card): number {
  return ['hearts', 'diamonds', 'clubs', 'spades'].indexOf(card.suit);
}

/** 高亮抽色: 15% 概率抽中随机高亮色，否则返回底色 */
function highlightPicker(rng: () => number): () => string {
  const pool = HIGHLIGHTS;
  return () => {
    const v = rng();
    if (v < 0.18) return pool[Math.floor(v * 97) % pool.length];
    return BASE;
  };
}

/**
 * 全尺寸(5行)玻璃卡片
 */
export function renderGlassCardFull(card: Card): string[] {
  const seed = RANK_VALUES[card.rank] * 13 + suitIdx(card);
  const rng = mulberry32(seed);
  const h = highlightPicker(rng);

  const suit = SUIT_SYMBOLS[card.suit];
  const rank = getRankDisplay(card.rank);
  const topRank = rank.padEnd(5, ' ');
  const bottomRank = rank.padStart(5, ' ');

  return [
    h()+'┌'+h()+'─'+h()+'─'+h()+'─'+h()+'─'+h()+'─'+h()+'┐'+R,
    h()+'│'+R+SUIT_DIM+topRank+R+h()+'│'+R,
    h()+'│'+R+'  '+SUIT_DIM+suit+R+'  '+h()+'│'+R,
    h()+'│'+R+SUIT_DIM+bottomRank+R+h()+'│'+R,
    h()+'└'+h()+'─'+h()+'─'+h()+'─'+h()+'─'+h()+'─'+h()+'┘'+R,
  ];
}

/**
 * 紧凑(3行)玻璃卡片
 */
export function renderGlassCardCompact(card: Card): string[] {
  const seed = RANK_VALUES[card.rank] * 13 + suitIdx(card) + 1;
  const rng = mulberry32(seed);
  const h = highlightPicker(rng);

  const suit = SUIT_SYMBOLS[card.suit];
  const rank = getRankDisplay(card.rank);

  return [
    h()+'┌'+h()+'─'+h()+'─'+h()+'─'+h()+'┐'+R,
    h()+'│'+R+SUIT_DIM+rank.padEnd(2)+suit+R+h()+'│'+R,
    h()+'└'+h()+'─'+h()+'─'+h()+'─'+h()+'┘'+R,
  ];
}

/**
 * 简单文本玻璃卡片 [A♠]
 */
export function renderGlassCardSimple(card: Card): string {
  const suit = SUIT_SYMBOLS[card.suit];
  return BASE + '[' + SUIT_DIM + getRankDisplay(card.rank) + suit + R + BASE + ']' + R;
}
