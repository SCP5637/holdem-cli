/**
 * 旋转动画 / 进度条组件
 */

import { Theme, themed } from '../theme';
import { centerAnsi } from '../engine/ansi';

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function renderSpinner(message: string, frame: number, theme: Theme, width: number): string {
  const spinner = BRAILLE_FRAMES[frame % BRAILLE_FRAMES.length];
  const text = `${spinner} ${message}`;
  return centerAnsi(themed(text, theme.accent), width);
}

export function renderProgressBar(
  progress: number,
  fromPhase: string,
  toPhase: string,
  theme: Theme,
  width: number
): string[] {
  const barW = Math.min(width - 10, 40);
  const filled = Math.round(barW * Math.min(progress, 1));
  const empty = barW - filled;

  const bar = themed('█'.repeat(filled), theme.accent) + themed('░'.repeat(empty), theme.dim);
  const pct = Math.round(progress * 100);
  const label = `${fromPhase} → ${toPhase}`;

  const phaseNames: Record<string, string> = {
    preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌'
  };

  return [
    centerAnsi(themed(label, theme.dim), width),
    centerAnsi(`${bar} ${themed(`${pct}%`, theme.accent)}`, width),
  ];
}

export { BRAILLE_FRAMES };
