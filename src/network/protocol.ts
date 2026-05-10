/**
 * 网络协议工具
 * 处理消息的编码、解码和验证
 */

import {
  MessageType,
  NetworkMessage,
  JoinRequestPayload,
  JoinResponsePayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  GameStatePayload,
  PlayerActionPayload,
  ActionResultPayload,
  RenamePlayerPayload,
  SeatOccupiedPayload,
  SeatListPayload
} from '../types/network';

/**
 * 创建网络消息
 */
export function createMessage<T>(
  type: MessageType,
  payload: T
): NetworkMessage {
  return {
    type,
    timestamp: Date.now(),
    payload: payload as unknown
  };
}

/**
 * 编码消息为 JSON 字符串
 */
export function encodeMessage(message: NetworkMessage): string {
  return JSON.stringify(message) + '\n';
}

/**
 * 解码 JSON 字符串为消息
 * 支持处理多个消息（按行分割）
 */
export function decodeMessages(data: string): NetworkMessage[] {
  const messages: NetworkMessage[] = [];
  const lines = data.split('\n').filter(line => line.trim() !== '');

  for (const line of lines) {
    try {
      const message = JSON.parse(line) as NetworkMessage;
      if (isValidMessage(message)) {
        messages.push(message);
      }
    } catch {
      // 忽略解析错误的消息
    }
  }

  return messages;
}

/**
 * 验证消息格式是否有效
 */
function isValidMessage(message: unknown): message is NetworkMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as NetworkMessage;

  return (
    typeof msg.type === 'string' &&
    Object.values(MessageType).includes(msg.type as MessageType) &&
    typeof msg.timestamp === 'number' &&
    'payload' in msg
  );
}

/**
 * 创建加入请求消息
 */
export function createJoinRequest(seatIndex: number, playerName: string): NetworkMessage {
  const payload: JoinRequestPayload = { seatIndex, playerName };
  return createMessage<JoinRequestPayload>(MessageType.JOIN_REQUEST, payload);
}

/**
 * 创建加入响应消息
 */
export function createJoinResponse(
  success: boolean,
  seatIndex: number,
  playerName: string,
  message?: string
): NetworkMessage {
  const payload: JoinResponsePayload = { success, seatIndex, playerName, message };
  return createMessage<JoinResponsePayload>(MessageType.JOIN_RESPONSE, payload);
}

/**
 * 创建玩家加入通知
 */
export function createPlayerJoined(seatIndex: number, playerName: string): NetworkMessage {
  const payload: PlayerJoinedPayload = { seatIndex, playerName };
  return createMessage<PlayerJoinedPayload>(MessageType.PLAYER_JOINED, payload);
}

/**
 * 创建玩家离开通知
 */
export function createPlayerLeft(seatIndex: number, reason: string): NetworkMessage {
  const payload: PlayerLeftPayload = { seatIndex, reason };
  return createMessage<PlayerLeftPayload>(MessageType.PLAYER_LEFT, payload);
}

/**
 * 创建游戏状态消息
 */
export function createGameStateMessage(
  gameState: GameStatePayload['gameState'],
  yourSeatIndex?: number
): NetworkMessage {
  const payload: GameStatePayload = { gameState, yourSeatIndex };
  return createMessage<GameStatePayload>(MessageType.GAME_STATE, payload);
}

/**
 * 创建玩家动作消息
 */
export function createPlayerActionMessage(
  seatIndex: number,
  action: PlayerActionPayload['action'],
  amount?: number
): NetworkMessage {
  const payload: PlayerActionPayload = { seatIndex, action, amount };
  return createMessage<PlayerActionPayload>(MessageType.PLAYER_ACTION, payload);
}

/**
 * 创建动作结果消息
 */
export function createActionResult(
  success: boolean,
  seatIndex: number,
  action: ActionResultPayload['action'],
  amount?: number,
  message?: string
): NetworkMessage {
  const payload: ActionResultPayload = { success, seatIndex, action, amount, message };
  return createMessage<ActionResultPayload>(MessageType.ACTION_RESULT, payload);
}

/**
 * 创建重命名消息
 */
export function createRenameMessage(seatIndex: number, newName: string): NetworkMessage {
  const payload: RenamePlayerPayload = { seatIndex, newName };
  return createMessage<RenamePlayerPayload>(MessageType.RENAME_PLAYER, payload);
}

/**
 * 创建座位占用消息
 */
export function createSeatOccupiedMessage(
  seatIndex: number,
  playerName: string,
  isOccupied: boolean
): NetworkMessage {
  const payload: SeatOccupiedPayload = { seatIndex, playerName, isOccupied };
  return createMessage<SeatOccupiedPayload>(MessageType.SEAT_OCCUPIED, payload);
}

/**
 * 创建座位列表请求消息
 */
export function createSeatListRequest(): NetworkMessage {
  return createMessage(MessageType.SEAT_LIST_REQUEST, {});
}

/**
 * 创建座位列表响应消息
 */
export function createSeatListResponse(seats: SeatListPayload['seats']): NetworkMessage {
  const payload: SeatListPayload = { seats };
  return createMessage<SeatListPayload>(MessageType.SEAT_LIST_RESPONSE, payload);
}

/**
 * 创建服务器关停消息
 */
export function createServerShutdownMessage(reason: string): NetworkMessage {
  return createMessage(MessageType.SERVER_SHUTDOWN, { reason });
}

/**
 * 创建 Ping 消息
 */
export function createPingMessage(): NetworkMessage {
  return createMessage(MessageType.PING, {});
}

/**
 * 创建 Pong 消息
 */
export function createPongMessage(): NetworkMessage {
  return createMessage(MessageType.PONG, {});
}

/**
 * 创建请求状态刷新消息
 */
export function createRequestStateMessage(): NetworkMessage {
  return createMessage(MessageType.REQUEST_STATE, {});
}

/**
 * 创建错误消息
 */
export function createErrorMessage(error: string): NetworkMessage {
  return createMessage(MessageType.ERROR, { error });
}

/**
 * 创建断开连接消息
 */
export function createDisconnectMessage(reason: string): NetworkMessage {
  return createMessage(MessageType.DISCONNECT, { reason });
}
