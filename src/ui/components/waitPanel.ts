/**
 * Wait面板 — 非己方回合时的等待状态展示
 * "Wait" 逐字蓝色波动 + 跳动点号动画
 */

import { Theme, themed } from '../theme';
import { padAnsi, centerAnsi } from '../engine/ansi';

const DOT_FRAMES = ['   ', '.  ', '.. ', '...'];

function waveText(text: string, frame: number): string {
  const bright = '\x1b[34;1m';
  const dim = '\x1b[34m';
  const R = '\x1b[0m';
  const idx = frame % text.length;
  let result = '';
  for (let i = 0; i < text.length; i++) {
    if (i === idx) {
      result += bright + text[i];
    } else {
      result += dim + text[i];
    }
  }
  return result + R;
}

export function renderWaitPanel(
  frame: number,
  message: string,
  theme: Theme,
  width: number,
  height: number
): string[] {
  const b = theme.border;
  const innerW = width - 2;
  const innerH = height - 2;

  if (innerW <= 0 || innerH <= 0) return [];

  const dots = DOT_FRAMES[Math.floor(frame / 2) % DOT_FRAMES.length];
  const waitText = waveText('Wait', frame) + themed(dots, theme.accent);
  const lines: string[] = [];

  lines.push(themed('┌' + '─'.repeat(innerW) + '┐', b));

  const centerRow = Math.floor(innerH / 2);
  for (let i = 0; i < innerH; i++) {
    if (i === centerRow - 1) {
      lines.push(themed('│', b) + centerAnsi(waitText, innerW) + themed('│', b));
    } else if (i === centerRow && message) {
      const truncated = message.length > innerW - 2 ? message.slice(0, innerW - 5) + '...' : message;
      lines.push(themed('│', b) + centerAnsi(themed(truncated, theme.dim), innerW) + themed('│', b));
    } else {
      lines.push(themed('│', b) + ' '.repeat(innerW) + themed('│', b));
    }
  }

  lines.push(themed('└' + '─'.repeat(innerW) + '┘', b));

  return lines;
}
