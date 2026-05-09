/**
 * 游戏结束排行榜组件
 */

import { Theme, themed, chipText } from '../theme';
import { centerAnsi } from '../engine/ansi';

export interface GameOverPlayer {
  name: string;
  chips: number;
}

export function renderGameOver(players: GameOverPlayer[], theme: Theme, width: number): string[] {
  const boxW = Math.min(width - 2, 60);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push('');
  lines.push(centerAnsi(themed('╔' + '═'.repeat(boxW) + '╗', b), width));
  lines.push(centerAnsi(themed('║', b) + ' ' + centerAnsi(themed('游戏结束', theme.phaseTitle), inner) + ' ' + themed('║', b), width));
  lines.push(centerAnsi(themed('╚' + '═'.repeat(boxW) + '╝', b), width));
  lines.push('');

  const sorted = [...players].sort((a, b) => b.chips - a.chips);

  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    const name = i === 0 ? themed(p.name, theme.success) : p.name;
    lines.push(`  ${medal} ${i + 1}. ${name}: ${chipText(p.chips)}`);
  }

  lines.push('');
  return lines;
}
