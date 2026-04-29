/**
 * 游戏状态类型和枚举
 * 定义玩家动作、游戏阶段和核心游戏状态接口
 */

import { Card } from './card';
import { LLMAssignment } from './llm';

/**
 * 下注轮中可用的玩家动作
 */
export enum PlayerAction {
  Fold = 'fold',
  Check = 'check',
  Call = 'call',
  Raise = 'raise',
  AllIn = 'allin'
}

/**
 * 德州扑克手牌的不同阶段
 */
export enum GamePhase {
  PreFlop = 'preflop',
  Flop = 'flop',
  Turn = 'turn',
  River = 'river',
  Showdown = 'showdown'
}

/**
 * 游戏中的玩家
 */
export interface Player {
  id: number;
  name: string;
  chips: number;
  hand: Card[];
  isActive: boolean;
  isHuman: boolean;
  llmPresetName?: string;
  currentBet: number;
  hasActed: boolean;
  isAllIn: boolean;
}

/**
 * 当前游戏状态
 */
export interface GameState {
  players: Player[];
  communityCards: Card[];
  pot: number;
  currentPhase: GamePhase;
  currentPlayerIndex: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  minRaise: number;
  deck: Card[];
}

/**
 * 手牌评估结果
 */
export interface HandResult {
  playerId: number;
  handRank: HandRank;
  kickers: number[];
  description: string;
}

/**
 * 扑克手牌等级，从低到高
 */
export enum HandRank {
  HighCard = 0,
  OnePair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
  RoyalFlush = 9
}

/**
 * 新游戏的配置选项
 */
export interface GameConfig {
  numPlayers: number;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
  humanPlayerIndex: number;
  llmAssignments?: LLMAssignment[];
}
