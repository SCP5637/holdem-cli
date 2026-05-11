/**
 * 天选之子万能牌渲染器
 * 模仿普通牌风格，花色/牌值位置替换为 *
 */

const GOLD = '\x1b[33m';
const R = '\x1b[0m';

/** 全尺寸(5行) ┌─────┐ 风格 */
export function renderWildcardFull(): string[] {
  return [
    `${GOLD}┌─────┐${R}`,
    `${GOLD}│**   │${R}`,
    `${GOLD}│  *  │${R}`,
    `${GOLD}│   **│${R}`,
    `${GOLD}└─────┘${R}`,
  ];
}

/** 紧凑(3行) ┌───┐ 风格 */
export function renderWildcardCompact(): string[] {
  return [
    `${GOLD}┌───┐${R}`,
    `${GOLD}│* *│${R}`,
    `${GOLD}└───┘${R}`,
  ];
}

/** 简单文本 [**] */
export function renderWildcardSimple(): string {
  return `${GOLD}[**]${R}`;
}

/** 单行标签 {*} */
export function renderWildcardLabel(): string {
  return `${GOLD}{*}${R}`;
}
