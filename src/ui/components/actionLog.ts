/**
 * 行动历史日志面板
 * 可滚动，显示本手牌所有玩家的历史动作和系统消息
 */

import { Theme, themed, chipText } from '../theme';
import { padAnsi } from '../engine/ansi';
import { truncateVisual, visualWidth } from '../terminal';

const ACTION_NAMES: Record<string, string> = {
  fold: '弃牌', check: '过牌', call: '跟注', raise: '加注到', allin: '全押'
};

export interface ActionLogEntry {
  playerName: string;
  action: string;
  amount?: number;
  time?: string;
}

export interface ActionLogData {
  entries: ActionLogEntry[];
  systemEntries: ActionLogEntry[];
  scrollOffset: number;
}

export function renderActionLog(data: ActionLogData, theme: Theme, width: number, height: number): string[] {
  const b = theme.border;
  const innerW = width - 2;
  const contentH = height - 2;
  const entryH = contentH - 2;

  if (innerW <= 0 || entryH <= 0) return [];

  // 合并玩家动作与系统消息，按时间排序（系统消息已自带时间）
  const allEntries: { text: string; isSystem: boolean }[] = [];

  for (const e of data.systemEntries) {
    const timeStr = e.time || '';
    allEntries.push({
      text: `${themed(timeStr, theme.dim)} ${e.playerName}: ${e.action}`,
      isSystem: true,
    });
  }

  for (const e of data.entries) {
    const timeStr = e.time || '';
    const actionName = ACTION_NAMES[e.action] || e.action;
    let text = `${themed(timeStr, theme.dim)} ${e.playerName}: ${actionName}`;
    if (e.amount && e.amount > 0) {
      text += ` ${chipText(e.amount)}`;
    }
    allEntries.push({ text, isSystem: false });
  }

  const totalEntries = allEntries.length;
  const maxScroll = Math.max(0, totalEntries - entryH);
  const scrollOffset = Math.max(0, Math.min(data.scrollOffset, maxScroll));
  const startIdx = Math.max(0, totalEntries - entryH - scrollOffset);
  const visibleEntries = allEntries.slice(startIdx, totalEntries - scrollOffset);

  const lines: string[] = [];

  lines.push(themed('┌' + '─'.repeat(innerW) + '┐', b));
  lines.push(themed('│', b) + padAnsi(themed('行动记录', theme.dim), innerW) + themed('│', b));
  lines.push(themed('├' + '─'.repeat(innerW) + '┤', b));

  for (let i = 0; i < entryH; i++) {
    if (i < visibleEntries.length) {
      const entry = visibleEntries[i];
      const plain = entry.text.replace(/\x1b\[[0-9;]*m/g, '');
      const truncated = truncateVisual(plain, innerW);
      const styled = entry.isSystem ? themed(truncated, theme.dim) : truncated;
      lines.push(themed('│', b) + padAnsi(styled, innerW) + themed('│', b));
    } else {
      lines.push(themed('│', b) + ' '.repeat(innerW) + themed('│', b));
    }
  }

  if (totalEntries > entryH) {
    const hasAbove = scrollOffset < maxScroll;
    const hasBelow = scrollOffset > 0;
    let indicator = '';
    if (hasAbove && hasBelow) indicator = '▲▼';
    else if (hasAbove) indicator = '▲';
    else if (hasBelow) indicator = '▼';
    const padEachSide = Math.floor((innerW - visualWidth(indicator)) / 2);
    const indicatorLine = ' '.repeat(padEachSide) + themed(indicator, theme.dim);
    lines.push(themed('│', b) + padAnsi(indicatorLine, innerW) + themed('│', b));
    lines.push(themed('└' + '─'.repeat(innerW) + '┘', b));
  } else {
    lines.push(themed('└' + '─'.repeat(innerW) + '┘', b));
  }

  return lines;
}
