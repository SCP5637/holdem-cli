/**
 * 文本化 UI 渲染系统
 * 显示游戏状态、卡牌、玩家信息和下注详情
 */

import { GameState, Player, GamePhase } from '../types/game';
import { renderCards } from './cardRenderer';

/**
 * 清空控制台屏幕
 */
export function clearScreen(): void {
  console.clear();
}

/**
 * 将完整的游戏状态渲染到控制台
 * @param state - 当前游戏状态
 * @param showAllCards - 是否显示所有玩家的卡牌
 */
export function renderGameState(state: GameState, showAllCards: boolean = false): void {
  clearScreen();
  renderHeader(state);
  renderCommunityCards(state);
  renderPot(state);
  renderPlayers(state, showAllCards);
  renderCurrentPlayer(state);
}

/**
 * 渲染游戏标题和阶段信息
 * @param state - 当前游戏状态
 */
function renderHeader(state: GameState): void {
  const phase = getPhaseDisplay(state.currentPhase);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║                    德州扑克 - ${phase}                      ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
}

/**
 * 渲染公共牌
 * @param state - 当前游戏状态
 */
function renderCommunityCards(state: GameState): void {
  console.log('  公共牌:');
  console.log();

  if (state.communityCards.length === 0) {
    console.log('  [尚未发牌]');
  } else {
    const cardRender = renderCards(state.communityCards);
    const lines = cardRender.split('\n');
    for (const line of lines) {
      console.log('  ' + line);
    }
  }

  console.log();
}

/**
 * 渲染当前底池和下注信息
 * @param state - 当前游戏状态
 */
function renderPot(state: GameState): void {
  console.log('  ┌────────────────────────────────────────────────────────────┐');
  console.log(`  │  底池: $${state.pot.toString().padEnd(46 - state.pot.toString().length)}│`);
  console.log(`  │  当前下注: $${state.currentBet.toString().padEnd(42 - state.currentBet.toString().length)}│`);
  console.log('  └────────────────────────────────────────────────────────────┘');
  console.log();
}

/**
 * 渲染所有玩家及其信息
 * @param state - 当前游戏状态
 * @param showAllCards - 是否显示所有玩家的卡牌
 */
function renderPlayers(state: GameState, showAllCards: boolean): void {
  console.log('  玩家:');
  console.log();

  for (const player of state.players) {
    renderPlayer(player, state, showAllCards);
  }
}

/**
 * 渲染单个玩家的信息
 * @param player - 要渲染的玩家
 * @param state - 当前游戏状态
 * @param showCards - 是否显示该玩家的卡牌
 */
function renderPlayer(player: Player, state: GameState, showCards: boolean): void {
  const isCurrentPlayer = state.currentPlayerIndex === player.id;
  const isDealer = state.dealerIndex === player.id;
  const isSmallBlind = (state.dealerIndex + 1) % state.players.length === player.id;
  const isBigBlind = (state.dealerIndex + 2) % state.players.length === player.id;

  let statusIndicator = '  ';
  if (isCurrentPlayer) statusIndicator = '▶ ';

  let positionIndicator = '';
  if (isDealer) positionIndicator = ' [庄]';
  else if (isSmallBlind) positionIndicator = ' [小盲]';
  else if (isBigBlind) positionIndicator = ' [大盲]';

  let playerStatus = '';
  if (!player.isActive) playerStatus = ' (已弃牌)';
  else if (player.isAllIn) playerStatus = ' (全押)';

  const nameLine = `${statusIndicator}${player.name}${positionIndicator}${playerStatus}`;
  const chipsLine = `     筹码: $${player.chips}  |  当前下注: $${player.currentBet}`;

  console.log(`  ${nameLine}`);
  console.log(chipsLine);

  if (player.hand.length > 0 && (showCards || player.isHuman || !player.isActive)) {
    const cardRender = renderCards(player.hand, !showCards && !player.isHuman ? [0, 1] : []);
    const lines = cardRender.split('\n');
    for (const line of lines) {
      console.log('     ' + line);
    }
  }

  console.log();
}

/**
 * 渲染当前玩家信息
 * @param state - 当前游戏状态
 */
function renderCurrentPlayer(state: GameState): void {
  const player = state.players[state.currentPlayerIndex];

  if (!player.isHuman && player.isActive && !player.isAllIn) {
    console.log(`  ${player.name} 正在思考...`);
  }
}

/**
 * 渲染手牌结果
 * @param state - 当前游戏状态
 * @param winners - 获胜玩家ID数组
 * @param handDescriptions - 玩家ID到手牌描述的映射
 */
export function renderHandResult(
  state: GameState,
  winners: number[],
  handDescriptions: Map<number, string>
): void {
  console.log();
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║                         手牌结果                             ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log();

  for (const player of state.players) {
    if (player.isActive) {
      const handDesc = handDescriptions.get(player.id) || '未知';
      const isWinner = winners.includes(player.id);
      const indicator = isWinner ? '★ ' : '  ';
      console.log(`  ${indicator}${player.name}: ${handDesc}`);
    }
  }

  console.log();

  if (winners.length === 1) {
    const winner = state.players.find(p => p.id === winners[0])!;
    console.log(`  获胜者: ${winner.name} 赢得 $${state.pot}`);
  } else {
    const winnerNames = winners.map(id => state.players.find(p => p.id === id)!.name).join(', ');
    const share = Math.floor(state.pot / winners.length);
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
export function renderAction(playerName: string, action: string, amount?: number): void {
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
 * @param state - 最终游戏状态
 */
export function renderGameOver(state: GameState): void {
  console.log();
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║                         游戏结束                             ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log();

  const sortedPlayers = [...state.players].sort((a, b) => b.chips - a.chips);

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

  return phaseMap[phase];
}
