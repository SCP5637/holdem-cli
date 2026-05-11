/**
 * Raw-mode stdin输入处理器
 * 直接监听data事件，避免readline.emitKeypressEvents在Windows上
 * 与配置阶段readline残留状态冲突导致keypress事件不触发
 */

import { execSync } from 'child_process';

export interface KeyEvent {
  name: string;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}

/** 读取系统剪切板 */
function readClipboard(): string {
  try {
    if (process.platform === 'win32') {
      return execSync('powershell -command "Get-Clipboard"', { encoding: 'utf8', timeout: 3000 }).trim();
    } else if (process.platform === 'darwin') {
      return execSync('pbpaste', { encoding: 'utf8', timeout: 3000 }).trim();
    } else {
      return execSync('xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null', { encoding: 'utf8', shell: '/bin/bash', timeout: 3000 }).trim();
    }
  } catch {
    return '';
  }
}

type KeyCallback = (key: KeyEvent) => void;

export class InputHandler {
  private keyCallbacks: KeyCallback[] = [];
  private rawEnabled = false;
  private dataHandler: ((buf: Buffer) => void) | null = null;

  /** 进入原始模式 */
  enableRawMode(): void {
    if (this.rawEnabled) return;

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    this.dataHandler = (buf: Buffer) => {
      const evt = this.parseData(buf);
      if (!evt) return;
      // 遍历副本：回调中可能 splice 自删，避免跳过后续 handler
      for (const cb of [...this.keyCallbacks]) {
        cb(evt);
      }
    };

    process.stdin.on('data', this.dataHandler);
    this.rawEnabled = true;
  }

  /** 退出原始模式 */
  disableRawMode(): void {
    if (!this.rawEnabled) return;
    if (this.dataHandler) {
      process.stdin.off('data', this.dataHandler);
      this.dataHandler = null;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    this.keyCallbacks = [];
    this.rawEnabled = false;
  }

  /** 监听按键 */
  onKey(cb: KeyCallback): void {
    this.keyCallbacks.push(cb);
  }

  /** 移除指定按键监听 */
  removeCallback(cb: KeyCallback): void {
    const idx = this.keyCallbacks.indexOf(cb);
    if (idx >= 0) this.keyCallbacks.splice(idx, 1);
  }

  /** 移除所有按键监听 */
  removeAllListeners(): void {
    this.keyCallbacks = [];
  }

  /** 等待指定数字键(1..max)，返回1-indexed数字 */
  waitForNumber(max: number, timeoutMs: number = 0): Promise<number> {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | null = null;

      const handler = (key: KeyEvent) => {
        const num = parseInt(key.name, 10);
        if (!isNaN(num) && num >= 1 && num <= max) {
          cleanup();
          resolve(num);
        }
      };

      const cleanup = () => {
        const idx = this.keyCallbacks.indexOf(handler);
        if (idx >= 0) this.keyCallbacks.splice(idx, 1);
        if (timer) clearTimeout(timer);
      };

      this.keyCallbacks.push(handler);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          cleanup();
          resolve(-1);
        }, timeoutMs);
      }
    });
  }

  /** 等待Enter键 */
  waitForEnter(): Promise<void> {
    return new Promise((resolve) => {
      const handler = (key: KeyEvent) => {
        if (key.name === 'return' || key.name === 'enter') {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        const idx = this.keyCallbacks.indexOf(handler);
        if (idx >= 0) this.keyCallbacks.splice(idx, 1);
      };

      this.keyCallbacks.push(handler);
    });
  }

  /**
   * 菜单选择原语: 同时监听数字键(1..max)、方向键(up/down)、Enter、Esc
   * 返回 { type, value } — number类型时value为1-indexed数字，arrow类型时value为-1(up)或+1(down)
   */
  waitForSelection(max: number): Promise<{ type: 'number' | 'arrow' | 'enter' | 'escape'; value: number }> {
    return new Promise((resolve) => {
      const handler = (key: KeyEvent) => {
        if (key.name === 'return' || key.name === 'enter') {
          cleanup();
          resolve({ type: 'enter', value: 0 });
          return;
        }
        if (key.name === 'escape') {
          cleanup();
          resolve({ type: 'escape', value: 0 });
          return;
        }
        if (key.name === 'up' || key.name === 'left') {
          cleanup();
          resolve({ type: 'arrow', value: -1 });
          return;
        }
        if (key.name === 'down' || key.name === 'right') {
          cleanup();
          resolve({ type: 'arrow', value: 1 });
          return;
        }
        const num = parseInt(key.name, 10);
        if (!isNaN(num) && num >= 0 && num <= max) {
          cleanup();
          resolve({ type: 'number', value: num });
          return;
        }
      };

      const cleanup = () => {
        const idx = this.keyCallbacks.indexOf(handler);
        if (idx >= 0) this.keyCallbacks.splice(idx, 1);
      };

      this.keyCallbacks.push(handler);
    });
  }

  /** 等待任意键 */
  waitForAnyKey(): Promise<string> {
    return new Promise((resolve) => {
      const handler = (key: KeyEvent) => {
        cleanup();
        resolve(key.name);
      };

      const cleanup = () => {
        const idx = this.keyCallbacks.indexOf(handler);
        if (idx >= 0) this.keyCallbacks.splice(idx, 1);
      };

      this.keyCallbacks.push(handler);
    });
  }

  /** 读取字符串(数字回显)。onChange在每次文本变更时触发，用于逐键渲染 */
  readString(
    existing: string,
    maxLen: number = 10,
    onChange?: (text: string) => void
  ): Promise<{ text: string; cancelled: boolean }> {
    return new Promise((resolve) => {
      let text = existing;

      const handler = (key: KeyEvent) => {
        if (key.name === 'return' || key.name === 'enter') {
          cleanup();
          resolve({ text, cancelled: false });
          return;
        }

        if (key.name === 'escape') {
          cleanup();
          resolve({ text: '', cancelled: true });
          return;
        }

        if (key.name === 'backspace') {
          if (text.length > 0) {
            text = text.slice(0, -1);
            if (onChange) onChange(text);
          }
          return;
        }

        // Ctrl+V 粘贴
        if (key.name === 'ctrl+v' || (key.ctrl && key.name === 'v')) {
          const clip = readClipboard();
          if (clip) {
            const clean = clip.replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7e]/g, '');
            const available = maxLen - text.length;
            if (available > 0) {
              text += clean.slice(0, available);
              if (onChange) onChange(text);
            }
          }
          return;
        }

        // 批量粘贴 (Shift+Insert等终端原生粘贴，buffer含多字符)
        if (key.name.length > 1 && !key.ctrl && !key.meta) {
          const clean = key.name.replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7e]/g, '');
          const available = maxLen - text.length;
          if (available > 0 && clean.length > 0) {
            text += clean.slice(0, available);
            if (onChange) onChange(text);
          }
          return;
        }

        // 可打印字符 (字母、数字、常见符号)
        if (text.length < maxLen && key.name.length === 1) {
          const ch = key.name.charCodeAt(0);
          if (ch >= 0x20 && ch < 0x7f) {
            text += key.name;
            if (onChange) onChange(text);
          }
        }
      };

      const cleanup = () => {
        const idx = this.keyCallbacks.indexOf(handler);
        if (idx >= 0) this.keyCallbacks.splice(idx, 1);
      };

      this.keyCallbacks.push(handler);
    });
  }

  /** 检查是否处于raw模式 */
  get isRaw(): boolean {
    return this.rawEnabled;
  }

  /** 解析原始data buffer为KeyEvent */
  private parseData(buf: Buffer): KeyEvent | null {
    // Ctrl+C (0x03) 中断
    if (buf[0] === 0x03) {
      return { name: 'c', sequence: '\x03', ctrl: true, meta: false, shift: false };
    }

    // Ctrl+V 粘贴 (0x16)
    if (buf[0] === 0x16) {
      return { name: 'ctrl+v', sequence: '\x16', ctrl: true, meta: false, shift: false };
    }

    // Enter 回车 (0x0D)
    if (buf[0] === 0x0d) {
      return { name: 'return', sequence: '\r', ctrl: false, meta: false, shift: false };
    }

    // Escape / ANSI 转义序列
    if (buf[0] === 0x1b) {
      if (buf.length === 1) {
        return { name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false };
      }
      // 方向键: \x1b[A (上), \x1b[B (下), \x1b[C (右), \x1b[D (左)
      if (buf.length === 3 && buf[1] === 0x5b) {
        switch (buf[2]) {
          case 0x41: return { name: 'up', sequence: '\x1b[A', ctrl: false, meta: false, shift: false };
          case 0x42: return { name: 'down', sequence: '\x1b[B', ctrl: false, meta: false, shift: false };
          case 0x43: return { name: 'right', sequence: '\x1b[C', ctrl: false, meta: false, shift: false };
          case 0x44: return { name: 'left', sequence: '\x1b[D', ctrl: false, meta: false, shift: false };
        }
      }
      return null;
    }

    // Backspace 退格 (0x7F / 0x08)
    if (buf[0] === 0x7f || buf[0] === 0x08) {
      return { name: 'backspace', sequence: buf.toString(), ctrl: false, meta: false, shift: false };
    }

    // 普通可打印字符
    const str = buf.toString();
    // 过滤控制字符
    if (buf[0] < 0x20) return null;

    return { name: str, sequence: str, ctrl: false, meta: false, shift: false };
  }
}
