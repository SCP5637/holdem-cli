/**
 * 终端显示宽度工具
 * 正确处理 ANSI 转义码（0宽）和 CJK 字符（双宽）
 */

export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
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

export function visualWidth(str: string): number {
  const stripped = stripAnsi(str);
  let width = 0;
  for (const char of stripped) {
    width += isWideChar(char.codePointAt(0)!) ? 2 : 1;
  }
  return width;
}

export function padVisual(str: string, targetWidth: number): string {
  const current = visualWidth(str);
  if (current >= targetWidth) return str;
  return str + ' '.repeat(targetWidth - current);
}

export function centerVisual(str: string, targetWidth: number): string {
  const current = visualWidth(str);
  if (current >= targetWidth) return str;
  const leftPad = Math.floor((targetWidth - current) / 2);
  const rightPad = targetWidth - current - leftPad;
  return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
}

/** 获取当前终端尺寸 */
export function getTerminalSize(): { width: number; height: number } {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24
  };
}

/** 检查是否为TTY(可交互终端) */
export function isTTY(): boolean {
  return process.stdout.isTTY === true && process.stdin.isTTY === true;
}
