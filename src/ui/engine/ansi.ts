/**
 * ANSI转义码工厂函数
 * 纯函数，无副作用，只返回转义序列字符串
 */

// --- 屏幕控制 ---
export const altScreenEnter = () => '\x1b[?1049h';
export const altScreenExit = () => '\x1b[?1049l';

// --- 光标 ---
export const cursorHide = () => '\x1b[?25l';
export const cursorShow = () => '\x1b[?25h';
export const cursorTo = (row: number, col: number) => `\x1b[${row};${col}H`;
export const cursorUp = (n: number) => `\x1b[${n}A`;
export const cursorDown = (n: number) => `\x1b[${n}B`;
export const cursorForward = (n: number) => `\x1b[${n}C`;

// --- 清除 ---
export const clearLine = () => '\x1b[2K';
export const clearScreen = () => '\x1b[2J';
export const clearToEnd = () => '\x1b[0J';

// --- 样式 ---
export const bold = () => '\x1b[1m';
export const dim = () => '\x1b[2m';
export const italic = () => '\x1b[3m';
export const underline = () => '\x1b[4m';
export const reset = () => '\x1b[0m';

// --- 256色(兼容性最优，Windows Terminal完全支持) ---
export const fg256 = (n: number) => `\x1b[38;5;${n}m`;
export const bg256 = (n: number) => `\x1b[48;5;${n}m`;

// --- 真彩色(现代终端支持) ---
export const fgRgb = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
export const bgRgb = (r: number, g: number, b: number) => `\x1b[48;2;${r};${g};${b}m`;

// --- 组合工具 ---
export function styled(s: string, ...codes: string[]): string {
  return codes.join('') + s + (codes.length > 0 ? '\x1b[0m' : '');
}

export function padAnsi(str: string, width: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const visual = visualWidthAnsi(stripped);
  if (visual >= width) return str;
  return str + ' '.repeat(width - visual);
}

export function centerAnsi(str: string, width: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const visual = visualWidthAnsi(stripped);
  if (visual >= width) return str;
  const left = Math.floor((width - visual) / 2);
  const right = width - visual - left;
  return ' '.repeat(left) + str + ' '.repeat(right);
}

function visualWidthAnsi(str: string): number {
  let width = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    width += isWideChar(cp) ? 2 : 1;
  }
  return width;
}

function isWideChar(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||
    (cp >= 0x2329 && cp <= 0x232A) ||
    (cp >= 0x2E80 && cp <= 0x303E) ||
    (cp >= 0x3040 && cp <= 0x33BF) ||
    (cp >= 0x3400 && cp <= 0x4DBF) ||
    (cp >= 0x4E00 && cp <= 0xA4CF) ||
    (cp >= 0xA960 && cp <= 0xA97C) ||
    (cp >= 0xAC00 && cp <= 0xD7A3) ||
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    (cp >= 0xFE10 && cp <= 0xFE19) ||
    (cp >= 0xFE30 && cp <= 0xFE6F) ||
    (cp >= 0xFF00 && cp <= 0xFF60) ||
    (cp >= 0xFFE0 && cp <= 0xFFE6) ||
    (cp >= 0x1B000 && cp <= 0x1B2FF) ||
    (cp >= 0x1F200 && cp <= 0x1F2FF) ||
    (cp >= 0x20000 && cp <= 0x2FA1F)
  );
}
