/**
 * 插件/变体定义类型
 * 每个插件独立文件夹，通过兼容性标签系统管理冲突
 */

export interface VariantDef {
  id: number;
  name: string;
  description: string;
  /** 兼容性标签: #* = 与所有不兼容, #N = 与编号N的变体不兼容 */
  tags: string[];
  /** 开发中标记（显示[开发中]） */
  isDev: boolean;
}

/** Hook函数签名: 返回非null/undefined值表示已处理，停止后续钩子 */
export type HookFn = (...args: any[]) => any;

/** 插件模块: 每个插件文件夹导出此结构 */
export interface PluginModule {
  variant: VariantDef;
  handlers: Record<string, HookFn>;
}
