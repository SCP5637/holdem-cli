/**
 * 网络通信类型定义
 * 定义联机游戏的消息协议和数据结构
 */

import { GameState, PlayerAction } from './game';

/**
 * 运行模式
 */
export enum RunMode {
  Host = 'host',
  Client = 'client',
  Local = 'local'
}

/**
 * 消息类型
 */
export enum MessageType {
  // 连接阶段
  JOIN_REQUEST = 'join_request',
  JOIN_RESPONSE = 'join_response',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',

  // 游戏阶段
  GAME_STATE = 'game_state',
  PLAYER_ACTION = 'player_action',
  ACTION_RESULT = 'action_result',
  ACTION_ERROR = 'action_error',

  // 玩家管理
  RENAME_PLAYER = 'rename_player',
  SEAT_OCCUPIED = 'seat_occupied',

  // 游戏控制
  GAME_START = 'game_start',
  GAME_END = 'game_end',
  HAND_START = 'hand_start',
  HAND_END = 'hand_end',

  // 控制消息
  PING = 'ping',
  PONG = 'pong',
  DISCONNECT = 'disconnect',
  ERROR = 'error'
}

/**
 * 网络消息基础接口
 */
export interface NetworkMessage {
  type: MessageType;
  timestamp: number;
  payload: unknown;
}

/**
 * 加入请求
 */
export interface JoinRequestPayload {
  seatIndex: number;
  playerName: string;
}

/**
 * 加入响应
 */
export interface JoinResponsePayload {
  success: boolean;
  seatIndex: number;
  playerName: string;
  message?: string;
}

/**
 * 玩家加入通知
 */
export interface PlayerJoinedPayload {
  seatIndex: number;
  playerName: string;
}

/**
 * 玩家离开通知
 */
export interface PlayerLeftPayload {
  seatIndex: number;
  reason: string;
}

/**
 * 游戏状态消息
 */
export interface GameStatePayload {
  gameState: SerializedGameState;
  yourSeatIndex?: number;
}

/**
 * 玩家动作消息
 */
export interface PlayerActionPayload {
  seatIndex: number;
  action: PlayerAction;
  amount?: number;
}

/**
 * 动作结果
 */
export interface ActionResultPayload {
  success: boolean;
  seatIndex: number;
  action: PlayerAction;
  amount?: number;
  message?: string;
}

/**
 * 重命名玩家
 */
export interface RenamePlayerPayload {
  seatIndex: number;
  newName: string;
}

/**
 * 座位占用信息
 */
export interface SeatOccupiedPayload {
  seatIndex: number;
  playerName: string;
  isOccupied: boolean;
}

/**
 * 序列化的游戏状态（可JSON序列化）
 */
export interface SerializedGameState {
  players: SerializedPlayer[];
  communityCards: SerializedCard[];
  pot: number;
  sidePots: SerializedSidePot[];
  currentPhase: string;
  currentPlayerIndex: number;
  dealerIndex: number;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  minRaise: number;
  handNumber: number;
}

/**
 * 序列化的玩家
 */
export interface SerializedPlayer {
  id: number;
  name: string;
  chips: number;
  hand: SerializedCard[];
  isActive: boolean;
  isHuman: boolean;
  isRemote: boolean;
  currentBet: number;
  hasActed: boolean;
  isAllIn: boolean;
}

/**
 * 序列化的卡牌
 */
export interface SerializedCard {
  suit: string;
  rank: string;
}

/**
 * 序列化的边池
 */
export interface SerializedSidePot {
  amount: number;
  eligiblePlayers: number[];
}

/**
 * 座位配置
 */
export interface SeatConfig {
  index: number;
  type: SeatType;
  name: string;
  isOccupied: boolean;
  socketId?: string;
}

/**
 * 座位类型
 */
export enum SeatType {
  Host = 'host',
  AI = 'ai',
  Remote = 'remote',
  LLM = 'llm'
}

/**
 * 主机配置
 */
export interface HostConfig {
  numPlayers: number;
  hostSeatIndex: number;
  port: number;
  seats: SeatConfig[];
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
}

/**
 * 客户端配置
 */
export interface ClientConfig {
  host: string;
  port: number;
}

/**
 * 网络玩家信息
 */
export interface RemotePlayer {
  seatIndex: number;
  name: string;
  socket: import('net').Socket;
  isConnected: boolean;
  lastPingTime: number;
}
