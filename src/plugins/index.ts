/**
 * 插件注册表
 * 统一管理所有变体/插件，包含兼容性冲突自动解决
 * 导入每个插件的module以触发LOOKUP注册
 */

import { VariantDef } from './types';
import arcade from './0-arcade';
import glassCards, { module as _glassCardsModule } from './1-glassCards';
import fogOfWar from './2-fogOfWar';
import reverseFog from './3-reverseFog';
import peopleReading, { module as _peopleReadingModule } from './4-peopleReading';
import wanning from './5-wanning';
import chosenOne from './6-chosenOne';

const allVariants: VariantDef[] = [
  arcade,
  glassCards,
  fogOfWar,
  reverseFog,
  peopleReading,
  wanning,
  chosenOne,
];

/** 获取所有变体定义 */
export function getAllVariants(): VariantDef[] {
  return allVariants;
}

/** 按ID查找变体定义 */
export function getVariantById(id: number): VariantDef | undefined {
  return allVariants.find(v => v.id === id);
}

export interface ConflictResolveResult {
  autoDisabled: number[];
}

/**
 * 解析启用变体时的冲突，返回新集合
 *
 * 规则:
 * 1. 变体有#* → 关闭其他所有变体
 * 2. 变体有#N且N已启用 → 关闭N
 * 3. 已启用的变体有#* → 先关闭它
 * 4. 已启用的变体有#此变体ID → 关闭该变体
 */
export function resolveConflicts(
  variantId: number,
  enable: boolean,
  currentlyEnabled: Set<number>,
): { newEnabled: Set<number>; autoDisabled: number[] } {
  const result = new Set(currentlyEnabled);
  const autoDisabled: number[] = [];

  if (!enable) {
    result.delete(variantId);
    return { newEnabled: result, autoDisabled };
  }

  const v = allVariants.find(x => x.id === variantId);
  if (!v) return { newEnabled: result, autoDisabled };

  for (const eid of result) {
    const ev = allVariants.find(x => x.id === eid);
    if (ev && ev.tags.includes('#*')) {
      result.delete(eid);
      autoDisabled.push(eid);
    }
  }

  if (v.tags.includes('#*')) {
    for (const eid of [...result]) {
      result.delete(eid);
      autoDisabled.push(eid);
    }
    result.add(variantId);
    return { newEnabled: result, autoDisabled };
  }

  for (const tag of v.tags) {
    if (tag.startsWith('#') && tag !== '#*') {
      const conflictId = parseInt(tag.substring(1), 10);
      if (result.has(conflictId)) {
        result.delete(conflictId);
        autoDisabled.push(conflictId);
      }
    }
  }

  for (const eid of [...result]) {
    const ev = allVariants.find(x => x.id === eid);
    if (!ev) continue;
    for (const tag of ev.tags) {
      if (tag.startsWith('#') && tag !== '#*') {
        const conflictId = parseInt(tag.substring(1), 10);
        if (conflictId === variantId) {
          result.delete(eid);
          autoDisabled.push(eid);
        }
      }
    }
  }

  result.add(variantId);
  return { newEnabled: result, autoDisabled };
}
