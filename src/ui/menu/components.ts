/**
 * 菜单UI渲染组件 — 纯函数, 输出string[]
 * 遵循现有 component pattern: (data, theme, width) => string[]
 */

import { Theme, themed, chipText } from '../theme';
import { centerAnsi, padAnsi } from '../engine/ansi';
import { visualWidth, stripAnsi, truncateVisual } from '../terminal';

const BOX_H = '─';
const BOX_V = '│';
const BOX_TL = '┌';
const BOX_TR = '┐';
const BOX_BL = '└';
const BOX_BR = '┘';
const BOX_HL = '├';
const BOX_HR = '┤';

const BOX_W = 62;

/** 框体内一行：边框 + 左右各1空格内边距 + 内容，总视觉宽度 = inner + 2 = BOX_W */
function boxLine(content: string, inner: number, borderColor: string): string {
  const maxContentW = inner - 2;
  const plain = stripAnsi(content);
  let display: string;
  if (visualWidth(plain) > maxContentW) {
    // 需要截断：截断纯文本后重新组装（丢失ANSI颜色）
    display = truncateVisual(plain, maxContentW);
  } else {
    display = content;
  }
  return themed(BOX_V, borderColor) + padAnsi(' ' + display + ' ', inner) + themed(BOX_V, borderColor);
}

/** 居中标题框 */
export function renderTitle(title: string, theme: Theme, width: number): string[] {
  const boxW = Math.min(width - 4, BOX_W);
  const inner = boxW - 2;
  const lines: string[] = [];
  const b = theme.border;
  const titleText = truncateVisual(title, inner - 2);
  lines.push('');
  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  lines.push(centerAnsi(boxLine(centerAnsi(themed(titleText, theme.phaseTitle), inner - 2), inner, b), width));
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
  const boxW = Math.min(width - 4, BOX_W);
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
    const labelText = truncateVisual(opt, inner - 4);
    const label = i === selectedIndex ? themed(labelText, theme.highlight) : labelText;
    const content = `${cursor} ${label}`;
    lines.push(centerAnsi(boxLine(content, inner, b), width));
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
  const boxW = Math.min(width - 4, BOX_W);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push('');
  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  lines.push(centerAnsi(boxLine(themed(prompt, theme.accent), inner, b), width));
  lines.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));

  const displayVal = value + (value.length < 40 ? themed('▍', theme.accent) : '');
  lines.push(centerAnsi(boxLine(displayVal, inner, b), width));

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
  const boxW = Math.min(width - 4, BOX_W);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push('');
  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  lines.push(centerAnsi(boxLine(themed(prompt, theme.accent), inner, b), width));
  lines.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));

  const displayVal = value + (value.length < 40 ? themed('▍', theme.accent) : '');
  lines.push(centerAnsi(boxLine(displayVal, inner, b), width));

  const hint = `范围: ${min} ~ ${max}`;
  lines.push(centerAnsi(boxLine(themed(hint, theme.dim), inner, b), width));

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
  const boxW = Math.min(width - 4, BOX_W);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push('');
  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  lines.push(centerAnsi(boxLine(themed(prompt, theme.accent), inner, b), width));
  lines.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));

  const yLabel = selectedYes ? themed('[ Y ]', theme.highlight) : themed('  Y  ', theme.dim);
  const nLabel = !selectedYes ? themed('[ N ]', theme.highlight) : themed('  N  ', theme.dim);
  const toggle = `    ${yLabel}    ${nLabel}`;
  lines.push(centerAnsi(boxLine(toggle, inner, b), width));

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
  const boxW = Math.min(width - 4, BOX_W);
  const inner = boxW - 2;
  const b = theme.border;
  const result: string[] = [];

  result.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));
  result.push(centerAnsi(boxLine(themed(title, theme.phaseTitle), inner, b), width));
  result.push(centerAnsi(themed(BOX_HL + BOX_H.repeat(inner) + BOX_HR, b), width));

  for (const line of lines_) {
    result.push(centerAnsi(boxLine(line, inner, b), width));
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
  const boxW = Math.min(width - 4, BOX_W);
  const inner = boxW - 2;
  const b = theme.border;
  const lines: string[] = [];

  lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), width));

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    const cursor = i === selectedIndex ? themed('▶', theme.highlight) : ' ';
    const num = themed(`${i + 1}.`, theme.dim);
    const rawLabel = truncateVisual(opt.label, inner - 6);
    const label = i === selectedIndex
      ? themed(rawLabel, theme.highlight)
      : rawLabel;
    const desc = themed(opt.desc, theme.dim);

    const line1 = `${cursor} ${num} ${label}`;
    lines.push(centerAnsi(boxLine(line1, inner, b), width));

    const line2 = `     ${desc}`;
    lines.push(centerAnsi(boxLine(line2, inner, b), width));
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
