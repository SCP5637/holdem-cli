/**
 * 游戏标题头组件
 * 显示游戏名称、当前阶段、手牌号
 */

import { Theme, themed } from '../theme';
import { padVisual, visualWidth } from '../terminal';
import { centerAnsi, fg256 } from '../engine/ansi';

const BOX_H = '─';
const BOX_V = '│';
const BOX_TL = '┌';
const BOX_TR = '┐';
const BOX_BL = '└';
const BOX_BR = '┘';

const PHASE_NAMES: Record<string, string> = {
  preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌'
};

export interface HeaderData {
  phase: string;
  handNumber: number;
}

export function renderHeader(data: HeaderData, theme: Theme, width: number): string[] {
  const phaseName = PHASE_NAMES[data.phase] || data.phase;
  const title = `德州扑克 - ${phaseName}  #${data.handNumber}`;
  const boxW = Math.min(width - 2, 70);
  const inner = boxW - 2;

  const titleLine = centerAnsi(themed(title, theme.phaseTitle), inner);

  return [
    ' '.repeat(Math.floor((width - boxW - 2) / 2)) + themed(BOX_TL + BOX_H.repeat(inner + 2) + BOX_TR, theme.border),
    ' '.repeat(Math.floor((width - boxW - 2) / 2)) + themed(BOX_V, theme.border) + ' ' + titleLine + ' ' + themed(BOX_V, theme.border),
    ' '.repeat(Math.floor((width - boxW - 2) / 2)) + themed(BOX_BL + BOX_H.repeat(inner + 2) + BOX_BR, theme.border),
  ];
}
