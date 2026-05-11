/**
 * 扑克桌根布局组件
 * 自适应编排所有子组件
 */

import { Theme, themed } from '../theme';
import { renderHeader, HeaderData } from './header';
import { renderCommunityCards, CommunityCardsData } from './communityCards';
import { renderPotBox, PotData } from './pot';
import { renderPlayerSeat, PlayerSeatData, SeatDensity, densityForWidth } from './playerSeat';
import { PlayerSeatVM } from './types';
import { centerAnsi } from '../engine/ansi';

export { PlayerSeatVM } from './types';
export { densityForWidth } from './playerSeat';

export interface TableViewModel {
  phase: string;
  handNumber: number;
  communityCards: CommunityCardsData['cards'];
  potData: PotData;
  players: PlayerSeatVM[];
  currentPlayerIndex: number;
  dealerIndex: number;
  numPlayers: number;
  smallBlind: number;
  bigBlind: number;
}

export function renderTable(vm: TableViewModel, theme: Theme, width: number): string[] {
  const lines: string[] = [];

  // 1. 标题头
  const headerData: HeaderData = {
    phase: vm.phase,
    handNumber: vm.handNumber,
  };
  lines.push(...renderHeader(headerData, theme, width));
  lines.push('');

  // 2. 玩家布局: 上下排
  const playerDataList = buildPlayerSeatData(vm);
  const half = Math.ceil(vm.numPlayers / 2);
  const topPlayers = playerDataList.slice(0, half);
  const bottomPlayers = playerDataList.slice(half);

  // 计算每玩家可用宽度
  const maxPerRow = Math.max(topPlayers.length, bottomPlayers.length);
  const perPlayerW = Math.floor((width - 2) / Math.max(maxPerRow, 1));
  const density = densityForWidth(perPlayerW);

  // 3. 渲染上排玩家
  const topLines = renderPlayerRow(topPlayers, theme, perPlayerW, density, width);
  lines.push(...topLines);
  lines.push('');

  // 4. 牌桌中央区域(公共牌+底池) — 绿色封闭框体
  const tableW = Math.min(width - 4, 72);
  const boxW = Math.min(tableW + 4, width - 2);
  const boxInner = boxW - 2;
  const b = theme.tableBg;

  // 顶部边框
  lines.push(centerAnsi(themed('┏' + '━'.repeat(boxInner) + '┓', b), width));

  // 公共牌
  if (vm.communityCards.length > 0) {
    const ccData: CommunityCardsData = { cards: vm.communityCards };
    const ccLines = renderCommunityCards(ccData, theme, tableW);
    for (const line of ccLines) {
      const inner = centerAnsi(line, boxInner);
      lines.push(centerAnsi(themed('┃', b) + inner + themed('┃', b), width));
    }
  } else {
    const placeholder = centerAnsi(themed('[ 等待发牌 ]', theme.dim), boxInner);
    lines.push(centerAnsi(themed('┃', b) + placeholder + themed('┃', b), width));
  }

  // 空白行
  lines.push(centerAnsi(themed('┃', b) + ' '.repeat(boxInner) + themed('┃', b), width));

  // Pot信息
  const potLines = renderPotBox(vm.potData, theme, tableW);
  for (const line of potLines) {
    const inner = centerAnsi(line, boxInner);
    lines.push(centerAnsi(themed('┃', b) + inner + themed('┃', b), width));
  }

  // 底部边框
  lines.push(centerAnsi(themed('┗' + '━'.repeat(boxInner) + '┛', b), width));
  lines.push('');

  // 5. 下排玩家
  const bottomLines = renderPlayerRow(bottomPlayers, theme, perPlayerW, density, width);
  lines.push(...bottomLines);

  return lines;
}

function buildPlayerSeatData(vm: TableViewModel): PlayerSeatData[] {
  return vm.players.map(p => ({
    name: p.name,
    chips: p.chips,
    currentBet: p.currentBet,
    hand: p.hand || [],
    isActive: p.isActive,
    isAllIn: p.isAllIn,
    isCurrentPlayer: p.id === vm.currentPlayerIndex,
    isDealer: p.id === vm.dealerIndex,
    isSmallBlind: p.id === (vm.dealerIndex + 1) % vm.numPlayers,
    isBigBlind: p.id === (vm.dealerIndex + 2) % vm.numPlayers,
    isHuman: p.isHuman || false,
    isRemote: p.isRemote || false,
    isYou: p.isYou || false,
    showCards: p.showCards || false,
    showAllCards: p.showAllCards || false,
  }));
}

function renderPlayerRow(
  players: PlayerSeatData[],
  theme: Theme,
  perWidth: number,
  density: SeatDensity,
  totalWidth: number
): string[] {
  if (players.length === 0) return [];

  // 每个玩家渲染为独立的行数组
  const rendered = players.map(p => renderPlayerSeat(p, theme, perWidth, density));
  const maxLines = Math.max(...rendered.map(r => r.length));

  // 水平拼接：每玩家占perWidth宽列，join保持列对齐
  const result: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    const parts = rendered.map(r => r[i] || ' '.repeat(perWidth));
    const line = parts.join(' ');
    result.push(centerAnsi(line, totalWidth));
  }

  return result;
}
