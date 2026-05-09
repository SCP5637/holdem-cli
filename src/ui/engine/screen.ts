/**
 * 屏幕缓冲区管理
 * 交替屏幕缓冲区生命周期、行级diff渲染、resize事件处理
 */

import { altScreenEnter, altScreenExit, cursorHide, cursorShow, cursorTo, clearLine } from './ansi';

export class Screen {
  private lines: string[] = [];
  private prevLines: string[] = [];
  private altActive = false;
  private resizeCbs: Array<() => void> = [];
  private resizeListener: (() => void) | null = null;
  private forceFullRender = false;
  public width: number;
  public height: number;

  constructor() {
    this.width = process.stdout.columns || 80;
    this.height = process.stdout.rows || 24;
  }

  /** 进入交替屏幕缓冲区，隐藏光标 */
  enter(): void {
    if (this.altActive) return;
    process.stdout.write(altScreenEnter() + cursorHide());
    this.altActive = true;

    this.resizeListener = () => {
      this.width = process.stdout.columns || 80;
      this.height = process.stdout.rows || 24;
      this.resizeCbs.forEach(cb => cb());
    };
    process.stdout.on('resize', this.resizeListener);
  }

  /** 退出交替屏幕，恢复光标 */
  exit(): void {
    if (!this.altActive) return;
    if (this.resizeListener) {
      process.stdout.off('resize', this.resizeListener);
      this.resizeListener = null;
    }
    process.stdout.write(cursorShow() + altScreenExit());
    this.altActive = false;
  }

  /** 注册resize回调 */
  onResize(cb: () => void): void {
    this.resizeCbs.push(cb);
  }

  /** 设置指定行的内容(0-indexed)。若lines为空则从prevLines自动恢复帧 */
  setLine(row: number, content: string): void {
    if (this.lines.length === 0 && this.prevLines.length > 0) {
      this.lines = [...this.prevLines];
    }
    while (this.lines.length <= row) {
      this.lines.push('');
    }
    this.lines[row] = content;
  }

  /** 在指定行填充文本区域 */
  setCell(row: number, col: number, text: string): void {
    if (this.lines.length === 0 && this.prevLines.length > 0) {
      this.lines = [...this.prevLines];
    }
    while (this.lines.length <= row) {
      this.lines.push('');
    }
    const line = this.lines[row];
    const before = line.slice(0, col);
    const after = line.slice(col + text.length);
    this.lines[row] = before + text + after;
  }

  /** 清理当前帧和上一帧(全量渲染前调用) */
  reset(): void {
    this.lines = [];
    this.prevLines = [];
  }

  /** 仅清理当前帧缓冲区 */
  clear(): void {
    this.lines = [];
  }

  /** 强制下一次render()使用全量渲染(用于resize后) */
  forceFullNext(): void {
    this.forceFullRender = true;
  }

  /** 提交渲染: 逐行diff，只输出变化行 */
  render(): void {
    if (this.forceFullRender) {
      this.forceFullRender = false;
      this.renderFull();
      return;
    }

    const maxLines = Math.max(this.lines.length, this.prevLines.length);
    const writes: string[] = [];

    for (let i = 0; i < maxLines; i++) {
      const cur = this.lines[i] || '';
      const prev = this.prevLines[i] || '';

      if (cur !== prev) {
        writes.push(cursorTo(i + 1, 1) + clearLine() + cur);
      }
    }

    if (writes.length > 0) {
      process.stdout.write(writes.join(''));
    }

    this.prevLines = [...this.lines];
    this.lines = [];
  }

  /** 强制全量渲染(不用diff，不滚动) */
  renderFull(): void {
    process.stdout.write(cursorTo(1, 1));
    const maxLines = Math.max(this.lines.length, this.prevLines.length);
    for (let i = 0; i < maxLines; i++) {
      process.stdout.write(clearLine() + (this.lines[i] || ''));
      if (i < maxLines - 1) {
        process.stdout.write('\n');
      }
    }
    this.prevLines = [...this.lines];
    this.lines = [];
  }
}
