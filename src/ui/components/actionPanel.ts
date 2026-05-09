/**
 * 行动选择面板组件
 * 固定于屏幕底部，显示可用动作和按键提示
 */

import { PlayerAction } from '../../types/game';
import { Theme, themed } from '../theme';
import { padAnsi, centerAnsi } from '../engine/ansi';

const ACTION_NAMES: Record<PlayerAction, string> = {
  [PlayerAction.Fold]: '弃牌',
  [PlayerAction.Check]: '过牌',
  [PlayerAction.Call]: '跟注',
  [PlayerAction.Raise]: '加注',
  [PlayerAction.AllIn]: '全押',
};

export interface ActionPanelData {
  actions: PlayerAction[];
  toCall?: number;
  selectedIndex?: number;
}

export function renderActionPanel(data: ActionPanelData, theme: Theme, width: number): string[] {
  if (data.actions.length === 0) return [];

  const boxW = Math.min(width - 2, 70);
  const inner = boxW - 2;

  const lines: string[] = [];
  const b = theme.border;

  lines.push(centerAnsi(themed('┌' + '─'.repeat(boxW) + '┐', b), width));
  lines.push(centerAnsi(themed('│', b) + ' ' + padAnsi(themed('轮到你了', theme.highlight), inner) + ' ' + themed('│', b), width));
  lines.push(centerAnsi(themed('├' + '─'.repeat(boxW) + '┤', b), width));

  // 构建动作按钮
  const parts: string[] = data.actions.map((action, idx) => {
    const num = idx + 1;
    const name = ACTION_NAMES[action] || action;
    let label = `${num}.${name}`;
    if (data.selectedIndex === idx) {
      label = themed(label, theme.highlight);
    }
    return label;
  });

  const actionLine = parts.join('  ');
  lines.push(centerAnsi(themed('│', b) + ' ' + padAnsi(actionLine, inner) + ' ' + themed('│', b), width));

  const hint = '按数字键1-' + data.actions.length + ' 选择动作';
  lines.push(centerAnsi(themed('│', b) + ' ' + padAnsi(themed(hint, theme.dim), inner) + ' ' + themed('│', b), width));

  lines.push(centerAnsi(themed('└' + '─'.repeat(boxW) + '┘', b), width));

  return lines;
}

/** 加注金额输入面板 */
export function renderRaiseInput(current: string, theme: Theme, width: number): string[] {
  const boxW = Math.min(width - 2, 50);
  const inner = boxW;
  const b = theme.border;

  return [
    centerAnsi(themed('┌' + '─'.repeat(boxW) + '┐', b), width),
    centerAnsi(themed('│', b) + ' ' + padAnsi(themed('输入加注金额:', theme.highlight), inner) + ' ' + themed('│', b), width),
    centerAnsi(themed('│', b) + ' ' + padAnsi('$ ' + themed(current, theme.accent) + '_', inner) + ' ' + themed('│', b), width),
    centerAnsi(themed('│', b) + ' ' + padAnsi(themed('Enter确认  Esc取消', theme.dim), inner) + ' ' + themed('│', b), width),
    centerAnsi(themed('└' + '─'.repeat(boxW) + '┘', b), width),
  ];
}
