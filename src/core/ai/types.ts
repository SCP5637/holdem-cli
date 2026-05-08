/**
 * AI策略系统核心类型
 */

import { GameState, Player, PlayerAction, AIDifficulty, DIFFICULTY_LABELS } from '../../types/game';

export { AIDifficulty, DIFFICULTY_LABELS };

/**
 * 策略元数据
 */
export interface StrategyMetadata {
  name: string;
  difficulty: AIDifficulty;
  description: string;
  style: string;
}

/**
 * AI决策上下文 — 传递给每个策略的完整信息
 */
export interface AIDecisionContext {
  state: GameState;
  player: Player;
  availableActions: PlayerAction[];
  monteCarlo: MonteCarloEngine;
  opponentModel: OpponentModel;
  drawDetector: DrawDetector;
}

/**
 * 蒙特卡洛权益引擎接口
 */
export interface MonteCarloEngine {
  computeEquity(hole: import('../../types/card').Card[], board: import('../../types/card').Card[], numOpponents: number, numSims?: number): { win: number; tie: number; equity: number };
}

/**
 * 听牌检测器接口
 */
export interface DrawDetector {
  detectDraws(hole: import('../../types/card').Card[], board: import('../../types/card').Card[]): DrawResult;
}

export interface DrawResult {
  hasFlushDraw: boolean;
  hasStraightDraw: boolean;
  openEnded: boolean;
  gutshot: boolean;
  overcards: number;
  comboDraw: boolean;
}

/**
 * 对手模型接口
 */
export interface OpponentModel {
  getArchetype(playerId: number): OpponentArchetype;
  recordAction(playerId: number, action: PlayerAction, toCall: number, pot: number): void;
  recordShowdown(playerId: number): void;
  getStats(playerId: number): OpponentStats;
}

export enum OpponentArchetype {
  Unknown = 'unknown',
  Nit = 'nit',
  TAG = 'tag',
  LAG = 'lag',
  Maniac = 'maniac',
  CallingStation = 'callingStation'
}

export interface OpponentStats {
  handsPlayed: number;
  vpip: number;
  pfr: number;
  af: number;
  foldsToCBet: number;
  wtsd: number;
}

/**
 * 单个策略模块导出
 */
export interface AIStrategy {
  metadata: StrategyMetadata;
  decide(ctx: AIDecisionContext): Promise<{ action: PlayerAction; amount?: number }>;
}
