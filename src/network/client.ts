/**
 * 游戏客户端
 * 客户端网络连接，连接主机并接收/发送游戏数据
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import {
  MessageType,
  NetworkMessage,
  ClientConfig,
  SerializedGameState,
  JoinResponsePayload,
  GameStatePayload,
  ActionResultPayload,
  PlayerLeftPayload,
  SeatListPayload
} from '../types/network';
import { PlayerAction } from '../types/game';
import {
  encodeMessage,
  decodeMessages,
  createJoinRequest,
  createPlayerActionMessage,
  createRenameMessage,
  createPingMessage,
  createSeatListRequest,
  createRequestStateMessage
} from './protocol';

export interface ClientEvents {
  'connected': () => void;
  'disconnected': (reason: string) => void;
  'join-response': (success: boolean, message?: string) => void;
  'game-state': (gameState: SerializedGameState, yourSeatIndex: number) => void;
  'player-joined': (seatIndex: number, playerName: string) => void;
  'player-left': (seatIndex: number, reason: string) => void;
  'action-result': (success: boolean, message?: string) => void;
  'seat-list': (seats: SeatListPayload['seats']) => void;
  'game-over': () => void;
  'server-shutdown': (reason: string) => void;
  'error': (error: Error | string) => void;
}

export declare interface GameClient {
  on<K extends keyof ClientEvents>(event: K, listener: ClientEvents[K]): this;
  emit<K extends keyof ClientEvents>(event: K, ...args: Parameters<ClientEvents[K]>): boolean;
}

export class GameClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private config: ClientConfig | null = null;
  private mySeatIndex: number = -1;
  private myName: string = '';
  private isConnected: boolean = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private buffer: string = '';

  /**
   * 连接到游戏服务器
   */
  connect(config: ClientConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      this.config = config;
      this.reconnectAttempts = 0;

      this.socket = new net.Socket();

      this.socket.on('connect', () => {
        console.log(`\n  已连接到游戏服务器 ${config.host}:${config.port}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startPingInterval();
        this.emit('connected');
        resolve();
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('close', (hadError) => {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        this.stopPingInterval();

        if (wasConnected) {
          console.log('  与服务器断开连接');
          this.emit('disconnected', hadError ? '连接错误' : '连接关闭');
        }
      });

      this.socket.on('error', (err) => {
        console.log(`  连接错误: ${err.message}`);
        this.emit('error', err);
        if (!this.isConnected) {
          reject(err);
        }
      });

      this.socket.connect(config.port, config.host);
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isConnected = false;
    this.stopPingInterval();

    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  /**
   * 请求加入游戏
   */
  joinGame(seatIndex: number, playerName: string): void {
    if (!this.isConnected || !this.socket) {
      this.emit('error', '未连接到服务器');
      return;
    }

    this.mySeatIndex = seatIndex;
    this.myName = playerName;

    this.socket.write(encodeMessage(createJoinRequest(seatIndex, playerName)));
  }

  /**
   * 发送玩家动作
   */
  /**
   * 请求服务端重新发送当前游戏状态
   */
  requestStateRefresh(): void {
    if (!this.isConnected || !this.socket) return;
    this.socket.write(encodeMessage(createRequestStateMessage()));
  }

  sendAction(action: PlayerAction, amount?: number): void {
    if (!this.isConnected || !this.socket) {
      this.emit('error', '未连接到服务器');
      return;
    }

    this.socket.write(encodeMessage(createPlayerActionMessage(
      this.mySeatIndex,
      action,
      amount
    )));
  }

  /**
   * 发送重命名请求
   */
  rename(newName: string): void {
    if (!this.isConnected || !this.socket) {
      this.emit('error', '未连接到服务器');
      return;
    }

    this.myName = newName;
    this.socket.write(encodeMessage(createRenameMessage(this.mySeatIndex, newName)));
  }

  /**
   * 请求座位列表
   */
  requestSeatList(): void {
    if (!this.isConnected || !this.socket) {
      this.emit('error', '未连接到服务器');
      return;
    }

    this.socket.write(encodeMessage(createSeatListRequest()));
  }

  /**
   * 切换到新座位
   */
  switchSeat(newSeatIndex: number, newName: string): void {
    if (!this.isConnected || !this.socket) {
      this.emit('error', '未连接到服务器');
      return;
    }

    // 先离开当前座位，再加入新座位
    this.mySeatIndex = newSeatIndex;
    this.myName = newName;
    this.socket.write(encodeMessage(createJoinRequest(newSeatIndex, newName)));
  }

  /**
   * 处理接收到的数据
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();
    const messages = decodeMessages(this.buffer);

    // 保留未完整的消息在缓冲区
    const lastNewlineIndex = this.buffer.lastIndexOf('\n');
    if (lastNewlineIndex >= 0) {
      this.buffer = this.buffer.slice(lastNewlineIndex + 1);
    }

    for (const message of messages) {
      this.handleMessage(message);
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(message: NetworkMessage): void {
    switch (message.type) {
      case MessageType.JOIN_RESPONSE:
        this.handleJoinResponse(message.payload as JoinResponsePayload);
        break;

      case MessageType.GAME_STATE:
        this.handleGameState(message.payload as GameStatePayload);
        break;

      case MessageType.SEAT_LIST_RESPONSE:
        const seatListPayload = message.payload as SeatListPayload;
        this.emit('seat-list', seatListPayload.seats);
        break;

      case MessageType.PLAYER_JOINED:
        const joinedPayload = message.payload as { seatIndex: number; playerName: string };
        console.log(`  [加入] 玩家 ${joinedPayload.playerName} 坐在 ${joinedPayload.seatIndex + 1} 号位`);
        this.emit('player-joined', joinedPayload.seatIndex, joinedPayload.playerName);
        break;

      case MessageType.PLAYER_LEFT:
        const leftPayload = message.payload as PlayerLeftPayload;
        console.log(`  [离开] ${leftPayload.reason}`);
        this.emit('player-left', leftPayload.seatIndex, leftPayload.reason);
        break;

      case MessageType.ACTION_RESULT:
        this.handleActionResult(message.payload as ActionResultPayload);
        break;

      case MessageType.GAME_END:
        this.emit('game-over');
        break;

      case MessageType.SERVER_SHUTDOWN:
        const shutdownPayload = message.payload as { reason: string };
        this.emit('server-shutdown', shutdownPayload.reason || '服务器已关闭');
        break;

      case MessageType.PONG:
        // 收到 Pong，连接正常
        break;

      case MessageType.ERROR:
        const errorPayload = message.payload as { error: string };
        console.log(`  [服务器错误] ${errorPayload.error}`);
        this.emit('error', errorPayload.error);
        break;

      default:
        console.log(`  [警告] 收到未知消息类型: ${message.type}`);
    }
  }

  /**
   * 处理加入响应
   */
  private handleJoinResponse(payload: JoinResponsePayload): void {
    const { success, seatIndex, playerName, message } = payload;

    if (success) {
      this.mySeatIndex = seatIndex;
      this.myName = playerName;
      console.log(`  成功加入游戏，座位: ${seatIndex + 1}，名称: ${playerName}`);
    } else {
      console.log(`  加入失败: ${message || '未知错误'}`);
    }

    this.emit('join-response', success, message);
  }

  /**
   * 处理游戏状态
   */
  private handleGameState(payload: GameStatePayload): void {
    const { gameState, yourSeatIndex } = payload;

    if (yourSeatIndex !== undefined) {
      this.mySeatIndex = yourSeatIndex;
    }

    this.emit('game-state', gameState, this.mySeatIndex);
  }

  /**
   * 处理动作结果
   */
  private handleActionResult(payload: ActionResultPayload): void {
    const { success, message } = payload;

    if (!success && message) {
      console.log(`  [动作失败] ${message}`);
    }

    this.emit('action-result', success, message);
  }

  /**
   * 启动心跳检测
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.socket) {
        this.socket.write(encodeMessage(createPingMessage()));
      }
    }, 30000); // 每 30 秒发送一次 Ping
  }

  /**
   * 停止心跳检测
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * 获取当前座位索引
   */
  getMySeatIndex(): number {
    return this.mySeatIndex;
  }

  /**
   * 获取当前玩家名称
   */
  getMyName(): string {
    return this.myName;
  }

  /**
   * 检查是否已连接
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }
}
