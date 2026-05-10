/**
 * MenuUI — 菜单/配置阶段的UI管理器
 * 拥有Screen和InputHandler，通过全局context供inputHandler函数使用。
 * 游戏开始前移交给GameUI。
 */

import { Screen } from '../engine/screen';
import { InputHandler } from '../engine/input';
import { Theme, defaultTheme } from '../theme';
import { isTTY } from '../terminal';

export interface MenuContext {
  screen: Screen;
  input: InputHandler;
  theme: Theme;
  setRender: (fn: (() => void) | null) => void;
  getRender: () => (() => void) | null;
}

let activeContext: MenuContext | null = null;

/** 获取当前活动的MenuUI上下文 (供inputHandler函数使用) */
export function getMenuContext(): MenuContext | null {
  return activeContext;
}

export class MenuUI {
  readonly screen: Screen;
  readonly input: InputHandler;
  readonly theme: Theme;
  readonly fallbackMode: boolean;

  private currentRender: (() => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.screen = new Screen();
    this.input = new InputHandler();
    this.theme = defaultTheme;
    this.fallbackMode = !isTTY();
  }

  /** 进入全屏TUI模式 */
  init(): void {
    if (this.fallbackMode) return;
    this.screen.enter();
    this.input.enableRawMode();

    this.resizeHandler = () => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null;
        if (this.currentRender) {
          this.screen.forceFullNext();
          this.currentRender();
        }
      }, 150);
    };
    this.screen.onResize(this.resizeHandler);

    // F键强制重绘 — 对所有菜单页生效
    this.input.onKey((key) => {
      if (key.name === 'f' && !key.ctrl) {
        this.screen.width = process.stdout.columns || 80;
        this.screen.height = process.stdout.rows || 24;
        this.screen.forceFullNext();
        if (this.currentRender) {
          this.currentRender();
        }
      }
    });

    activeContext = {
      screen: this.screen,
      input: this.input,
      theme: this.theme,
      setRender: (fn) => { this.currentRender = fn; },
      getRender: () => this.currentRender
    };
  }

  /** 完全清理 — 退出交替屏幕和raw模式 */
  destroy(): void {
    activeContext = null;
    if (this.resizeTimer) { clearTimeout(this.resizeTimer); this.resizeTimer = null; }
    if (this.fallbackMode) return;
    this.input.disableRawMode();
    this.screen.exit();
  }

  /**
   * 移交给GameUI — 清context和监听器，但保留screen和raw模式
   * 返回screen和input供GameUI接管
   */
  transfer(): { screen: Screen; input: InputHandler } {
    activeContext = null;
    this.currentRender = null;
    if (this.resizeTimer) { clearTimeout(this.resizeTimer); this.resizeTimer = null; }
    this.input.removeAllListeners();
    return { screen: this.screen, input: this.input };
  }

  /** 设置当前resize重绘回调 (每个菜单函数安装自己的) */
  setCurrentRender(fn: (() => void) | null): void {
    this.currentRender = fn;
  }
}
