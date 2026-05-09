/**
 * Raw-mode stdin输入处理器
 * 直接监听data事件，避免readline.emitKeypressEvents在Windows上
 * 与配置阶段readline残留状态冲突导致keypress事件不触发
 */

export interface KeyEvent {
  name: string;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
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
      for (const cb of this.keyCallbacks) {
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

        // 数字键
        if (key.name >= '0' && key.name <= '9' && text.length < maxLen) {
          text += key.name;
          if (onChange) onChange(text);
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
    // Ctrl+C (0x03)
    if (buf[0] === 0x03) {
      return { name: 'c', sequence: '\x03', ctrl: true, meta: false, shift: false };
    }

    // Enter (0x0D)
    if (buf[0] === 0x0d) {
      return { name: 'return', sequence: '\r', ctrl: false, meta: false, shift: false };
    }

    // Escape / ANSI escape sequences
    if (buf[0] === 0x1b) {
      if (buf.length === 1) {
        return { name: 'escape', sequence: '\x1b', ctrl: false, meta: false, shift: false };
      }
      // 跳过方向键等转义序列(如 \x1b[A)
      return null;
    }

    // Backspace (0x7F or 0x08)
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
