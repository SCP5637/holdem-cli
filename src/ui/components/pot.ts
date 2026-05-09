/**
 * 底池信息组件
 */

import { Theme, themed, chipText } from '../theme';
import { centerAnsi, padAnsi } from '../engine/ansi';
import { visualWidth } from '../terminal';

export interface PotData {
  pot: number;
  sidePots: Array<{ amount: number; eligiblePlayers: number[] }>;
  currentBet: number;
}

export function renderPot(data: PotData, theme: Theme, width: number): string {
  const totalPot = data.pot + data.sidePots.reduce((s, sp) => s + sp.amount, 0);

  let parts: string[] = [];
  parts.push(themed('底池:', theme.dim) + ' ' + chipText(totalPot));

  if (data.sidePots.length > 0) {
    const sideStr = data.sidePots.map(sp => chipText(sp.amount)).join(' ');
    parts.push(themed('边池:', theme.dim) + ' ' + sideStr);
  }

  parts.push(themed('当前注:', theme.dim) + ' ' + chipText(data.currentBet));

  const full = parts.join('  ' + themed('│', theme.border) + '  ');
  return centerAnsi(full, width);
}

export function renderPotBox(data: PotData, theme: Theme, width: number): string[] {
  const BOX_W = Math.min(width - 2, 60);
  const INNER = BOX_W - 2;
  const totalPot = data.pot + data.sidePots.reduce((s, sp) => s + sp.amount, 0);

  const lines: string[] = [];
  const border = theme.border;
  lines.push(centerAnsi(themed('┌' + '─'.repeat(BOX_W) + '┐', border), width));
  lines.push(centerAnsi(themed('│', border) + ' ' + padAnsi(
    themed('总底池:', theme.dim) + ' ' + chipText(totalPot), INNER
  ) + ' ' + themed('│', border), width));

  if (data.sidePots.length > 0) {
    const sideText = data.sidePots.map((sp, i) =>
      `边池${i + 1}: ${chipText(sp.amount)}`).join('  ');
    lines.push(centerAnsi(themed('│', border) + ' ' + padAnsi(sideText, INNER) + ' ' + themed('│', border), width));
  }

  const betText = themed('当前下注:', theme.dim) + ' ' + chipText(data.currentBet);
  lines.push(centerAnsi(themed('│', border) + ' ' + padAnsi(betText, INNER) + ' ' + themed('│', border), width));
  lines.push(centerAnsi(themed('└' + '─'.repeat(BOX_W) + '┘', border), width));

  return lines;
}
