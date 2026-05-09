/**
 * 菜单UI渲染组件 — 纯函数, 输出string[]
 * 遵循现有 component pattern: (data, theme, width) => string[]
 */

import { Theme, themed, chipText } from '../theme';
import { centerAnsi, padAnsi } from '../engine/ansi';
import { visualWidth, stripAnsi } from '../terminal';

const BOX_H = '─';
const BOX_V = '│';
const BOX_TL = '┌';
const BOX_TR = '┐';
const BOX_BL = '└';
const BOX_BR = '┘';
const BOX_HL = '├';
const BOX_HR = '┤';

const MENU_BOX_W = 62;

/** 居中标题框 */
export function renderTitle(title: string, theme: Theme, width: number): string[] {
  const boxW = Math.min(width - 4, MENU_BOX_W);
  const inner = boxW - 2;
  const lines: string[] = [];
  const b = theme.border;
  lines.push('');
  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  lines.push(centerAnsi(themed(BOX_V, b) + ' ' + centerAnsi(themed(title, theme.phaseTitle), inner) + ' ' + themed(BOX_V, b), width));
  lines.push(centerAnsi(themed(BOX_BL + BOX_H.repeat(inner) + BOX_BR, b), width));
  lines.push('');
  return lines;
}

/** 副标题 — 居中dim文字 */
export function renderSubtitle(text: string, theme: Theme, width: number): string {
  return centerAnsi(themed(text, theme.dim), width);
}

/** 选项列表 — 高亮selectedIndex, 箭头可导航 */
export function renderSelectionList(
  options: string[],
  selectedIndex: number,
  theme: Theme,
  width: number
): string[] {
  const boxW = Math.min(width - 4, MENU_BOX_W);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    // 分隔线
    if (opt === '---' || opt === '') {
      lines.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));
      continue;
    }

    const cursor = i === selectedIndex ? themed('▶', theme.highlight) : ' ';
    const label = i === selectedIndex ? themed(opt, theme.highlight) : opt;
    const content = `${cursor} ${label}`;
    lines.push(centerAnsi(
      themed(BOX_V, b) + ' ' + padAnsi(content, inner) + ' ' + themed(BOX_V, b),
      width
    ));
  }

  lines.push(centerAnsi(themed(BOX_BL + BOX_H.repeat(inner) + BOX_BR, b), width));

  return lines;
}

/** 底部状态栏提示 */
export function renderStatusBar(text: string, theme: Theme, width: number): string {
  return centerAnsi(themed(text, theme.dim), width);
}

/** 文本输入框 */
export function renderTextBox(
  prompt: string,
  value: string,
  theme: Theme,
  width: number
): string[] {
  const boxW = Math.min(width - 4, 55);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push('');
  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  lines.push(centerAnsi(
    themed(BOX_V, b) + ' ' + padAnsi(themed(prompt, theme.accent), inner) + ' ' + themed(BOX_V, b),
    width
  ));
  lines.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));

  const displayVal = value + (value.length < 40 ? themed('▍', theme.accent) : '');
  lines.push(centerAnsi(
    themed(BOX_V, b) + ' ' + padAnsi(displayVal, inner) + ' ' + themed(BOX_V, b),
    width
  ));

  lines.push(centerAnsi(themed(BOX_BL + BOX_H.repeat(inner) + BOX_BR, b), width));
  lines.push('');
  lines.push(renderStatusBar('Enter 确认  Esc 取消', theme, width));

  return lines;
}

/** 数字输入框 — 含范围提示 */
export function renderNumberInput(
  prompt: string,
  value: string,
  min: number,
  max: number,
  theme: Theme,
  width: number
): string[] {
  const boxW = Math.min(width - 4, 55);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push('');
  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  lines.push(centerAnsi(
    themed(BOX_V, b) + ' ' + padAnsi(themed(prompt, theme.accent), inner) + ' ' + themed(BOX_V, b),
    width
  ));
  lines.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));

  const displayVal = value + (value.length < 40 ? themed('▍', theme.accent) : '');
  lines.push(centerAnsi(
    themed(BOX_V, b) + ' ' + padAnsi(displayVal, inner) + ' ' + themed(BOX_V, b),
    width
  ));

  const hint = `范围: ${min} ~ ${max}`;
  lines.push(centerAnsi(
    themed(BOX_V, b) + ' ' + padAnsi(themed(hint, theme.dim), inner) + ' ' + themed(BOX_V, b),
    width
  ));

  lines.push(centerAnsi(themed(BOX_BL + BOX_H.repeat(inner) + BOX_BR, b), width));
  lines.push('');
  lines.push(renderStatusBar('↑↓ 调整  Enter 确认  Esc 取消', theme, width));

  return lines;
}

/** Yes/No 确认切换框 */
export function renderYesNo(
  prompt: string,
  selectedYes: boolean,
  theme: Theme,
  width: number
): string[] {
  const boxW = Math.min(width - 4, 50);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push('');
  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  lines.push(centerAnsi(
    themed(BOX_V, b) + ' ' + padAnsi(themed(prompt, theme.accent), inner) + ' ' + themed(BOX_V, b),
    width
  ));
  lines.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));

  const yLabel = selectedYes ? themed('[ Y ]', theme.highlight) : themed('  Y  ', theme.dim);
  const nLabel = !selectedYes ? themed('[ N ]', theme.highlight) : themed('  N  ', theme.dim);
  const toggle = `    ${yLabel}    ${nLabel}`;
  lines.push(centerAnsi(
    themed(BOX_V, b) + ' ' + padAnsi(toggle, inner) + ' ' + themed(BOX_V, b),
    width
  ));

  lines.push(centerAnsi(themed(BOX_BL + BOX_H.repeat(inner) + BOX_BR, b), width));
  lines.push('');
  lines.push(renderStatusBar('← → 切换  Enter 确认  Esc 取消', theme, width));

  return lines;
}

/** 信息展示框 — 用于显示当前状态/设置摘要 */
export function renderInfoBox(
  title: string,
  lines_: string[],
  theme: Theme,
  width: number
): string[] {
  const boxW = Math.min(width - 4, 60);
  const inner = boxW - 2;
  const b = theme.border;
  const result: string[] = [];

  result.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  result.push(centerAnsi(
    themed(BOX_V, b) + ' ' + padAnsi(themed(title, theme.phaseTitle), inner) + ' ' + themed(BOX_V, b),
    width
  ));
  result.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));

  for (const line of lines_) {
    result.push(centerAnsi(
      themed(BOX_V, b) + ' ' + padAnsi(line, inner) + ' ' + themed(BOX_V, b),
      width
    ));
  }

  result.push(centerAnsi(themed(BOX_BL + BOX_H.repeat(inner) + BOX_BR, b), width));
  return result;
}

/** 带描述的多行选项列表 — 适用于难度选择等 */
export function renderDescribedList(
  options: { label: string; desc: string }[],
  selectedIndex: number,
  theme: Theme,
  width: number
): string[] {
  const boxW = Math.min(width - 4, 64);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const cursor = i === selectedIndex ? themed('▶', theme.highlight) : ' ';
    const num = themed(`${i + 1}.`, theme.dim);
    const label = i === selectedIndex
      ? themed(opt.label, theme.highlight)
      : opt.label;
    const desc = themed(opt.desc, theme.dim);

    const line1 = `${cursor} ${num} ${label}`;
    lines.push(centerAnsi(
      themed(BOX_V, b) + ' ' + padAnsi(line1, inner) + ' ' + themed(BOX_V, b),
      width
    ));

    const line2 = `     ${desc}`;
    lines.push(centerAnsi(
      themed(BOX_V, b) + ' ' + padAnsi(line2, inner) + ' ' + themed(BOX_V, b),
      width
    ));
  }

  lines.push(centerAnsi(themed(BOX_BL + BOX_H.repeat(inner) + BOX_BR, b), width));
  return lines;
}

/** 水平排列的快速操作按钮行 */
export function renderQuickActions(
  actions: string[],
  selectedIndex: number,
  theme: Theme,
  width: number
): string[] {
  const b = theme.border;
  const lines: string[] = [];

  const parts = actions.map((a, i) => {
    const label = `[ ${i + 1}. ${a} ]`;
    return i === selectedIndex ? themed(label, theme.highlight) : label;
  });

  const joined = parts.join('  ');
  lines.push(centerAnsi(joined, width));
  return lines;
}
