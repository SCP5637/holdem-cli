/**
 * 摊牌结果组件
 */

import { Theme, themed, chipText } from '../theme';
import { centerAnsi, padAnsi } from '../engine/ansi';

export interface HandResultPlayer {
  name: string;
  handDescription: string;
  isWinner: boolean;
}

export function renderHandResult(players: HandResultPlayer[], totalPot: number, theme: Theme, width: number): string[] {
  const boxW = Math.min(width - 2, 60);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push('');
  lines.push(centerAnsi(themed('╔' + '═'.repeat(boxW) + '╗', b), width));
  lines.push(centerAnsi(themed('║', b) + ' ' + centerAnsi(themed('手牌结果', theme.phaseTitle), inner) + ' ' + themed('║', b), width));
  lines.push(centerAnsi(themed('╚' + '═'.repeat(boxW) + '╝', b), width));

  for (const p of players) {
    const star = p.isWinner ? themed('★', theme.warning) : '  ';
    const desc = p.isWinner ? themed(p.handDescription, theme.success) : themed(p.handDescription, theme.dim);
    const line = `${star} ${p.name}: ${desc}`;
    lines.push('  ' + line);
  }

  lines.push('');
  const winnerNames = players.filter(p => p.isWinner).map(p => p.name);
  if (winnerNames.length === 1) {
    lines.push('  ' + themed(`${winnerNames[0]} 赢得 `, theme.success) + chipText(totalPot));
  } else {
    const share = Math.floor(totalPot / winnerNames.length);
    lines.push('  ' + themed(`${winnerNames.join(', ')} 平分底池 (每人 `, theme.success) + chipText(share) + ')');
  }

  lines.push('');
  return lines;
}
