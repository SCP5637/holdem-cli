/**
 * 行动选择面板组件
 * 固定于屏幕底部，显示可用动作和按键提示
 */

import { PlayerAction } from '../../types/game';
import { Theme, themed } from '../theme';
import { padAnsi, centerAnsi } from '../engine/ansi';
import { truncateVisual } from '../terminal';

const ACTION_NAMES: Record<PlayerAction, string> = {
  [PlayerAction.Fold]: '弃牌',
  [PlayerAction.Check]: '过牌',
  [PlayerAction.Call]: '跟注',
  [PlayerAction.Raise]: '加注',
  [PlayerAction.AllIn]: '全押',
};

const ACTION_SHORT: Record<PlayerAction, string> = {
  [PlayerAction.Fold]: '弃',
  [PlayerAction.Check]: '过',
  [PlayerAction.Call]: '跟',
  [PlayerAction.Raise]: '加',
  [PlayerAction.AllIn]: 'AllIn',
};

export interface ActionPanelData {
  actions: PlayerAction[];
  toCall?: number;
  selectedIndex?: number;
  timeoutMs?: number;
}

export function renderActionPanel(data: ActionPanelData, theme: Theme, width: number, height?: number): string[] {
  if (data.actions.length === 0) return [];

  const boxW = Math.min(width - 2, 70);
  const inner = boxW - 2;
  const tight = inner < 32;

  const lines: string[] = [];
  const b = theme.border;

  lines.push(centerAnsi(themed('┌' + '─'.repeat(boxW) + '┐', b), width));

  const title = tight ? '行动' : '轮到你了';
  lines.push(centerAnsi(themed('│', b) + ' ' + padAnsi(themed(title, theme.highlight), inner) + ' ' + themed('│', b), width));
  lines.push(centerAnsi(themed('├' + '─'.repeat(boxW) + '┤', b), width));

  const nameMap = tight ? ACTION_SHORT : ACTION_NAMES;
  const parts: string[] = data.actions.map((action, idx) => {
    const num = idx + 1;
    const name = nameMap[action] || action;
    let label = `${num}.${name}`;
    if (data.selectedIndex === idx) {
      label = themed(label, '\x1b[34;1m');
    }
    return label;
  });

  const sep = tight ? ' ' : '  ';
  let actionLine = parts.join(sep);
  if (tight) actionLine = truncateVisual(actionLine, inner);
  lines.push(centerAnsi(themed('│', b) + ' ' + padAnsi(actionLine, inner) + ' ' + themed('│', b), width));

  const hint = tight
    ? `←→选择 Enter确认`
    : '←→ 选择 | 数字跳转 | Enter 确认';
  lines.push(centerAnsi(themed('│', b) + ' ' + padAnsi(themed(hint, theme.dim), inner) + ' ' + themed('│', b), width));

  if (data.timeoutMs !== undefined && data.timeoutMs > 0) {
    const secs = Math.ceil(data.timeoutMs / 1000);
    const countdown = `超时弃牌: ${secs}s`;
    lines.push(centerAnsi(themed('│', b) + ' ' + padAnsi(themed(countdown, theme.dim), inner) + ' ' + themed('│', b), width));
  } else if (data.timeoutMs === 0) {
    lines.push(centerAnsi(themed('│', b) + ' ' + padAnsi(themed('超时将自动弃牌', theme.dim), inner) + ' ' + themed('│', b), width));
  }

  lines.push(centerAnsi(themed('└' + '─'.repeat(boxW) + '┘', b), width));

  // 填充到目标高度
  while (height && lines.length < height) {
    lines.push(' '.repeat(width));
  }

  return lines.slice(0, height || lines.length);
}

/** 加注金额输入面板 */
export function renderRaiseInput(current: string, theme: Theme, width: number, height?: number): string[] {
  const boxW = Math.min(width - 2, 50);
  const inner = boxW;
  const b = theme.border;

  const lines = [
    centerAnsi(themed('┌' + '─'.repeat(boxW) + '┐', b), width),
    centerAnsi(themed('│', b) + ' ' + padAnsi(themed('输入加注金额:', theme.highlight), inner) + ' ' + themed('│', b), width),
    centerAnsi(themed('│', b) + ' ' + padAnsi('$ ' + themed(current, theme.accent) + '_', inner) + ' ' + themed('│', b), width),
    centerAnsi(themed('│', b) + ' ' + padAnsi(themed('Enter确认  Esc取消', theme.dim), inner) + ' ' + themed('│', b), width),
    centerAnsi(themed('└' + '─'.repeat(boxW) + '┘', b), width),
  ];

  while (height && lines.length < height) {
    lines.push(' '.repeat(width));
  }

  return lines.slice(0, height || lines.length);
}
