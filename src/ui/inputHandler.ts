/**
 * 输入处理模块
 * TUI模式: 使用MenuUI全屏组件; 降级模式: 使用readline
 */

import * as readline from 'readline';
import { execSync } from 'child_process';
import { AIDifficulty, DIFFICULTY_SHORT_NAMES } from '../types/game';
import { LLMAssignment, LLMPreset } from '../types/llm';
import { loadLLMPresets, upsertLLMPreset, deleteLLMPreset } from '../core/llmPresetStore';
import { RunMode, SeatConfig, SeatType, HostConfig, ClientConfig } from '../types/network';
import { getMenuContext } from './menu/menuUI';
import {
  renderTitle, renderSelectionList, renderStatusBar,
  renderTextBox, renderNumberInput, renderYesNo,
  renderInfoBox, renderDescribedList, renderQuickActions
} from './menu/components';
import { getTerminalSize, visualWidth, stripAnsi } from './terminal';
import { KeyEvent } from './engine/input';
import { themed } from './theme';
import { centerAnsi } from './engine/ansi';
import { getAllVariants, resolveConflicts } from '../plugins';

/** 从右往左找第一位非零数的量级，用于智能步进 */
function getSmartStep(val: number): number {
  if (val <= 0) return 1;
  let divisor = 1;
  let t = val;
  while (t % 10 === 0) { t /= 10; divisor *= 10; }
  return divisor;
}

// ============ TUI 核心交互 ============

async function tuiSelect(title: string, options: string[], initial: number = 0): Promise<number | null> {
  const ctx = getMenuContext()!;
  const { screen, input, theme } = ctx;
  let selected = initial;

  const render = () => {
    const size = getTerminalSize();
    const lines: string[] = [];
    lines.push(...renderTitle(title, theme, size.width));
    lines.push(...renderSelectionList(options, selected, theme, size.width));
    lines.push('');
    lines.push(renderStatusBar('↑↓ 导航  数字键  Enter 确认  Esc 返回', theme, size.width));
    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  ctx.setRender(render);
  render();

  let result: number | null = null;
  try {
    while (true) {
      const evt = await input.waitForSelection(options.length);
      if (evt.type === 'arrow') {
        selected = (selected + evt.value + options.length) % options.length;
        // 跳过分隔线
        const opt = options[selected];
        if (opt === '---' || opt === '') {
          selected = (selected + evt.value + options.length) % options.length;
        }
        const opt2 = options[selected];
        if (opt2 === '---' || opt2 === '') {
          selected = (selected + 1) % options.length;
        }
        render();
      } else if (evt.type === 'number') {
        const idx = evt.value - 1;
        if (idx >= 0 && idx < options.length && options[idx] !== '---' && options[idx] !== '') {
          result = idx;
          break;
        }
      } else if (evt.type === 'enter') {
        const opt = options[selected];
        if (opt !== '---' && opt !== '') {
          result = selected;
          break;
        }
      } else if (evt.type === 'escape') {
        result = null;
        break;
      }
    }
  } finally {
    ctx.setRender(null);
  }
  return result;
}

async function tuiDescribedSelect(
  title: string,
  options: { label: string; desc: string }[],
  initial: number = 0
): Promise<number | null> {
  const ctx = getMenuContext()!;
  const { screen, input, theme } = ctx;
  let selected = initial;

  const render = () => {
    const size = getTerminalSize();
    const lines: string[] = [];
    lines.push('');
    lines.push(...renderTitle(title, theme, size.width));
    lines.push(...renderDescribedList(options, selected, theme, size.width));
    lines.push('');
    lines.push(renderStatusBar('↑↓ 导航  数字键  Enter 确认  Esc 返回', theme, size.width));
    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  ctx.setRender(render);
  render();

  let result: number | null = null;
  try {
    while (true) {
      const evt = await input.waitForSelection(options.length);
      if (evt.type === 'arrow') {
        selected = (selected + evt.value + options.length) % options.length;
        render();
      } else if (evt.type === 'number') {
        const idx = evt.value - 1;
        if (idx >= 0 && idx < options.length) { result = idx; break; }
      } else if (evt.type === 'enter') {
        result = selected; break;
      } else if (evt.type === 'escape') {
        result = null; break;
      }
    }
  } finally {
    ctx.setRender(null);
  }
  return result;
}

async function tuiTextInput(prompt: string, defaultValue: string = ''): Promise<string | null> {
  const ctx = getMenuContext()!;
  const { screen, input, theme } = ctx;
  let text = defaultValue;

  const render = () => {
    const size = getTerminalSize();
    const lines: string[] = [];
    lines.push(...renderTextBox(prompt, text, theme, size.width));
    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  ctx.setRender(render);
  render();

  try {
    return await new Promise((resolve) => {
      input.readString(text, 200, (newText: string) => {
        text = newText;
        render();
      }).then((result) => {
        if (result.cancelled) {
          resolve(null);
        } else {
          resolve(result.text || null);
        }
      });
    });
  } finally {
    ctx.setRender(null);
  }
}

async function tuiNumberInput(
  prompt: string,
  min: number,
  max: number,
  defaultValue?: number
): Promise<number | null> {
  const ctx = getMenuContext()!;
  const { screen, input, theme } = ctx;
  let text = String(defaultValue !== undefined ? defaultValue : min);

  const render = () => {
    const size = getTerminalSize();
    const lines: string[] = [];
    lines.push(...renderNumberInput(prompt, text, min, max, theme, size.width));
    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    // 清空残留行
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  ctx.setRender(render);
  render();

  return new Promise((resolve) => {
    const handler = (key: import('./engine/input').KeyEvent) => {
      if (key.name === 'return' || key.name === 'enter') {
        const num = parseInt(text, 10);
        if (!isNaN(num) && num >= min && num <= max) {
          cleanup();
          resolve(num);
        }
        // 无效输入则忽略，保持当前值
      } else if (key.name === 'escape') {
        cleanup();
        resolve(null);
      } else if (key.name === 'up') {
        let val = parseInt(text, 10) || 0;
        const step = getSmartStep(val);
        val = Math.min(max, val + step);
        text = String(val);
        render();
      } else if (key.name === 'down') {
        let val = parseInt(text, 10) || 0;
        let step = getSmartStep(val);
        if (val - step <= 0) step = Math.max(1, step / 10);
        val = Math.max(min, val - step);
        text = String(val);
        render();
      } else if (key.name === 'backspace') {
        if (text.length > 0) {
          text = text.slice(0, -1);
          render();
        }
      } else if (key.name === 'ctrl+v' || (key.ctrl && key.name === 'v')) {
        // Ctrl+V 粘贴 — 只取数字
        try {
          const clip = execSync(
            process.platform === 'win32'
              ? 'powershell -command "Get-Clipboard"'
              : (process.platform === 'darwin' ? 'pbpaste' : 'xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null'),
            { encoding: 'utf8', timeout: 3000, shell: process.platform !== 'win32' ? '/bin/bash' : undefined }
          ).trim();
          const digits = clip.replace(/[^0-9]/g, '');
          const available = 10 - text.length;
          if (available > 0 && digits.length > 0) {
            text += digits.slice(0, available);
            render();
          }
        } catch { /* 剪切板读取失败，忽略 */ }
      } else if (key.name.length === 1) {
        const ch = key.name.charCodeAt(0);
        if (ch >= 0x30 && ch <= 0x39 && text.length < 10) {
          text += key.name;
          render();
        }
      } else if (key.name.length > 1 && !key.ctrl && !key.meta) {
        // Shift+Insert 批量粘贴 — 只取数字
        const digits = key.name.replace(/[^0-9]/g, '');
        const available = 10 - text.length;
        if (available > 0 && digits.length > 0) {
          text += digits.slice(0, available);
          render();
        }
      }
    };

    const cleanup = () => {
      input.removeCallback(handler);
      ctx.setRender(null);
    };

    input.onKey(handler);
  });
}

async function tuiYesNo(prompt: string, defaultValue: boolean): Promise<boolean | null> {
  const ctx = getMenuContext()!;
  const { screen, input, theme } = ctx;
  let selectedYes = defaultValue;

  const render = () => {
    const size = getTerminalSize();
    const lines: string[] = [];
    lines.push(...renderYesNo(prompt, selectedYes, theme, size.width));
    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  ctx.setRender(render);
  render();

  let result: boolean | null = null;
  try {
    while (true) {
      const evt = await input.waitForSelection(0);
      if (evt.type === 'arrow') {
        if (evt.value === -1 || evt.value === 1) selectedYes = !selectedYes;
        render();
      } else if (evt.type === 'enter') {
        result = selectedYes; break;
      } else if (evt.type === 'escape') {
        result = null; break;
      }
    }
  } finally {
    ctx.setRender(null);
  }
  return result;
}

function tuiShowMessage(msg: string): void {
  const ctx = getMenuContext();
  if (!ctx) return;
  const { screen, theme } = ctx;
  const size = getTerminalSize();
  const line = renderStatusBar(msg, theme, size.width);
  // 找空行显示消息
  screen.setLine(size.height - 1, line);
  screen.render();
}

function tuiClear(): void {
  const ctx = getMenuContext();
  if (!ctx) return;
  ctx.screen.reset();
}

// ============ Readline 降级辅助 ============

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function rlInput(question: string): Promise<string> {
  const rl = createInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function rlNumberInput(question: string, min: number, max: number, defaultValue?: number): Promise<number> {
  while (true) {
    const defaultHint = defaultValue !== undefined ? ` (默认: ${defaultValue})` : '';
    const input = await rlInput(question + defaultHint);
    if (input === '' && defaultValue !== undefined) return defaultValue;
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= min && num <= max) return num;
    console.log(`输入无效。请输入 ${min} 到 ${max} 之间的数字。`);
  }
}

async function rlRequiredInput(question: string, defaultValue?: string): Promise<string> {
  while (true) {
    const prompt = defaultValue ? `${question.replace(/: $/, '')} (${defaultValue}): ` : question;
    const input = await rlInput(prompt);
    const value = input.trim() || defaultValue;
    if (value && value.length > 0) return value;
    console.log('输入不能为空。');
  }
}

async function rlYesNo(question: string, defaultValue: boolean): Promise<boolean> {
  while (true) {
    const input = (await rlInput(question)).toLowerCase();
    if (input === '') return defaultValue;
    if (input === 'y' || input === 'yes') return true;
    if (input === 'n' || input === 'no') return false;
    console.log('请输入 y 或 n。');
  }
}

function isTUI(): boolean {
  return getMenuContext() !== null;
}

// ============ 公开API ============

export async function getInput(question: string): Promise<string> {
  if (isTUI()) {
    const result = await tuiTextInput(question, '');
    return result ?? '';
  }
  return rlInput(question);
}

export async function getNumberInput(question: string, min: number, max: number, defaultValue?: number): Promise<number> {
  if (isTUI()) {
    while (true) {
      const result = await tuiNumberInput(question, min, max, defaultValue);
      if (result !== null) return result;
      // Esc 忽略，继续等待
    }
  }
  return rlNumberInput(question, min, max, defaultValue);
}

export async function getGameConfig(): Promise<{
  numPlayers: number;
  humanPosition: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  llmAssignments: LLMAssignment[];
  aiDifficulties: Map<number, AIDifficulty>;
}> {
  if (isTUI()) {
    const nv = await runNumericWizard([
      { key: 'numPlayers', prompt: '玩家数量', min: 2, max: 8 },
      { key: 'humanPosition', prompt: ctx => `你的座位 (1-${ctx.numPlayers})`, min: 1, max: ctx => ctx.numPlayers },
      { key: 'startingChips', prompt: '初始筹码', min: 100, max: 100000, default: 1000 },
      { key: 'smallBlind', prompt: '小盲注金额', min: 1, max: 10000, default: 10 },
    ]);
    if (!nv) throw new Error('配置取消');

    const bigBlind = nv.smallBlind * 2;

    const presets = await loadLLMPresets();
    let llmAssignments: LLMAssignment[] = [];
    let aiDifficulties = new Map<number, AIDifficulty>();
    while (true) {
      const opp = await tuiConfigureOpponents(nv.numPlayers, nv.humanPosition - 1, presets);
      if (opp) { llmAssignments = opp.llmAssignments; aiDifficulties = opp.aiDifficulties; break; }
      // ESC → back to smallBlind, 再ESC → 彻底取消
      const sb = await tuiWizardNumber('小盲注金额', 1, 10000, nv.smallBlind);
      if (sb === null) throw new Error('配置取消');
    }

    return {
      numPlayers: nv.numPlayers,
      humanPosition: nv.humanPosition - 1,
      startingChips: nv.startingChips,
      smallBlind: nv.smallBlind,
      bigBlind,
      llmAssignments,
      aiDifficulties
    };
  }

  // Fallback
  console.log('\n=== 本地游戏配置 ===\n');
  const presets = await loadLLMPresets();
  const numPlayers = await rlNumberInput('输入玩家数量 (2-8): ', 2, 8);
  const humanPosition = await rlNumberInput(`输入你的座位位置 (1-${numPlayers}): `, 1, numPlayers);
  console.log('\n--- 筹码与盲注设置 ---');
  const startingChips = await rlNumberInput('输入初始筹码数 (100-100000, 默认: 1000): ', 100, 100000, 1000);
  const smallBlind = await rlNumberInput('输入小盲注金额 (1-10000, 默认: 10): ', 1, 10000, 10);
  const bigBlind = smallBlind * 2;
  const { llmAssignments, aiDifficulties } = await rlConfigureOpponents(numPlayers, humanPosition - 1, presets);
  return { numPlayers, humanPosition: humanPosition - 1, startingChips, smallBlind, bigBlind, llmAssignments, aiDifficulties };
}

export async function selectRunMode(): Promise<RunMode | null> {
  if (isTUI()) {
    const OPTIONS = ['本地游戏', '创建联机房间 (主机)', '加入联机房间 (客户端)', '---', '管理 LLM API 预设', '退出'];
    // LLM预设管理可能递归调用 selectRunMode
    while (true) {
      const idx = await tuiSelect('德州扑克', OPTIONS, 0);
      if (idx === null) return null; // Esc → 退出
      switch (idx) {
        case 0: return RunMode.Local;
        case 1: return RunMode.Host;
        case 2: return RunMode.Client;
        case 4:
          await configureLLMPresets();
          // 返回后重新显示主菜单
          tuiClear();
          break;
        case 5: return null;
        default: break;
      }
    }
  }

  // Fallback
  console.log('\n————====+ 德州扑克 +====————\n');
  console.log('  1. 本地游戏');
  console.log('  2. 创建联机房间 (主机)');
  console.log('  3. 加入联机房间 (客户端)');
  console.log('  8. 管理 LLM API 预设');
  console.log('  0. 退出');
  const choice = await rlNumberInput('输入指令: ', 0, 8);
  switch (choice) {
    case 0: return null;
    case 1: return RunMode.Local;
    case 2: return RunMode.Host;
    case 3: return RunMode.Client;
    case 8:
      await configureLLMPresets();
      return selectRunMode();
    default: return RunMode.Local;
  }
}

export async function configureHost(): Promise<HostConfig> {
  if (isTUI()) {
    const nv = await runNumericWizard([
      { key: 'numPlayers', prompt: '玩家数量', min: 2, max: 8 },
      { key: 'hostSeatIndex', prompt: ctx => `你的座位 (1-${ctx.numPlayers})`, min: 1, max: ctx => ctx.numPlayers },
      { key: 'port', prompt: '监听端口', min: 1024, max: 65535, default: 15637 },
      { key: 'startingChips', prompt: '初始筹码', min: 100, max: 100000, default: 1000 },
      { key: 'smallBlind', prompt: '小盲注金额', min: 1, max: 10000, default: 10 },
    ]);
    if (!nv) throw new Error('配置取消');

    const bigBlind = nv.smallBlind * 2;

    const presets = await loadLLMPresets();
    const seats: SeatConfig[] = [];
    let seatConfigOk = false;
    while (!seatConfigOk) {
      seats.length = 0;
      seatConfigOk = true;
      for (let i = 0; i < nv.numPlayers; i++) {
        if (i === nv.hostSeatIndex - 1) {
          seats.push({ index: i, type: SeatType.Host, name: 'Host', isOccupied: true });
        } else {
          const seat = await tuiConfigureSeat(i, presets);
          if (!seat) { seatConfigOk = false; break; }
          seats.push(seat);
        }
      }
      if (!seatConfigOk) {
        // ESC in seat config → back to smallBlind, 再ESC → 取消
        const sb = await tuiWizardNumber('小盲注金额', 1, 10000, nv.smallBlind);
        if (sb === null) throw new Error('配置取消');
      }
    }

    return {
      numPlayers: nv.numPlayers,
      hostSeatIndex: nv.hostSeatIndex - 1,
      port: nv.port,
      seats,
      startingChips: nv.startingChips,
      smallBlind: nv.smallBlind,
      bigBlind
    };
  }

  // Fallback
  console.log('\n--- 创建联机房间 ---\n');
  const presets = await loadLLMPresets();
  const numPlayers = await rlNumberInput('输入玩家数量 (2-8): ', 2, 8);
  const hostSeatIndex = await rlNumberInput(`选择你的座位 (1-${numPlayers}): `, 1, numPlayers) - 1;
  const port = await rlNumberInput('输入监听端口 (1024-65535): ', 1024, 65535, 15637);
  console.log('\n--- 筹码与盲注设置 ---');
  const startingChips = await rlNumberInput('输入初始筹码数 (100-100000, 默认: 1000): ', 100, 100000, 1000);
  const smallBlind = await rlNumberInput('输入小盲注金额 (1-10000, 默认: 10): ', 1, 10000, 10);
  const bigBlind = smallBlind * 2;
  const seats: SeatConfig[] = [];
  for (let i = 0; i < numPlayers; i++) {
    if (i === hostSeatIndex) {
      seats.push({ index: i, type: SeatType.Host, name: 'Host', isOccupied: true });
    } else {
      seats.push(await rlConfigureSeat(i, presets));
    }
  }
  return { numPlayers, hostSeatIndex, port, seats, startingChips, smallBlind, bigBlind };
}

export async function configureClient(): Promise<ClientConfig & { seatIndex: number; playerName: string }> {
  if (isTUI()) {
    const rawHost = await tuiTextInput('主机地址 (IP或域名, 可含端口如 host:15637)', '');
    if (!rawHost) throw new Error('配置取消');

    let host = rawHost.trim();
    let port = 0;

    // 解析 host:port 格式
    const portMatch = host.match(/^(.+?):(\d{1,5})$/);
    if (portMatch) {
      host = portMatch[1];
      const parsedPort = parseInt(portMatch[2], 10);
      if (parsedPort >= 1 && parsedPort <= 65535) {
        port = parsedPort;
      } else {
        tuiShowMessage('端口范围 1-65535，请重新输入');
        await new Promise(r => setTimeout(r, 2000));
        return configureClient(); // 递归重试
      }
    }

    // 验证 host 格式（纯IP 或 域名）
    if (!port) {
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
      if (!ipRegex.test(host) && !domainRegex.test(host) && host !== 'localhost') {
        tuiShowMessage('无效的地址格式，请输入有效IP或域名');
        await new Promise(r => setTimeout(r, 2000));
        return configureClient();
      }

      const portNum = await tuiWizardNumber('主机端口', 1, 65535, undefined);
      if (portNum === null) throw new Error('配置取消');
      port = portNum;
    }

    return { host, port, seatIndex: -1, playerName: '' };
  }

  // Fallback
  console.log('\n--- 加入联机房间 ---\n');
  let host = await rlRequiredInput('输入主机 IP 地址或域名 (可含端口如 host:15637): ');
  let port = 0;

  const portMatch = host.match(/^(.+?):(\d{1,5})$/);
  if (portMatch) {
    host = portMatch[1];
    const parsedPort = parseInt(portMatch[2], 10);
    if (parsedPort >= 1 && parsedPort <= 65535) {
      port = parsedPort;
    }
  }

  if (!port) {
    port = await rlNumberInput('输入主机端口: ', 1, 65535);
  }

  return { host, port, seatIndex: -1, playerName: '' };
}

export async function selectSeatAndName(availableSeats: SeatConfig[]): Promise<{ seatIndex: number; playerName: string }> {
  if (isTUI()) {
    const options = availableSeats.map(s => `${s.index + 1}号位 - ${s.name}`);
    const idx = await tuiSelect('选择座位', options, 0);
    if (idx === null) throw new Error('选择取消');
    const seat = availableSeats[idx];
    const name = await tuiTextInput('输入你的名称', seat.name);
    if (!name) throw new Error('输入取消');
    return { seatIndex: seat.index, playerName: name };
  }

  // Fallback
  console.log('\n可用座位:');
  availableSeats.forEach((seat, idx) => {
    console.log(`  ${idx + 1}. ${seat.index + 1}号位 - ${seat.name}`);
  });
  const choice = await rlNumberInput('选择座位: ', 1, availableSeats.length);
  const seat = availableSeats[choice - 1];
  const playerName = await rlRequiredInput(`输入你的名称 (默认: ${seat.name}): `, seat.name);
  return { seatIndex: seat.index, playerName };
}

export async function waitForEnter(message: string = '按 Enter 键继续...'): Promise<void> {
  if (isTUI()) {
    const ctx = getMenuContext()!;
    const { screen, input, theme } = ctx;
    const size = getTerminalSize();
    screen.setLine(size.height - 1, renderStatusBar(message, theme, size.width));
    screen.render();
    await input.waitForEnter();
    return;
  }
  await rlInput(message);
}

// ============ 向导: 支持返回上一步 ============

type StepCtx = Record<string, any>;

interface NumericField {
  key: string;
  prompt: string | ((ctx: StepCtx) => string);
  min: number | ((ctx: StepCtx) => number);
  max: number | ((ctx: StepCtx) => number);
  default?: number | ((ctx: StepCtx) => number);
}

/** 将一组数字输入包装成可返回上一步的向导 */
async function runNumericWizard(fields: NumericField[]): Promise<StepCtx | null> {
  const ctx: StepCtx = {};
  let i = 0;
  while (i >= 0 && i < fields.length) {
    const f = fields[i];
    const prompt = typeof f.prompt === 'function' ? f.prompt(ctx) : f.prompt;
    const min = typeof f.min === 'function' ? f.min(ctx) : f.min;
    const max = typeof f.max === 'function' ? f.max(ctx) : f.max;
    const def = typeof f.default === 'function' ? f.default(ctx) : f.default;
    const r = await tuiNumberInput(prompt, min, max, def);
    if (r === null) {
      if (i > 0) { i--; continue; }
      return null; // full cancel
    }
    ctx[f.key] = r;
    i++;
  }
  return ctx;
}

// ============ 内部: TUI 向导辅助 ============

async function tuiWizardNumber(prompt: string, min: number, max: number, defaultValue?: number): Promise<number | null> {
  return tuiNumberInput(prompt, min, max, defaultValue);
}

async function tuiWizardText(prompt: string, defaultValue?: string): Promise<string | null> {
  return tuiTextInput(prompt, defaultValue ?? '');
}

// ============ 内部: 对手配置 (TUI) ============

async function tuiConfigureOpponents(
  numPlayers: number,
  humanPosition: number,
  presets: LLMPreset[]
): Promise<{ llmAssignments: LLMAssignment[]; aiDifficulties: Map<number, AIDifficulty> }> {
  const llmAssignments: LLMAssignment[] = [];
  const aiDifficulties = new Map<number, AIDifficulty>();

  for (let i = 0; i < numPlayers; i++) {
    if (i === humanPosition) continue;

    const seatName = `座位 ${i + 1}`;

    // 构建选项: 0=AI, 1..N=LLM预设
    const options: string[] = ['普通 AI (选择难度)'];
    for (const p of presets) {
      options.push(`LLM: ${p.name} (${p.model})`);
    }

    if (options.length === 1) {
      // 无LLM预设 → 直接选难度
      const diff = await tuiSelectDifficulty();
      if (diff !== null) aiDifficulties.set(i, diff);
      else aiDifficulties.set(i, AIDifficulty.Medium);
    } else {
      const choice = await tuiSelect(seatName, options, 0);
      if (choice === null || choice === 0) {
        // AI with difficulty
        const diff = await tuiSelectDifficulty();
        if (diff !== null) aiDifficulties.set(i, diff);
        else aiDifficulties.set(i, AIDifficulty.Medium);
      } else if (choice > 0) {
        // LLM preset
        llmAssignments.push({ playerIndex: i, presetName: presets[choice - 1].name });
      }
    }
  }

  return { llmAssignments, aiDifficulties };
}

/** 逐字着色: 返回单个字符的ANSI颜色码 */
function getCharColor(diffIdx: number, charIdx: number, frame: number): string {
  switch (diffIdx) {
    case 0: return '\x1b[32m';  // 初级 — 绿色
    case 1: return '\x1b[33m';  // 中级 — 黄色
    case 2: return '\x1b[31m';  // 高级 — 红色
    case 3: { // 超级 — 红色底, 亮粉逐字波浪
      const len = 5;
      const wave = frame % len;
      return charIdx === wave ? '\x1b[38;5;201m' : '\x1b[31m';
    }
    case 4: { // 极限 — 逐字彩虹流动
      const rainbow = ['\x1b[31m', '\x1b[33m', '\x1b[32m', '\x1b[36m', '\x1b[34m', '\x1b[35m'];
      return rainbow[(charIdx + frame) % rainbow.length];
    }
    default: return '\x1b[37m';
  }
}

/** 构建带逐字颜色的标签: "Low (初级)" → 英文有色 + 中文淡灰 */
function colorizeLabel(eng: string, chn: string, diffIdx: number, frame: number): string {
  const R = '\x1b[0m';
  const DIM = '\x1b[2m';
  let out = '';
  for (let i = 0; i < eng.length; i++) {
    out += getCharColor(diffIdx, i, frame) + eng[i];
  }
  out += R + ' ' + DIM + chn + R;
  return out;
}

async function tuiSelectDifficulty(): Promise<AIDifficulty | null> {
  const ctx = getMenuContext()!;
  const { screen, input, theme } = ctx;
  const engNames = ['Zhua', 'Medium', 'High', 'Ultra', 'Max'];
  const chnNames = ['(初级)', '(中级)', '(高级)', '(超级)', '(极限)'];
  const descs = [
    'zhua',
    '基础模型',
    '数学正确模型，初具人形',
    '接近纳什均衡',
    '快跑，不是对手',
  ];
  let selected = 1; // default Medium
  let frame = 0;
  let animTimer: ReturnType<typeof setInterval> | null = null;

  const render = () => {
    const size = getTerminalSize();
    const coloredOptions = engNames.map((eng, i) => ({
      label: colorizeLabel(eng, chnNames[i], i, frame),
      desc: descs[i],
    }));

    const lines: string[] = [];
    lines.push('');
    lines.push(...renderTitle('AI 难度', theme, size.width));
    lines.push(...renderDescribedList(coloredOptions, selected, theme, size.width));
    lines.push('');
    lines.push(renderStatusBar('↑↓ 导航  数字键  Enter 确认  Esc 返回', theme, size.width));
    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  animTimer = setInterval(() => {
    frame++;
    render();
  }, 300);

  ctx.setRender(render);
  render();

  let result: number | null = null;
  try {
    while (true) {
      const evt = await input.waitForSelection(engNames.length);
      if (evt.type === 'arrow') {
        selected = (selected + evt.value + engNames.length) % engNames.length;
        render();
      } else if (evt.type === 'number') {
        const idx = evt.value - 1;
        if (idx >= 0 && idx < engNames.length) { result = idx; break; }
      } else if (evt.type === 'enter') {
        result = selected; break;
      } else if (evt.type === 'escape') {
        result = null; break;
      }
    }
  } finally {
    if (animTimer) clearInterval(animTimer);
    ctx.setRender(null);
  }

  if (result === null) return null;
  const difficulties = [AIDifficulty.Low, AIDifficulty.Medium, AIDifficulty.High, AIDifficulty.Ultra, AIDifficulty.Max];
  return difficulties[result];
}

async function tuiConfigureSeat(seatIndex: number, presets: LLMPreset[]): Promise<SeatConfig | null> {
  const baseOptions = ['AI 玩家', '预留 (远程玩家)'];
  const hasPresets = presets.length > 0;
  // 有预设时在AI和远程之间插入LLM选项
  const options = hasPresets
    ? ['AI 玩家', 'LLM 玩家', '预留 (远程玩家)']
    : baseOptions;

  const choice = await tuiSelect(`座位 ${seatIndex + 1} 类型`, options, 0);
  if (choice === null) return null;

  // 没有预设时，choice 1 是"预留"
  const mappedChoice = hasPresets ? choice : (choice === 1 ? 2 : choice);

  switch (mappedChoice) {
    case 0: {
      const diff = await tuiSelectDifficulty();
      return {
        index: seatIndex,
        type: SeatType.AI,
        name: `AI-${DIFFICULTY_SHORT_NAMES[diff ?? AIDifficulty.Medium]}-${seatIndex + 1}`,
        isOccupied: true,
        aiDifficulty: diff ?? AIDifficulty.Medium
      };
    }
    case 1: {
      // LLM 玩家 — 选择预设模板
      const presetOptions = presets.map(p => `${p.name} (${p.model})`);
      const presetIdx = await tuiSelect('选择 LLM 预设', presetOptions, 0);
      if (presetIdx === null) return null; // 取消
      const selectedPreset = presets[presetIdx];
      const name = await tuiWizardText('LLM 玩家名称', `${selectedPreset.name} ${seatIndex + 1}`);
      if (!name) return null;
      return {
        index: seatIndex,
        type: SeatType.LLM,
        name,
        isOccupied: true,
        llmPresetName: selectedPreset.name
      };
    }
    case 2: {
      const name = await tuiWizardText('预留座位名称', `Player${seatIndex + 1}`);
      if (!name) return null;
      return { index: seatIndex, type: SeatType.Remote, name, isOccupied: false };
    }
    default:
      return null;
  }
}

// ============ 内部: 对手配置 (Fallback) ============

async function rlConfigureOpponents(
  numPlayers: number,
  humanPosition: number,
  presets: LLMPreset[]
): Promise<{ llmAssignments: LLMAssignment[]; aiDifficulties: Map<number, AIDifficulty> }> {
  const llmAssignments: LLMAssignment[] = [];
  const aiDifficulties = new Map<number, AIDifficulty>();

  for (let i = 0; i < numPlayers; i++) {
    if (i === humanPosition) continue;

    console.log(`\n座位 ${i + 1}:`);

    if (presets.length > 0) {
      console.log('  0. 普通 AI (选择难度)');
      presets.forEach((preset, index) => {
        console.log(`  ${index + 1}. LLM: ${preset.name} (${preset.model})`);
      });
      const choice = await rlNumberInput('选择控制方式: ', 0, presets.length);
      if (choice > 0) {
        llmAssignments.push({ playerIndex: i, presetName: presets[choice - 1].name });
        continue;
      }
    }

    const difficulty = await rlSelectDifficulty();
    aiDifficulties.set(i, difficulty);
  }

  return { llmAssignments, aiDifficulties };
}

async function rlSelectDifficulty(): Promise<AIDifficulty> {
  console.log('  选择 AI 难度:');
  console.log('    1. Low (初级) — 被动保守，易击败');
  console.log('    2. Medium (中级) — 基础扎实，偶有诈唬');
  console.log('    3. High (高级) — 数学正确，权益驱动');
  console.log('    4. Ultra (超级) — GTO平衡，对手建模');
  console.log('    5. Max (极限) — 全技术融合，最强挑战');
  const choice = await rlNumberInput('  选择难度 (1-5, 默认: 2): ', 1, 5, 2);
  const difficulties = [AIDifficulty.Low, AIDifficulty.Medium, AIDifficulty.High, AIDifficulty.Ultra, AIDifficulty.Max];
  return difficulties[choice - 1];
}

async function rlConfigureSeat(seatIndex: number, presets: LLMPreset[]): Promise<SeatConfig> {
  console.log(`\n配置 ${seatIndex + 1} 号位:`);
  const options = ['1. AI 玩家'];
  if (presets.length > 0) {
    options.push('2. LLM 玩家');
    options.push('3. 预留 (远程玩家)');
  } else {
    options.push('2. 预留 (远程玩家)');
  }
  options.forEach(o => console.log(`  ${o}`));

  const maxOpt = presets.length > 0 ? 3 : 2;
  const choice = await rlNumberInput('选择类型: ', 1, maxOpt);

  // 没有预设时，choice 2 是预留
  const adjustedChoice = presets.length > 0 ? choice : (choice === 2 ? 3 : choice);

  switch (adjustedChoice) {
    case 1: {
      const difficulty = await rlSelectDifficulty();
      return { index: seatIndex, type: SeatType.AI, name: `AI-${DIFFICULTY_SHORT_NAMES[difficulty]}-${seatIndex + 1}`, isOccupied: true, aiDifficulty: difficulty };
    }
    case 2: {
      // LLM 玩家 — 选择预设
      console.log(`\n  可用 LLM 预设:`);
      presets.forEach((p, i) => console.log(`    ${i + 1}. ${p.name} (${p.model})`));
      const presetIdx = await rlNumberInput(`  选择预设 (1-${presets.length}): `, 1, presets.length) - 1;
      const preset = presets[presetIdx];
      const name = await rlRequiredInput(`输入 LLM 玩家名称 (默认: ${preset.name} ${seatIndex + 1}): `, `${preset.name} ${seatIndex + 1}`);
      return { index: seatIndex, type: SeatType.LLM, name, isOccupied: true, llmPresetName: preset.name };
    }
    case 3: {
      const name = await rlRequiredInput(`输入预留座位名称 (默认: Player${seatIndex + 1}): `, `Player${seatIndex + 1}`);
      return { index: seatIndex, type: SeatType.Remote, name, isOccupied: false };
    }
    default:
      return { index: seatIndex, type: SeatType.AI, name: `AI-Medium-${seatIndex + 1}`, isOccupied: true };
  }
}

// ============ LLM 预设管理 ============

async function configureLLMPresets(): Promise<LLMPreset[]> {
  let presets = await loadLLMPresets();

  if (isTUI()) {
    while (true) {
      const presetNames = presets.map((p, i) => `[${i + 1}] ${p.name} - ${p.baseUrl}`);
      const options = presetNames.length > 0 ? presetNames : ['(无预设)'];
      const actions = ['新增预设', '覆盖预设', '删除预设', '返回'];

      const allOptions = [...options, '---', ...actions];
      const idx = await tuiSelect('LLM API 预设管理', allOptions, allOptions.length - 1);

      if (idx === null) return presets;

      if (idx >= 0 && idx < options.length && presets.length > 0) {
        // 选中预设仅展示信息，不做操作
        // 等待用户选择操作
        continue;
      }

      if (idx === options.length + 1) {
        // 新增
        const preset = await tuiLLMPresetInput(presets, false);
        if (preset) {
          presets = await upsertLLMPreset(preset);
          tuiShowMessage(`已新增预设: ${preset.name}`);
        }
      } else if (idx === options.length + 2) {
        // 覆盖
        if (presets.length === 0) {
          tuiShowMessage('没有可覆盖的预设');
          continue;
        }
        const presetIdx = await tuiSelect('选择要覆盖的预设', presetNames, 0);
        if (presetIdx !== null) {
          const preset = await tuiLLMPresetInput(presets, true, presets[presetIdx]);
          if (preset) {
            presets = await upsertLLMPreset(preset);
            tuiShowMessage(`已覆盖预设: ${preset.name}`);
          }
        }
      } else if (idx === options.length + 3) {
        // 删除
        if (presets.length === 0) {
          tuiShowMessage('没有可删除的预设');
          continue;
        }
        const presetIdx = await tuiSelect('选择要删除的预设', presetNames, 0);
        if (presetIdx !== null) {
          const confirmed = await tuiYesNo(`确认删除 "${presets[presetIdx].name}"?`, false);
          if (confirmed) {
            presets = await deleteLLMPreset(presets[presetIdx].name);
            tuiShowMessage(`已删除预设: ${presets[presetIdx]?.name ?? ''}`);
          }
        }
      } else if (idx === options.length + 4) {
        // 返回
        return presets;
      }
    }
  }

  // Fallback
  return rlConfigureLLMPresets(presets);
}

async function tuiLLMPresetInput(
  existingPresets: LLMPreset[],
  isUpdate: boolean,
  existingPreset?: LLMPreset
): Promise<LLMPreset | null> {
  const name = await tuiWizardText('预设名称', existingPreset?.name ?? '');
  if (!name) return null;

  const baseUrl = await tuiWizardText(
    'API Base URL (如 https://api.openai.com/v1)',
    existingPreset?.baseUrl ?? ''
  );
  if (!baseUrl) return null;

  const apiKey = await tuiWizardText('API Key', existingPreset?.apiKey ?? '');
  if (!apiKey) return null;

  const model = await tuiWizardText('模型名称 (如 gpt-4o-mini)', existingPreset?.model ?? '');
  if (!model) return null;

  const tempStr = await tuiWizardText(
    'temperature (0.95-1, 留空默认1)',
    existingPreset?.temperature !== undefined ? String(existingPreset.temperature) : ''
  );
  const temperature = tempStr ? parseFloat(tempStr) : undefined;

  const useCustomPrompt = await tuiYesNo('设定自定义提示词?', false);
  let customPrompt: string | undefined = existingPreset?.customPrompt;
  if (useCustomPrompt) {
    customPrompt = await tuiWizardText('自定义提示词', existingPreset?.customPrompt ?? '') ?? undefined;
  }

  return { name, baseUrl, apiKey, model, temperature, customPrompt };
}

// ============ LLM 预设管理 (Fallback) ============

async function rlConfigureLLMPresets(presets: LLMPreset[]): Promise<LLMPreset[]> {
  console.log(`已加载 ${presets.length} 个 LLM API 预设。`);
  const shouldManage = await rlYesNo('是否管理 LLM API 预设？(y/N): ', false);
  if (!shouldManage) return presets;

  while (true) {
    renderPresetListConsole(presets);
    console.log('\n  --- 操作 ---');
    console.log('  1. 新增预设');
    console.log('  2. 覆盖预设');
    console.log('  3. 删除预设');
    console.log('  0. 完成');
    const choice = await rlNumberInput('选择操作: ', 0, 3);
    if (choice === 0) return presets;
    if (choice === 1) {
      const preset = await rlLLMPresetInput(presets, false);
      presets = await upsertLLMPreset(preset);
      console.log(`已新增预设: ${preset.name}`);
    } else if (choice === 2) {
      if (presets.length === 0) { console.log('没有可覆盖的预设'); continue; }
      const idx = await rlNumberInput(`选择要覆盖的预设 (1-${presets.length}): `, 1, presets.length);
      const preset = await rlLLMPresetInput(presets, true, presets[idx - 1]);
      presets = await upsertLLMPreset(preset);
      console.log(`已覆盖预设: ${preset.name}`);
    } else if (choice === 3) {
      if (presets.length === 0) { console.log('没有可删除的预设'); continue; }
      const idx = await rlNumberInput(`选择要删除的预设 (1-${presets.length}): `, 1, presets.length);
      const confirmed = await rlYesNo(`确认删除预设 "${presets[idx - 1].name}"? (y/N): `, false);
      if (confirmed) {
        presets = await deleteLLMPreset(presets[idx - 1].name);
        console.log(`已删除预设: ${presets[idx - 1].name}`);
      }
    }
  }
}

function renderPresetListConsole(presets: LLMPreset[]): void {
  console.log('\n当前 LLM API 预设:');
  if (presets.length === 0) { console.log('  [无]'); return; }
  presets.forEach((preset, index) => {
    console.log(`  [#${index + 1}] ${preset.name} - ${preset.model} - ${preset.baseUrl}`);
  });
}

async function rlLLMPresetInput(
  existingPresets: LLMPreset[],
  isUpdate: boolean,
  existingPreset?: LLMPreset
): Promise<LLMPreset> {
  // Preset name logic
  let name: string;
  while (true) {
    const prompt = existingPreset?.name
      ? `预设名称 (${existingPreset.name}): `
      : '预设名称: ';
    const input = await rlInput(prompt);
    name = input.trim() || existingPreset?.name || '';
    if (!name) { console.log('预设名称不能为空。'); continue; }
    const exists = existingPresets.some(p => p.name === name);
    if (isUpdate) {
      if (!exists) { console.log('该预设名称不存在。'); continue; }
    } else {
      if (exists) { console.log('该预设名称已存在。'); continue; }
    }
    break;
  }

  let baseUrl: string;
  while (true) {
    const prompt = existingPreset?.baseUrl
      ? `OpenAI 兼容 API Base URL (${existingPreset.baseUrl}): `
      : 'OpenAI 兼容 API Base URL: ';
    const input = await rlInput(prompt);
    baseUrl = input.trim() || existingPreset?.baseUrl || '';
    if (!baseUrl) { console.log('Base URL 不能为空。'); continue; }
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      console.log('Base URL 必须以 http:// 或 https:// 开头。'); continue;
    }
    try { new URL(baseUrl); } catch { console.log('URL 格式无效。'); continue; }
    break;
  }

  let apiKey: string;
  while (true) {
    const masked = existingPreset?.apiKey
      ? (existingPreset.apiKey.length > 8 ? existingPreset.apiKey.slice(0, 4) + '...' + existingPreset.apiKey.slice(-4) : '***')
      : '';
    const prompt = masked ? `API Key (${masked}): ` : 'API Key: ';
    const input = await rlInput(prompt);
    apiKey = input.trim() || existingPreset?.apiKey || '';
    if (!apiKey) { console.log('API Key 不能为空。'); continue; }
    if (apiKey.length < 8) { console.log('API Key 长度过短。'); continue; }
    break;
  }

  const model = await rlRequiredInput('模型名称: ', existingPreset?.model);

  const tempStr = await rlInput(
    existingPreset?.temperature !== undefined
      ? `temperature (${existingPreset.temperature}): `
      : 'temperature (留空默认1): '
  );
  const temperature = tempStr ? parseFloat(tempStr) : existingPreset?.temperature;

  let customPrompt = existingPreset?.customPrompt;
  const useCustom = await rlYesNo('是否设定自定义提示词？(y/N): ', false);
  if (useCustom) {
    console.log('请输入自定义提示词（多行输入，输入空行结束）：');
    customPrompt = await rlMultilineInput();
  }

  return { name, baseUrl, apiKey, model, temperature, customPrompt };
}

async function rlMultilineInput(): Promise<string> {
  const lines: string[] = [];
  while (true) {
    const line = await rlInput('');
    if (line === '') break;
    lines.push(line);
  }
  return lines.join('\n');
}

// ============ 变体/特殊设置 ============

const BOX_H = '─';
const BOX_V = '│';
const BOX_TL = '┌';
const BOX_TR = '┐';
const BOX_BL = '└';
const BOX_BR = '┘';

/** 转义常量 */
const R = '\x1b[0m';
const DIM = '\x1b[38;5;8m';
const HL = '\x1b[32;1m';
const SUC = '\x1b[32m';
const WARN = '\x1b[33m';

/**
 * 特殊设置页面 — 变体开关列表
 * ↑↓导航 ← →切换Y/N Enter保存 Esc返回
 */
async function tuiSpecialSettings(enabled: Set<number>): Promise<Set<number>> {
  const ctx = getMenuContext()!;
  const { screen, input, theme } = ctx;
  const variants = getAllVariants();
  let selected = 0;
  let enabledSet = new Set(enabled);
  let flashMsg = '';
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  const setFlash = (msg: string) => {
    flashMsg = msg;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashMsg = ''; render(); }, 2000);
    render();
  };

  const render = () => {
    const size = getTerminalSize();
    const boxW = Math.min(size.width - 4, 62);
    const inner = boxW - 2;
    const b = theme.border;
    const lines: string[] = [];

    // Header
    lines.push(...renderTitle('特殊设置', theme, size.width));

    // 剩余行数 = height - 已用行 - 描述框(8) - 状态栏(1) - 2空白
    const used = lines.length;
    const maxVisible = Math.max(2, size.height - used - 11);
    const maxScroll = Math.max(0, variants.length - maxVisible);
    const scrollOff = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), maxScroll));
    const visible = variants.slice(scrollOff, scrollOff + maxVisible);
    const innerContent = inner - 2; // 左右各1空格

    // 变体列表框
    lines.push(centerAnsi(themed(BOX_TL + BOX_H.repeat(inner) + BOX_TR, b), size.width));
    for (let i = 0; i < visible.length; i++) {
      const v = visible[i];
      const idx = scrollOff + i;
      const isSel = idx === selected;
      const isEn = enabledSet.has(v.id);

      const cursor = isSel ? themed('▶', HL) : ' ';
      const idTxt = `#${v.id}.`;
      const nameTxt = v.name;
      const devTxt = v.isDev ? ' [开发中]' : '';

      // Y/N
      const yTxt = isEn ? themed('Y', SUC) : themed('Y', DIM);
      const nTxt = !isEn ? themed('N', WARN) : themed('N', DIM);
      const ynTxt = `[${yTxt}] [${nTxt}]`;

      const leftStr = isSel
        ? ` ${themed('▶', HL)}${themed(idTxt + nameTxt, HL)}${themed(devTxt, DIM)}`
        : `  ${idTxt}${themed(nameTxt, theme.text)}${themed(devTxt, DIM)}`;
      const leftW = visualWidth(stripAnsi(leftStr));
      const ynW = visualWidth(stripAnsi(`[${isEn ? 'Y' : ' '}] [${!isEn ? 'N' : ' '}]`));
      const pad = Math.max(0, innerContent - leftW - ynW);
      const filled = leftStr + ' '.repeat(pad) + ynTxt;
      const padded = ' ' + filled + ' '.repeat(Math.max(0, innerContent - visualWidth(stripAnsi(filled))));
      lines.push(centerAnsi(BOX_V + padded + ' ' + BOX_V, size.width));
    }

    // 滚动指示器 + 底部边框
    if (variants.length > maxVisible) {
      const up = scrollOff > 0 ? '↑' : ' ';
      const dn = scrollOff + maxVisible < variants.length ? '↓' : ' ';
      const dir = ` ${up} ${dn} 还有 ${variants.length} 项 `;
      const dirPad = innerContent - visualWidth(dir);
      const dirLine = ' '.repeat(Math.floor(dirPad / 2)) + dir;
      lines.push(centerAnsi(BOX_V + ' ' + themed(dirLine, DIM) + ' '.repeat(Math.max(0, innerContent - visualWidth(dirLine))) + ' ' + BOX_V, size.width));
    }

    lines.push(centerAnsi(themed(BOX_BL + BOX_H.repeat(inner) + BOX_BR, b), size.width));
    lines.push('');

    // 描述面板
    const cur = variants[selected];
    if (cur) {
      const info: string[] = [];
      info.push(themed(cur.description, theme.text));
      if (cur.tags.includes('#*')) {
        info.push(themed('⚠ 与所有其他变体不兼容', WARN));
      } else if (cur.tags.length > 0) {
        const cnames = cur.tags.map(t => {
          const id = parseInt(t.substring(1), 10);
          const f = variants.find(v => v.id === id);
          return f ? `${t} ${f.name}` : t;
        });
        info.push(themed(`⚠ 不兼容: ${cnames.join(', ')}`, WARN));
      } else {
        const oc = variants.filter(o => o.id !== cur.id && o.tags.includes(`#${cur.id}`));
        if (oc.length > 0) {
          info.push(themed(`被标记不兼容: ${oc.map(v => `#${v.id} ${v.name}`).join(', ')}`, DIM));
        } else {
          info.push(themed('兼容: 无冲突', DIM));
        }
      }
      lines.push(...renderInfoBox(cur.name, info, theme, size.width));
    }
    lines.push('');

    if (flashMsg) lines.push(centerAnsi(themed(flashMsg, WARN), size.width));
    lines.push(renderStatusBar('↑↓ 导航  ← → 切换  Enter 保存  Esc 返回', theme, size.width));

    for (let i = 0; i < lines.length; i++) screen.setLine(i, lines[i]);
    for (let i = lines.length; i < size.height; i++) screen.setLine(i, '');
    screen.render();
  };

  ctx.setRender(render);
  render();

  try {
    await new Promise<void>((resolve) => {
      const handler = (key: KeyEvent) => {
        if (key.name === 'up' || key.name === 'down') {
          selected = (selected + (key.name === 'down' ? 1 : -1) + variants.length) % variants.length;
          render();
        } else if (key.name === 'left' || key.name === 'right') {
          const v = variants[selected];
          const result = resolveConflicts(v.id, !enabledSet.has(v.id), enabledSet);
          enabledSet = result.newEnabled;
          if (result.autoDisabled.length > 0) {
            const names = result.autoDisabled.map(id => variants.find(x => x.id === id)?.name || `#${id}`).join(', ');
            setFlash(`已自动关闭不兼容: ${names}`);
          } else { render(); }
        } else if (key.name === 'return' || key.name === 'enter') {
          input.removeCallback(handler);
          resolve();
        } else if (key.name === 'escape') {
          input.removeCallback(handler);
          resolve();
        }
      };
      input.onKey(handler);
    });
  } finally {
    ctx.setRender(null);
  }
  return enabledSet;
}

// ============ TUI 主机大厅 ============

export interface HostLobbySeat {
  index: number;
  type: string;
  name: string;
  isOccupied: boolean;
  chips: number;
}

export interface LobbyResult {
  start: boolean;
  enabledVariants: number[];
}

export async function tuiHostLobby(
  getSeats: () => HostLobbySeat[],
  onRename: (seatIndex: number, newName: string) => Promise<boolean>,
  onRefresh: () => Promise<void>,
  onChipsChange?: (seatIndex: number, newChips: number) => Promise<boolean>,
  onBlindChange?: (smallBlind: number) => Promise<void>,
  defaultSmallBlind: number = 10,
): Promise<LobbyResult> {
  const ctx = getMenuContext();
  if (!ctx) {
    return rlHostLobby(getSeats(), onRename, onChipsChange);
  }

  const { screen, input, theme } = ctx;

  const render = () => {
    const seats = getSeats();
    const size = getTerminalSize();
    const seatLines = seats.map(s => {
      const status = s.isOccupied ? '已占用' : '空闲';
      return `  ${s.index + 1}号位 [${s.type}] ${s.name} 筹码:${s.chips} (${status})`;
    });

    const lines: string[] = [];
    lines.push('');
    lines.push(...renderTitle('等待玩家连接', theme, size.width));
    lines.push(...renderInfoBox('当前座位状态', seatLines, theme, size.width));
    lines.push('');
    const statusBarParts = ['座位号:改名称/筹码  9.盲注  0.开始'];
    if (enabledVariants.size > 0) {
      statusBarParts.push(themed(` 特殊设置已开启`, theme.warning));
    }
    statusBarParts.push(' Esc退出');
    lines.push(renderStatusBar(statusBarParts.join(''), theme, size.width));

    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  ctx.setRender(render);
  render();

  // 自动刷新定时器 — 只在无sub-dialog覆盖时刷新
  const autoRefresh = setInterval(() => {
    const cur = ctx.getRender();
    if (cur && cur !== render) return; // sub-dialog活跃中，不渲染
    if (!cur) ctx.setRender(render);   // sub-dialog刚结束，恢复
    render();
  }, 1000);

  let result: LobbyResult = { start: false, enabledVariants: [] };
  let enabledVariants = new Set<number>();
  try {
    while (true) {
      const evt = await input.waitForSelection(9);
      if (evt.type === 'number') {
        const num = evt.value;
        const seats = getSeats();
        if (num >= 1 && num <= seats.length) {
          const seat = seats[num - 1];
          // 只禁止修改已连接的远程玩家座位
          if (seat.type === '预留' && seat.isOccupied) {
            tuiShowMessage('该远程座位已有玩家连接，不能修改');
            await new Promise(r => setTimeout(r, 1500));
            render();
          } else {
            // 改名
            const newName = await tuiTextInput(`${num}号位新名称`, seat.name);
            if (newName) {
              await onRename(num - 1, newName);
            }
            // 改筹码
            if (onChipsChange) {
              const newChips = await tuiNumberInput(`${num}号位筹码`, 100, 100000, seat.chips);
              if (newChips !== null && newChips !== seat.chips) {
                await onChipsChange(num - 1, newChips);
              }
            }
            render();
          }
        } else if (num === 9) {
          if (onBlindChange) {
            const sb = await tuiNumberInput('小盲注金额', 1, 10000, defaultSmallBlind);
            if (sb !== null) await onBlindChange(sb);
          }
          render();
        } else if (num === 0) {
          const wantSpec = await tuiYesNo('是否开启特殊设置?', false);
          if (wantSpec) {
            enabledVariants = await tuiSpecialSettings(enabledVariants);
          }
          const confirmStart = await tuiYesNo('确认开始游戏? (不可修改座位配置!)', false);
          if (confirmStart) {
            const doubleConfirm = await tuiYesNo('再次确认开始游戏?', false);
            if (doubleConfirm) {
              result = { start: true, enabledVariants: [...enabledVariants] };
              break;
            }
          }
          render();
        }
      } else if (evt.type === 'escape') {
        break;
      }
    }
  } finally {
    clearInterval(autoRefresh);
    ctx.setRender(null);
  }
  return result;
}

async function rlHostLobby(
  seats: HostLobbySeat[],
  onRename: (seatIndex: number, newName: string) => Promise<boolean>,
  onChipsChange?: (seatIndex: number, newChips: number) => Promise<boolean>,
): Promise<LobbyResult> {
  let enabledVariants = new Set<number>();
  while (true) {
    console.log('\n  当前座位状态:');
    for (const seat of seats) {
      const status = seat.isOccupied ? '已占用' : '空闲';
      console.log(`    ${seat.index + 1}号位 [${seat.type}] ${seat.name} 筹码:${seat.chips} (${status})`);
    }
    console.log();
    console.log('  可用指令:');
    console.log('    1-8. 修改对应座位(名称+筹码)');
    console.log('    9.   刷新座位状态');
    console.log('    0.   开始游戏 (需要输入两次 0 确认)');
    console.log();

    const choice = await rlNumberInput('输入指令 (0-9): ', 0, 9);

    if (choice >= 1 && choice <= 8) {
      const seat = seats[choice - 1];
      if (seat) {
        if (seat.type === '预留' && seat.isOccupied) {
          console.log('  该远程座位已有玩家连接，不能修改');
        } else {
          const newName = await rlInput(`输入 ${choice} 号位新名称 (当前: ${seat.name}): `);
          if (newName.trim()) {
            await onRename(choice - 1, newName.trim());
            seats[choice - 1].name = newName.trim();
          }
          if (onChipsChange) {
            const newChips = await rlNumberInput(`输入 ${choice} 号位筹码 (当前: ${seat.chips}): `, 100, 100000);
            await onChipsChange(choice - 1, newChips);
            seats[choice - 1].chips = newChips;
          }
        }
      }
    } else if (choice === 9) {
      console.log('  刷新中...');
    } else if (choice === 0) {
      console.log('\n  是否开启特殊设置?');
      const wantSpec = await rlYesNo('开启特殊设置? (y/N): ', false);
      if (wantSpec) {
        // readline fallback: show variant list simply
        const variants = getAllVariants();
        console.log('\n  可用特殊设置:');
        for (const v of variants) {
          const status = enabledVariants.has(v.id) ? 'Y' : 'N';
          const dev = v.isDev ? ' [开发中]' : '';
          console.log(`    #${v.id}. ${v.name} [${status}]${dev} — ${v.description}`);
        }
        while (true) {
          const toggleId = await rlNumberInput('输入变体编号切换开关 (输入-1结束): ', -1, variants.length - 1);
          if (toggleId === -1) break;
          const v = variants.find(x => x.id === toggleId);
          if (!v) continue;
          const result = resolveConflicts(v.id, !enabledVariants.has(v.id), enabledVariants);
          enabledVariants = result.newEnabled;
          if (result.autoDisabled.length > 0) {
            const names = result.autoDisabled.map(id => variants.find(x => x.id === id)?.name || `#${id}`).join(', ');
            console.log(`  自动关闭不兼容: ${names}`);
          }
          console.log(`  当前: ${[...enabledVariants].map(id => variants.find(v => v.id === id)?.name).join(', ') || '无'}`);
        }
      }
      console.log('\n  警告: 游戏开始后不能再修改座位配置！');
      const confirm = await rlNumberInput('再次输入 0 确认开始游戏，或其他数字取消: ', 0, 9);
      if (confirm === 0) {
        return { start: true, enabledVariants: [...enabledVariants] };
      }
      console.log('  取消开始游戏，继续等待...');
    }
  }
}

// ============ 本地模式大厅 ============

export interface LocalLobbyConfig {
  seats: { index: number; type: string; name: string; chips: number }[];
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  enabledVariants?: number[];
}

export async function tuiLocalLobby(config: LocalLobbyConfig): Promise<LocalLobbyConfig | null> {
  const ctx = getMenuContext();
  if (!ctx) return config; // fallback: 直接返回

  const { screen, input, theme } = ctx;

  let seats = config.seats.map(s => ({ ...s }));
  let enabledVariants = new Set(config.enabledVariants || []);

  const render = () => {
    const size = getTerminalSize();
    const seatLines = seats.map(s => {
      return `  ${s.index + 1}号位 [${s.type}] ${s.name}  筹码:${s.chips}`;
    });
    const info = [`小盲:${config.smallBlind}  大盲:${config.bigBlind}`];

    const lines: string[] = [];
    lines.push('');
    lines.push(...renderTitle('对局设置', theme, size.width));
    lines.push(...renderInfoBox('座位列表', seatLines, theme, size.width));
    lines.push(...renderInfoBox('盲注', info, theme, size.width));
    lines.push('');
    lines.push(renderStatusBar('座位号:改名称/筹码  9.盲注  0.开始游戏  Esc返回', theme, size.width));

    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  ctx.setRender(render);
  render();

  try {
    while (true) {
      const evt = await input.waitForSelection(Math.max(seats.length, 9));
      if (evt.type === 'number') {
        const num = evt.value;
        if (num >= 1 && num <= seats.length) {
          const seat = seats[num - 1];
          // 改名
          const newName = await tuiTextInput(`${num}号位新名称`, seat.name);
          if (newName) seat.name = newName;
          // 改筹码
          if (seat.type !== '预留') {
            const newChips = await tuiNumberInput(`${num}号位筹码`, 100, 100000, seat.chips);
            if (newChips !== null) seat.chips = newChips;
          }
          render();
        } else if (num === 9) {
          const sb = await tuiNumberInput('小盲注金额', 1, 10000, config.smallBlind);
          if (sb !== null) { config.smallBlind = sb; config.bigBlind = sb * 2; }
          render();
        } else if (num === 0) {
          const wantSpec = await tuiYesNo('是否开启特殊设置?', false);
          if (wantSpec) {
            enabledVariants = await tuiSpecialSettings(enabledVariants);
          }
          const confirmed = await tuiYesNo('确认开始游戏?', false);
          if (confirmed) {
            return { ...config, seats, enabledVariants: [...enabledVariants] };
          }
          render();
        }
      } else if (evt.type === 'escape') {
        return null;
      }
    }
  } finally {
    ctx.setRender(null);
  }
}

// ============ 客户端座位选择 & 等待大厅 ============

/**
 * 客户端 TUI 座位选择（从可用座位列表中选）
 */
export async function tuiClientSeatSelect(options: string[]): Promise<number | null> {
  const ctx = getMenuContext();
  if (!ctx) {
    // Fallback: console
    options.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
    const choice = await rlNumberInput('选择座位: ', 1, options.length);
    return choice - 1;
  }
  return tuiSelect('选择你的座位', options, 0);
}

/**
 * 客户端等待游戏开始界面
 * @param checkGameStarted 回调，返回true表示游戏已开始
 * @param seats 房间座位信息（可选）
 * @returns true=游戏已开始, false=用户主动退出
 */
export async function tuiClientWaitForGame(
  checkGameStarted: () => boolean,
  seats?: { seatIndex: number; playerName: string; type: string; isOccupied: boolean }[],
): Promise<boolean> {
  const ctx = getMenuContext();
  if (!ctx) {
    console.log('\n  已加入房间，等待主机开始游戏... (Ctrl+C 退出)');
    let attempts = 0;
    while (!checkGameStarted() && attempts < 600) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    return checkGameStarted();
  }

  let prevSeatsJson = '';

  const { screen, input, theme } = ctx;

  const render = () => {
    const size = getTerminalSize();
    const lines: string[] = [];
    lines.push('');
    lines.push(...renderTitle('已加入房间', theme, size.width));
    if (seats) {
      const seatLines = seats.map(s => {
        const status = s.isOccupied ? '已占用' : '空闲';
        const st = s.type === 'host' ? '主机' : s.type === 'ai' ? 'AI' : s.type === 'llm' ? 'LLM' : '预留';
        return `  ${s.seatIndex + 1}号位 [${st}] ${s.playerName} (${status})`;
      });
      lines.push(...renderInfoBox('房间座位', seatLines, theme, size.width));
    }
    lines.push('');
    lines.push(...renderInfoBox('状态', [
      '等待主机开始游戏...',
      '',
      '按 Esc 退出房间'
    ], theme, size.width));
    lines.push('');
    lines.push(renderStatusBar('等待中...  Esc 退出', theme, size.width));
    for (let i = 0; i < lines.length; i++) {
      screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      screen.setLine(i, '');
    }
    screen.render();
  };

  ctx.setRender(render);
  render();

  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const finish = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      clearInterval(autoRefresh);
      input.removeCallback(keyHandler);
      ctx.setRender(null);
      resolve(value);
    };

    // 每500ms检查游戏是否开始 + 刷新显示
    const autoRefresh = setInterval(() => {
      if (checkGameStarted()) {
        finish(true);
      } else {
        render();
      }
    }, 500);

    // 监听 Escape 键
    const keyHandler = (key: KeyEvent) => {
      if (key.name === 'escape') {
        finish(false);
      }
    };
    input.onKey(keyHandler);
  });
}
