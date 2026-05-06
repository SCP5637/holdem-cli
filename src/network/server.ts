/**
 * 游戏服务器
 * 主机端网络服务，管理客户端连接和游戏状态同步
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import {
  MessageType,
  NetworkMessage,
  RemotePlayer,
  SeatConfig,
  HostConfig,
  JoinRequestPayload,
  PlayerActionPayload,
  RenamePlayerPayload
} from '../types/network';
import {
  encodeMessage,
  decodeMessages,
  createJoinResponse,
  createPlayerJoined,
  createPlayerLeft,
  createGameStateMessage,
  createActionResult,
  createSeatOccupiedMessage,
  createPongMessage,
  createErrorMessage
} from './protocol';
import { GameState, PlayerAction } from '../types/game';

export interface ServerEvents {
  'player-joined': (seatIndex: number, playerName: string) => void;
  'player-left': (seatIndex: number, reason: string) => void;
  'player-action': (seatIndex: number, action: PlayerAction, amount?: number) => void;
  'player-rename': (seatIndex: number, newName: string) => void;
  'error': (error: Error) => void;
}

export declare interface GameServer {
  on<K extends keyof ServerEvents>(event: K, listener: ServerEvents[K]): this;
  emit<K extends keyof ServerEvents>(event: K, ...args: Parameters<ServerEvents[K]>): boolean;
}

export class GameServer extends EventEmitter {
  private server: net.Server | null = null;
  private clients: Map<number, RemotePlayer> = new Map();
  private config: HostConfig | null = null;
  private currentGameState: GameState | null = null;
  private waitingForAction: Set<number> = new Set();

  /**
   * 启动服务器
   */
  start(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.server.listen(port, () => {
        console.log(`\n  游戏服务器已启动，监听端口 ${port}`);
        console.log(`  等待玩家连接...\n`);
        resolve();
      });
    });
  }

  /**
   * 停止服务器
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      // 断开所有客户端
      for (const client of this.clients.values()) {
        client.socket.end();
      }
      this.clients.clear();

      if (this.server) {
        this.server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 设置主机配置
   */
  setConfig(config: HostConfig): void {
    this.config = config;
  }

  /**
   * 处理新连接
   */
  private handleConnection(socket: net.Socket): void {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`  [连接] 新客户端连接: ${clientId}`);

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const messages = decodeMessages(buffer);

      // 处理完整的消息后，保留未完整的消息在缓冲区
      const lastNewlineIndex = buffer.lastIndexOf('\n');
      if (lastNewlineIndex >= 0) {
        buffer = buffer.slice(lastNewlineIndex + 1);
      }

      for (const message of messages) {
        this.handleMessage(socket, message, clientId);
      }
    });

    socket.on('close', () => {
      this.handleDisconnect(clientId);
    });

    socket.on('error', (err) => {
      console.log(`  [错误] 客户端 ${clientId} 连接错误: ${err.message}`);
      this.handleDisconnect(clientId);
    });
  }

  /**
   * 处理消息
   */
  private handleMessage(socket: net.Socket, message: NetworkMessage, clientId: string): void {
    switch (message.type) {
      case MessageType.JOIN_REQUEST:
        this.handleJoinRequest(socket, message.payload as JoinRequestPayload, clientId);
        break;

      case MessageType.PLAYER_ACTION:
        this.handlePlayerAction(message.payload as PlayerActionPayload);
        break;

      case MessageType.RENAME_PLAYER:
        this.handleRenamePlayer(message.payload as RenamePlayerPayload);
        break;

      case MessageType.PING:
        this.handlePing(socket);
        break;

      default:
        console.log(`  [警告] 收到未知消息类型: ${message.type}`);
    }
  }

  /**
   * 处理加入请求
   */
  private handleJoinRequest(
    socket: net.Socket,
    payload: JoinRequestPayload,
    clientId: string
  ): void {
    const { seatIndex, playerName } = payload;

    // 验证座位号
    if (!this.config || seatIndex < 0 || seatIndex >= this.config.numPlayers) {
      socket.write(encodeMessage(createJoinResponse(
        false,
        seatIndex,
        playerName,
        '无效的座位号'
      )));
      return;
    }

    // 检查座位是否已被占用
    const seat = this.config.seats[seatIndex];
    if (!seat || seat.type !== 'remote' || seat.isOccupied) {
      socket.write(encodeMessage(createJoinResponse(
        false,
        seatIndex,
        playerName,
        '该座位不可用或已被占用'
      )));
      return;
    }

    // 检查是否已有该客户端的连接
    const existingClient = this.clients.get(seatIndex);
    if (existingClient) {
      socket.write(encodeMessage(createJoinResponse(
        false,
        seatIndex,
        playerName,
        '该座位已被其他玩家占用'
      )));
      return;
    }

    // 注册客户端
    const remotePlayer: RemotePlayer = {
      seatIndex,
      name: playerName,
      socket,
      isConnected: true,
      lastPingTime: Date.now()
    };

    this.clients.set(seatIndex, remotePlayer);

    // 更新座位配置
    seat.isOccupied = true;
    seat.name = playerName;
    seat.socketId = clientId;

    // 发送成功响应
    socket.write(encodeMessage(createJoinResponse(true, seatIndex, playerName)));

    // 广播玩家加入
    this.broadcast(createPlayerJoined(seatIndex, playerName));

    console.log(`  [加入] 玩家 ${playerName} 坐在 ${seatIndex + 1} 号位`);

    // 发送当前游戏状态（如果有）
    if (this.currentGameState) {
      this.sendGameStateToClient(remotePlayer);
    }

    this.emit('player-joined', seatIndex, playerName);
  }

  /**
   * 处理玩家动作
   */
  private handlePlayerAction(payload: PlayerActionPayload): void {
    const { seatIndex, action, amount } = payload;

    // 验证是否是等待该玩家的动作
    if (!this.waitingForAction.has(seatIndex)) {
      const client = this.clients.get(seatIndex);
      if (client) {
        client.socket.write(encodeMessage(createActionResult(
          false,
          seatIndex,
          action,
          amount,
          '当前不是你的回合'
        )));
      }
      return;
    }

    // 通知主机处理动作
    this.emit('player-action', seatIndex, action, amount);
  }

  /**
   * 处理重命名请求
   */
  private handleRenamePlayer(payload: RenamePlayerPayload): void {
    const { seatIndex, newName } = payload;

    const client = this.clients.get(seatIndex);
    if (!client) return;

    const oldName = client.name;
    client.name = newName;

    // 更新座位配置
    if (this.config) {
      this.config.seats[seatIndex].name = newName;
    }

    console.log(`  [重命名] ${oldName} -> ${newName}`);

    this.emit('player-rename', seatIndex, newName);
  }

  /**
   * 处理 Ping
   */
  private handlePing(socket: net.Socket): void {
    socket.write(encodeMessage(createPongMessage()));
  }

  /**
   * 处理断开连接
   */
  private handleDisconnect(clientId: string): void {
    for (const [seatIndex, client] of this.clients.entries()) {
      if (client.socket.remoteAddress + ':' + client.socket.remotePort === clientId) {
        this.clients.delete(seatIndex);

        // 更新座位配置
        if (this.config) {
          const seat = this.config.seats[seatIndex];
          if (seat) {
            seat.isOccupied = false;
            seat.socketId = undefined;
          }
        }

        console.log(`  [离开] 玩家 ${client.name} 断开连接`);

        // 广播玩家离开
        this.broadcast(createPlayerLeft(seatIndex, '玩家断开连接'));
        this.emit('player-left', seatIndex, '玩家断开连接');
        break;
      }
    }
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(message: NetworkMessage): void {
    const encoded = encodeMessage(message);
    for (const client of this.clients.values()) {
      if (client.isConnected) {
        client.socket.write(encoded);
      }
    }
  }

  /**
   * 发送消息给特定客户端
   */
  sendTo(seatIndex: number, message: NetworkMessage): void {
    const client = this.clients.get(seatIndex);
    if (client && client.isConnected) {
      client.socket.write(encodeMessage(message));
    }
  }

  /**
   * 广播游戏状态
   */
  broadcastGameState(gameState: GameState): void {
    this.currentGameState = gameState;

    for (const client of this.clients.values()) {
      this.sendGameStateToClient(client, gameState);
    }
  }

  /**
   * 发送游戏状态给特定客户端
   */
  private sendGameStateToClient(client: RemotePlayer, gameState?: GameState): void {
    const state = gameState || this.currentGameState;
    if (!state) return;

    const serialized = this.serializeGameState(state, client.seatIndex);
    const message = createGameStateMessage(serialized, client.seatIndex);
    client.socket.write(encodeMessage(message));
  }

  /**
   * 等待玩家动作
   */
  waitForPlayerAction(seatIndex: number): void {
    this.waitingForAction.add(seatIndex);

    // 通知客户端轮到其行动
    const client = this.clients.get(seatIndex);
    if (client) {
      // 客户端通过接收游戏状态知道轮到自己
      if (this.currentGameState) {
        this.sendGameStateToClient(client);
      }
    }
  }

  /**
   * 取消等待玩家动作
   */
  cancelWaitForPlayerAction(seatIndex: number): void {
    this.waitingForAction.delete(seatIndex);
  }

  /**
   * 发送动作结果
   */
  sendActionResult(seatIndex: number, success: boolean, action: PlayerAction, amount?: number, message?: string): void {
    const client = this.clients.get(seatIndex);
    if (client) {
      client.socket.write(encodeMessage(createActionResult(
        success,
        seatIndex,
        action,
        amount,
        message
      )));
    }

    if (success) {
      this.waitingForAction.delete(seatIndex);
    }
  }

  /**
   * 获取已连接的远程玩家列表
   */
  getConnectedPlayers(): RemotePlayer[] {
    return Array.from(this.clients.values());
  }

  /**
   * 检查座位是否已连接
   */
  isSeatConnected(seatIndex: number): boolean {
    return this.clients.has(seatIndex);
  }

  /**
   * 序列化游戏状态
   */
  private serializeGameState(gameState: GameState, viewerSeatIndex: number): import('../types/network').SerializedGameState {
    return {
      players: gameState.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        hand: p.hand.map(c => ({ suit: c.suit, rank: c.rank })),
        isActive: p.isActive,
        isHuman: p.isHuman,
        isRemote: p.id !== viewerSeatIndex && p.isHuman,
        currentBet: p.currentBet,
        hasActed: p.hasActed,
        isAllIn: p.isAllIn
      })),
      communityCards: gameState.communityCards.map(c => ({ suit: c.suit, rank: c.rank })),
      pot: gameState.pot,
      sidePots: gameState.sidePots.map(sp => ({
        amount: sp.amount,
        eligiblePlayers: sp.eligiblePlayers
      })),
      currentPhase: gameState.currentPhase,
      currentPlayerIndex: gameState.currentPlayerIndex,
      dealerIndex: gameState.dealerIndex,
      smallBlind: gameState.smallBlind,
      bigBlind: gameState.bigBlind,
      currentBet: gameState.currentBet,
      minRaise: gameState.minRaise,
      handNumber: gameState.handNumber
    };
  }
}
