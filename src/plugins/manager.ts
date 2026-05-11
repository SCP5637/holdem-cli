/**
 * 插件管理器 — 单例模式
 * 游戏初始化时注入启用的变体ID，各核心模块通过 hook() 查询插件拦截结果
 */

import { PluginModule, HookFn } from './types';

let instance: PluginManager | null = null;

export class PluginManager {
  private modules: PluginModule[];

  constructor(enabledIds: number[]) {
    this.modules = [];
    for (const id of enabledIds) {
      const mod = LOOKUP.get(id);
      if (mod) this.modules.push(mod);
    }
  }

  /**
   * 执行hook，遍历已启用的插件
   * @returns 第一个非null/undefined的handler返回值，或null
   */
  hook(name: string, ...args: any[]): any {
    for (const mod of this.modules) {
      const fn = mod.handlers[name];
      if (!fn) continue;
      const result = fn(...args);
      if (result !== null && result !== undefined) return result;
    }
    return null;
  }

  /** 初始化单例 */
  static init(enabledIds: number[]): void {
    instance = new PluginManager(enabledIds);
  }

  /** 获取单例 */
  static get(): PluginManager | null {
    return instance;
  }

  /** 静态hook快捷方法 */
  static hook(name: string, ...args: any[]): any {
    return instance?.hook(name, ...args) ?? null;
  }

  /** 销毁单例 */
  static destroy(): void {
    instance = null;
  }
}

/** 插件ID→模块查找表，在registry/index.ts中填充 */
export const LOOKUP = new Map<number, PluginModule>();
