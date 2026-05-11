/**
 * AI策略模板加载器与调度器
 * 按难度随机选择策略，创建决策上下文，分派到具体策略
 */

import { GameState, Player, PlayerAction } from '../../types/game';
import { AIDifficulty, AIStrategy, AIDecisionContext, MonteCarloEngine, OpponentModel as OpponentModelInterface, DIFFICULTY_LABELS } from './types';
import { createMonteCarloEngine } from './monteCarlo';
import { createOpponentModel } from './opponentModel';
import { detectDraws } from './drawDetector';
import { getAvailableActions, getCurrentPlayer } from '../gameState';
import { PluginManager } from '../../plugins/manager';

// === 静态导入所有策略模块 ===
import * as rock from './AITemplate/low/rock';
import * as callingStation from './AITemplate/low/callingStation';
import * as beginner from './AITemplate/low/beginner';
import * as tagBasic from './AITemplate/medium/tagBasic';
import * as abcSolid from './AITemplate/medium/abcSolid';
import * as lagBasic from './AITemplate/medium/lagBasic';
import * as calculator from './AITemplate/high/calculator';
import * as trapper from './AITemplate/high/trapper';
import * as aggressor from './AITemplate/high/aggressor';
import * as gtoBalanced from './AITemplate/ultra/gtoBalanced';
import * as exploitative from './AITemplate/ultra/exploitative';
import * as hybrid from './AITemplate/ultra/hybrid';
import * as fullAdaptive from './AITemplate/max/fullAdaptive';
import * as nashApprox from './AITemplate/max/nashApprox';

// === 策略注册表 ===
const strategyRegistry = new Map<AIDifficulty, AIStrategy[]>();

function register(strategy: AIStrategy): void {
  const list = strategyRegistry.get(strategy.metadata.difficulty) || [];
  list.push(strategy);
  strategyRegistry.set(strategy.metadata.difficulty, list);
}

// 注册所有策略
const allModules: AIStrategy[] = [
  rock, callingStation, beginner,
  tagBasic, abcSolid, lagBasic,
  calculator, trapper, aggressor,
  gtoBalanced, exploitative, hybrid,
  fullAdaptive, nashApprox
];

for (const mod of allModules) {
  register(mod);
}

// === 共享引擎单例 ===
let monteCarloEngine: MonteCarloEngine | null = null;
let opponentModel: OpponentModelInterface | null = null;

function getMonteCarloEngine(): MonteCarloEngine {
  if (!monteCarloEngine) monteCarloEngine = createMonteCarloEngine();
  return monteCarloEngine;
}

function getOpponentModel(): OpponentModelInterface {
  if (!opponentModel) opponentModel = createOpponentModel();
  return opponentModel;
}

// === 公开API ===

/** 获取某难度的所有策略 */
export function getStrategies(difficulty: AIDifficulty): AIStrategy[] {
  return strategyRegistry.get(difficulty) || [];
}

/** 从指定难度随机选取策略 */
export function getRandomStrategy(difficulty: AIDifficulty): AIStrategy {
  const strategies = getStrategies(difficulty);
  if (strategies.length === 0) {
    // 回退: 返回中等难度的第一个
    const fallback = getStrategies(AIDifficulty.Medium);
    return fallback[0];
  }
  return strategies[Math.floor(Math.random() * strategies.length)];
}

/** 列出所有难度及内含策略数 */
export function listAllStrategies(): Map<AIDifficulty, { label: string; count: number; strategies: string[] }> {
  const result = new Map<AIDifficulty, { label: string; count: number; strategies: string[] }>();
  for (const diff of [AIDifficulty.Low, AIDifficulty.Medium, AIDifficulty.High, AIDifficulty.Ultra, AIDifficulty.Max]) {
    const strategies = getStrategies(diff);
    result.set(diff, {
      label: DIFFICULTY_LABELS[diff],
      count: strategies.length,
      strategies: strategies.map(s => s.metadata.name)
    });
  }
  return result;
}

/** AI决策入口 — 替换旧aiPlayer.ts的getAIAction */
export async function getAIAction(state: GameState): Promise<{ action: PlayerAction; amount?: number }> {
  const player = getCurrentPlayer(state);
  const availableActions = getAvailableActions(state);

  if (availableActions.length === 0) {
    return { action: PlayerAction.Fold };
  }

  // 查找玩家分配的策略
  const strategyName = player.aiStrategy;
  let strategy: AIStrategy | undefined;

  if (strategyName) {
    // 按名称查找策略
    for (const [, strategies] of strategyRegistry) {
      strategy = strategies.find(s => s.metadata.name === strategyName);
      if (strategy) break;
    }
  }

  // 如果没找到分配的策略(兼容旧数据), 随机选一个中等的
  if (!strategy) {
    strategy = getRandomStrategy(AIDifficulty.Medium);
  }

  // 构建决策上下文
  const ctx: AIDecisionContext = {
    state,
    player,
    availableActions,
    monteCarlo: getMonteCarloEngine(),
    opponentModel: getOpponentModel(),
    drawDetector: { detectDraws },
    enabledVariants: PluginManager.get()?.enabledIds ?? []
  };

  // 记录对手动作 (本轮下注的玩家)
  recordOpponentActions(state);

  return strategy.decide(ctx);
}

/** 记录单个玩家动作到对手模型 */
export function recordPlayerAction(playerId: number, action: PlayerAction, toCall: number, pot: number): void {
  getOpponentModel().recordAction(playerId, action, toCall, pot);
}

/** 记录对手动作到对手模型 */
function recordOpponentActions(state: GameState): void {
  const om = getOpponentModel();
  for (const p of state.players) {
    if (p.isHuman) {
      const toCall = state.currentBet - p.currentBet;
      om.recordAction(p.id, PlayerAction.Check, toCall, state.pot);
    }
  }
}

/** LLM回退用：从High/Ultra/Max中随机选策略决策 */
export async function getFallbackAIAction(state: GameState): Promise<{ action: PlayerAction; amount?: number }> {
  const player = getCurrentPlayer(state);
  const availableActions = getAvailableActions(state);

  if (availableActions.length === 0) {
    return { action: PlayerAction.Fold };
  }

  const diffs = [AIDifficulty.High, AIDifficulty.Ultra, AIDifficulty.Max];
  const randomDiff = diffs[Math.floor(Math.random() * diffs.length)];
  const strategy = getRandomStrategy(randomDiff);

  const ctx: AIDecisionContext = {
    state,
    player,
    availableActions,
    monteCarlo: getMonteCarloEngine(),
    opponentModel: getOpponentModel(),
    drawDetector: { detectDraws },
    enabledVariants: PluginManager.get()?.enabledIds ?? []
  };

  return strategy.decide(ctx);
}

/** 获取对手模型实例 (供LLM上下文使用) */
export function getOpponentModelInstance(): OpponentModelInterface {
  return getOpponentModel();
}

/** 重置对手模型 (新游戏时调用) */
export function resetOpponentModel(): void {
  opponentModel = null;
}

export { AIDifficulty, DIFFICULTY_LABELS };
export type { AIStrategy, AIDecisionContext, OpponentModelInterface };
