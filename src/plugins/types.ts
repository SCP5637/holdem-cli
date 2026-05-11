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
