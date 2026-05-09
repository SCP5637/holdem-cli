/**
 * 远程渲染器
 * 客户端使用，根据主机发送的游戏状态渲染界面
 */

import { SerializedGameState, SerializedPlayer, SerializedCard } from '../types/network';
import { GamePhase, PlayerAction } from '../types/game';
import { renderCards } from './cardRenderer';
import { SUIT_SYMBOLS, Suit, Rank, Card } from '../types/card';
import { padVisual, centerVisual } from './terminal';

/**
 * 清空控制台屏幕
 */
export function clearScreen(): void {
  console.clear();
}

/**
 * 将完整的游戏状态渲染到控制台
 * @param gameState - 序列化的游戏状态
 * @param mySeatIndex - 当前客户端的座位索引
 * @param availableActions - 可用动作（如果是当前玩家的回合）
 */
export function renderRemoteGameState(
  gameState: SerializedGameState,
  mySeatIndex: number,
  availableActions?: PlayerAction[]
): void {
  clearScreen();
  renderHeader(gameState);
  renderCommunityCards(gameState);
  renderPot(gameState);
  renderPlayers(gameState, mySeatIndex);

  if (availableActions && availableActions.length > 0) {
    renderAvailableActions(availableActions);
  }
}

/**
 * 渲染游戏标题和阶段信息
 * @param gameState - 游戏状态
 */
function renderHeader(gameState: SerializedGameState): void {
  const BOX_W = 60;
  const phase = getPhaseDisplay(gameState.currentPhase as GamePhase);
  const title = centerVisual(`德州扑克 - ${phase}`, BOX_W);
  console.log('╔' + '═'.repeat(BOX_W) + '╗');
  console.log('║' + title + '║');
  console.log('╚' + '═'.repeat(BOX_W) + '╝');
  console.log();
}

/**
 * 渲染公共牌
 * @param gameState - 游戏状态
 */
function renderCommunityCards(gameState: SerializedGameState): void {
  console.log('  公共牌:');
  console.log();

  if (gameState.communityCards.length === 0) {
    console.log('  [尚未发牌]');
  } else {
    const cards: Card[] = gameState.communityCards.map(c => ({ suit: c.suit as Suit, rank: c.rank as Rank }));
    const cardRender = renderCards(cards);
    const lines = cardRender.split('\n');
    for (const line of lines) {
      console.log('  ' + line);
    }
  }

  console.log();
}

/**
 * 渲染当前底池和下注信息
 * @param gameState - 游戏状态
 */
function renderPot(gameState: SerializedGameState): void {
  const totalPot = gameState.pot + gameState.sidePots.reduce((sum, sp) => sum + sp.amount, 0);
  const BOX_W = 58;

  function line(content: string): string {
    return `  │  ${padVisual(content, BOX_W)}│`;
  }

  console.log(`  ┌${'─'.repeat(BOX_W + 2)}┐`);
  console.log(line(`总底池: $${totalPot}`));

  if (gameState.sidePots.length > 0) {
    console.log(line(`主底池: $${gameState.pot}`));
    gameState.sidePots.forEach((sidePot, index) => {
      console.log(line(`边池 ${index + 1}: $${sidePot.amount}`));
    });
  }

  console.log(line(`当前下注: $${gameState.currentBet}`));
  console.log(`  └${'─'.repeat(BOX_W + 2)}┘`);
  console.log();
}

/**
 * 渲染所有玩家及其信息
 * @param gameState - 游戏状态
 * @param mySeatIndex - 当前客户端的座位索引
 */
function renderPlayers(gameState: SerializedGameState, mySeatIndex: number): void {
  console.log('  玩家:');
  console.log();

  for (const player of gameState.players) {
    renderPlayer(player, gameState, mySeatIndex);
  }
}

/**
 * 渲染单个玩家的信息
 * @param player - 要渲染的玩家
 * @param gameState - 游戏状态
 * @param mySeatIndex - 当前客户端的座位索引
 */
function renderPlayer(
  player: SerializedPlayer,
  gameState: SerializedGameState,
  mySeatIndex: number
): void {
  const isCurrentPlayer = gameState.currentPlayerIndex === player.id;
  const isDealer = gameState.dealerIndex === player.id;
  const isSmallBlind = (gameState.dealerIndex + 1) % gameState.players.length === player.id;
  const isBigBlind = (gameState.dealerIndex + 2) % gameState.players.length === player.id;
  const isMe = player.id === mySeatIndex;

  let statusIndicator = '  ';
  if (isCurrentPlayer) statusIndicator = '▶ ';

  let positionIndicator = '';
  if (isDealer) positionIndicator = ' [庄]';
  else if (isSmallBlind) positionIndicator = ' [小盲]';
  else if (isBigBlind) positionIndicator = ' [大盲]';

  let playerStatus = '';
  if (!player.isActive) playerStatus = ' (已弃牌)';
  else if (player.isAllIn) playerStatus = ' (全押)';

  const meIndicator = isMe ? ' (你)' : '';
  const remoteIndicator = player.isRemote ? ' [网]' : '';

  const nameLine = `${statusIndicator}${player.name}${meIndicator}${remoteIndicator}${positionIndicator}${playerStatus}`;
  const chipsLine = `     筹码: $${player.chips}  |  当前下注: $${player.currentBet}`;

  console.log(`  ${nameLine}`);
  console.log(chipsLine);

  // 显示手牌（如果是自己或玩家已弃牌）
  if (player.hand.length > 0 && (isMe || !player.isActive)) {
    const cards: Card[] = player.hand.map(c => ({ suit: c.suit as Suit, rank: c.rank as Rank }));
    const cardRender = renderCards(cards);
    const lines = cardRender.split('\n');
    for (const line of lines) {
      console.log('     ' + line);
    }
  }

  console.log();
}

/**
 * 渲染可用动作
 * @param actions - 可用动作数组
 */
function renderAvailableActions(actions: PlayerAction[]): void {
  const BOX_W = 58;
  const ACTIONS_INNER = BOX_W;

  console.log(`  ┌${'─'.repeat(BOX_W + 2)}┐`);
  console.log(`  │  ${padVisual('轮到你的回合！', ACTIONS_INNER)}│`);
  console.log(`  ├${'─'.repeat(BOX_W + 2)}┤`);

  const actionMap: Record<PlayerAction, string> = {
    [PlayerAction.Fold]: '弃牌',
    [PlayerAction.Check]: '过牌',
    [PlayerAction.Call]: '跟注',
    [PlayerAction.Raise]: '加注',
    [PlayerAction.AllIn]: '全押'
  };

  actions.forEach((action, index) => {
    const displayText = actionMap[action];
    console.log(`  │  ${padVisual(`${index + 1}. ${displayText}`, ACTIONS_INNER)}│`);
  });

  console.log(`  └${'─'.repeat(BOX_W + 2)}┘`);
}

/**
 * 渲染手牌结果
 * @param gameState - 游戏状态
 * @param winners - 获胜玩家ID数组
 * @param handDescriptions - 玩家ID到手牌描述的映射
 */
export function renderRemoteHandResult(
  gameState: SerializedGameState,
  winners: number[],
  handDescriptions: Map<number, string>
): void {
  console.log();
  subBoxTitle('手牌结果');
  console.log();

  for (const player of gameState.players) {
    if (player.isActive) {
      const handDesc = handDescriptions.get(player.id) || '未知';
      const isWinner = winners.includes(player.id);
      const indicator = isWinner ? '★ ' : '  ';
      console.log(`  ${indicator}${player.name}: ${handDesc}`);
    }
  }

  console.log();

  const totalPot = gameState.pot + gameState.sidePots.reduce((sum, sp) => sum + sp.amount, 0);

  if (winners.length === 1) {
    const winner = gameState.players.find(p => p.id === winners[0])!;
    console.log(`  获胜者: ${winner.name} 赢得 $${totalPot}`);
  } else {
    const winnerNames = winners.map(id => gameState.players.find(p => p.id === id)!.name).join(', ');
    const share = Math.floor(totalPot / winners.length);
    console.log(`  获胜者: ${winnerNames} 平分底池 (每人 $${share})`);
  }

  console.log();
}

/**
 * 渲染玩家动作
 * @param playerName - 执行动作的玩家名称
 * @param action - 执行的动作
 * @param amount - 可选的下注金额
 */
export function renderRemoteAction(playerName: string, action: string, amount?: number): void {
  const actionMap: Record<string, string> = {
    'fold': '弃牌',
    'check': '过牌',
    'call': '跟注',
    'raise': '加注',
    'allin': '全押'
  };

  const actionText = actionMap[action] || action;
  let text = `${playerName} ${actionText}`;
  if (amount !== undefined && amount > 0) {
    text += ` $${amount}`;
  }
  console.log(`  → ${text}`);
}

/**
 * 渲染游戏结束画面
 * @param gameState - 最终游戏状态
 */
export function renderRemoteGameOver(gameState: SerializedGameState): void {
  console.log();
  subBoxTitle('游戏结束');
  console.log();

  const sortedPlayers = [...gameState.players].sort((a, b) => b.chips - a.chips);

  console.log('  最终排名:');
  console.log();

  for (let i = 0; i < sortedPlayers.length; i++) {
    const player = sortedPlayers[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    console.log(`  ${medal} ${i + 1}. ${player.name}: $${player.chips}`);
  }

  console.log();
}

/**
 * 渲染等待画面
 * @param message - 等待消息
 */
export function renderWaiting(message: string): void {
  console.log(`\n  ${message}...`);
}

/**
 * 渲染连接状态
 * @param status - 连接状态消息
 */
export function renderConnectionStatus(status: string): void {
  console.log(`  [连接] ${status}`);
}

/**
 * 渲染错误信息
 * @param error - 错误消息
 */
export function renderError(error: string): void {
  console.log(`  [错误] ${error}`);
}

function subBoxTitle(title: string): void {
  const BOX_W = 60;
  const INNER = BOX_W - 2;
  console.log(`  ╔${'═'.repeat(BOX_W)}╗`);
  console.log(`  ║ ${centerVisual(title, INNER)} ║`);
  console.log(`  ╚${'═'.repeat(BOX_W)}╝`);
}

/**
 * 获取游戏阶段的中文显示名称
 * @param phase - 游戏阶段
 * @returns 阶段的中文名称
 */
function getPhaseDisplay(phase: GamePhase): string {
  const phaseMap: Record<GamePhase, string> = {
    [GamePhase.PreFlop]: '翻牌前',
    [GamePhase.Flop]: '翻牌圈',
    [GamePhase.Turn]: '转牌圈',
    [GamePhase.River]: '河牌圈',
    [GamePhase.Showdown]: '摊牌'
  };

  return phaseMap[phase] || '未知';
}

/**
 * 格式化手牌描述
 * @param cards - 卡牌数组
 * @returns 手牌字符串
 */
export function formatHoleCards(cards: SerializedCard[]): string {
  if (cards.length < 2) {
    return '无效手牌';
  }

  return `${formatCard(cards[0])} ${formatCard(cards[1])}`;
}

function formatCard(card: SerializedCard): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit as import('../types/card').Suit]}`;
}
