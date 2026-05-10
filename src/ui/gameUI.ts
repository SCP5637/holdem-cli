/**
 * GameUI — 主UI整合类
 * 拥有Screen、InputHandler、Theme。对外提供游戏渲染和输入方法。
 * 同时处理GameState和SerializedGameState。
 */

import { Screen } from './engine/screen';
import { InputHandler } from './engine/input';
import { Theme, defaultTheme, themed } from './theme';
import { renderTable, TableViewModel } from './components/table';
import { renderActionPanel, renderRaiseInput } from './components/actionPanel';
import { renderHandResult, HandResultPlayer } from './components/handResult';
import { renderGameOver, GameOverPlayer } from './components/gameOver';
import { renderProgressBar } from './components/spinner';
import { renderActionLog, ActionLogEntry } from './components/actionLog';
import { renderWaitPanel } from './components/waitPanel';
import { centerAnsi } from './engine/ansi';
import { getTerminalSize, isTTY } from './terminal';

import { GameState, GamePhase, PlayerAction } from '../types/game';
import { SerializedGameState } from '../types/network';
import { Card, Suit, Rank } from '../types/card';

type OverlayState =
  | { type: 'none' }
  | { type: 'action-panel'; actions: PlayerAction[]; selectedIndex?: number }
  | { type: 'raise-input'; text: string }
  | { type: 'enter-prompt'; message?: string }
  | { type: 'enter-or-zero'; message?: string };

const PHASE_NAMES: Record<string, string> = {
  preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌'
};

function calcBottomPanelH(size: { height: number }): number {
  if (size.height >= 30) return 8;
  if (size.height >= 24) return 7;
  return 6;
}

function calcHalfWidth(totalWidth: number): number {
  return Math.floor((totalWidth - 1) / 2);
}

function calcLogWidth(totalWidth: number): number {
  if (totalWidth < 60) return 0;
  return calcHalfWidth(totalWidth);
}

function calcPanelWidth(totalWidth: number): number {
  return calcHalfWidth(totalWidth);
}

export class GameUI {
  private screen: Screen;
  private input: InputHandler;
  private theme: Theme;
  private mySeatIdx = -1;
  private fallbackMode: boolean;
  private lastState: GameState | SerializedGameState | null = null;
  private lastShowAllCards = false;
  private overlayState: OverlayState = { type: 'none' };
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private actionLogScroll = 0;
  private waitFrame = 0;
  private waitTimer: ReturnType<typeof setInterval> | null = null;
  private waitMsg = '';
  private systemLog: ActionLogEntry[] = [];

  constructor(screen?: Screen, input?: InputHandler) {
    this.screen = screen ?? new Screen();
    this.input = input ?? new InputHandler();
    this.theme = defaultTheme;
    this.fallbackMode = !isTTY();
  }

  // ============ 生命周期 ============

  init(): void {
    if (this.fallbackMode) return;
    this.screen.enter();
    this.screen.onResize(() => this.handleResize());
    this.input.enableRawMode();
    this.input.onKey((key) => {
      if (key.name === 'up') {
        this.actionLogScroll++;
        if (this.lastState) this.renderGame(this.lastState, this.lastShowAllCards);
      } else if (key.name === 'down') {
        this.actionLogScroll = Math.max(0, this.actionLogScroll - 1);
        if (this.lastState) this.renderGame(this.lastState, this.lastShowAllCards);
      } else if (key.name === 'f' && !key.ctrl) {
        // 强制刷新重新计算终端尺寸
        this.screen.width = process.stdout.columns || 80;
        this.screen.height = process.stdout.rows || 24;
        this.screen.forceFullNext();
        if (this.lastState) this.renderGame(this.lastState, this.lastShowAllCards);
      }
    });
  }

  destroy(): void {
    this.destroyTimers();
    if (this.fallbackMode) return;
    this.input.removeAllListeners();
    this.input.disableRawMode();
    this.screen.exit();
  }

  setMySeat(index: number): void {
    this.mySeatIdx = index;
  }

  private handleResize(): void {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null;
      if (this.lastState) {
        this.screen.forceFullNext();
        this.renderGame(this.lastState, this.lastShowAllCards);
        this.reRenderOverlay();
      }
    }, 150);
  }

  /** resize后重绘当前叠加层 — 底部面板由renderGame统一渲染 */
  private reRenderOverlay(): void {
    // renderGame handles all overlay rendering via the bottom panel
    // This method kept for compatibility; forceFullNext ensures clean state
    this.screen.forceFullNext();
  }

  // ============ 游戏渲染 ============

  /** 渲染游戏主画面 */
  renderGame(state: GameState | SerializedGameState, showAllCards = false): void {
    this.lastState = state;
    this.lastShowAllCards = showAllCards;

    if (this.fallbackMode) {
      this.fallbackRenderGame(state, showAllCards);
      return;
    }

    const vm = this.toViewModel(state, showAllCards);
    const size = getTerminalSize();
    const bottomH = calcBottomPanelH(size);
    const logW = calcLogWidth(size.width);
    const tableMax = size.height - bottomH;

    const tableLines = renderTable(vm, this.theme, size.width);

    // Table area
    for (let i = 0; i < Math.min(tableLines.length, tableMax); i++) {
      this.screen.setLine(i, tableLines[i]);
    }
    for (let i = tableLines.length; i < tableMax; i++) {
      this.screen.setLine(i, '');
    }

    // Bottom panel
    const bottomStart = tableMax;

    if (logW > 0) {
      const panelW = calcPanelWidth(size.width);
      const logLines = this.renderLogPanel(state, logW, bottomH);
      const rightLines = this.renderRightPanel(panelW, bottomH);

      for (let i = 0; i < bottomH; i++) {
        const left = logLines[i] || '';
        const right = rightLines[i] || '';
        this.screen.setLine(bottomStart + i, left + ' ' + right);
      }
    } else {
      const rightLines = this.renderRightPanel(size.width, bottomH);
      for (let i = 0; i < bottomH; i++) {
        this.screen.setLine(bottomStart + i, rightLines[i] || '');
      }
    }

    this.screen.render();
  }

  /** 底部左侧：行动日志 */
  private renderLogPanel(state: GameState | SerializedGameState, width: number, height: number): string[] {
    const entries: ActionLogEntry[] = (state as any).actionLog
      ? (state as any).actionLog.map((a: any) => ({
          playerName: a.playerName,
          action: a.action,
          amount: a.amount,
          time: a.time,
        }))
      : [];
    return renderActionLog(
      { entries, systemEntries: this.systemLog, scrollOffset: this.actionLogScroll },
      this.theme, width, height
    );
  }

  /** 添加系统消息到日志 (阶段切换、手牌开始等) */
  addSystemMessage(text: string): void {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    this.systemLog.push({
      playerName: '系统',
      action: text,
      time: `{${h}:${m}:${s}}`,
    });
  }

  /** 清空系统日志 (每手牌开始时调用) */
  clearSystemLog(): void {
    this.systemLog = [];
  }

  /** 底部右侧：根据overlay状态 */
  private renderRightPanel(width: number, height: number): string[] {
    switch (this.overlayState.type) {
      case 'action-panel':
        return renderActionPanel({ actions: this.overlayState.actions, selectedIndex: this.overlayState.selectedIndex }, this.theme, width, height);
      case 'raise-input':
        return renderRaiseInput(this.overlayState.text, this.theme, width, height);
      case 'enter-prompt': {
        const msg = this.overlayState.message || '按 Enter 键继续...';
        return renderWaitPanel(0, msg, this.theme, width, height);
      }
      case 'enter-or-zero': {
        const msg = this.overlayState.message || '按 Enter 继续，或按 0 结束';
        return renderWaitPanel(0, msg, this.theme, width, height);
      }
      default:
        return renderWaitPanel(this.waitFrame, this.waitMsg, this.theme, width, height);
    }
  }

  /** 渲染手牌结果 */
  renderHandResult(winners: number[], handDescs: Map<number, string>, state: GameState | SerializedGameState): void {
    const totalPot = this.getTotalPot(state);
    const players: HandResultPlayer[] = ('players' in state ? state.players : (state as SerializedGameState).players)
      .filter((p: any) => p.isActive)
      .map((p: any) => ({
        name: p.name,
        handDescription: handDescs.get(p.id) || '未知',
        isWinner: winners.includes(p.id),
      }));

    if (this.fallbackMode) {
      // Fallback用console.log
      console.log();
      for (const p of players) {
        const star = p.isWinner ? '★ ' : '  ';
        console.log(`  ${star}${p.name}: ${p.handDescription}`);
      }
      console.log();
      return;
    }

    const size = getTerminalSize();
    const lines = renderHandResult(players, totalPot, this.theme, size.width);
    const startRow = Math.max(0, size.height - lines.length - 5);
    for (let i = 0; i < lines.length; i++) {
      this.screen.setLine(startRow + i, lines[i]);
    }
    this.screen.render();
  }

  /** 渲染游戏结束 */
  renderGameOver(state: GameState | SerializedGameState): void {
    const players: GameOverPlayer[] = ('players' in state ? state.players : (state as SerializedGameState).players)
      .map((p: any) => ({ name: p.name, chips: p.chips }));

    if (this.fallbackMode) {
      console.log();
      const sorted = [...players].sort((a, b) => b.chips - a.chips);
      for (let i = 0; i < sorted.length; i++) {
        console.log(`  ${i + 1}. ${sorted[i].name}: $${sorted[i].chips}`);
      }
      return;
    }

    const size = getTerminalSize();
    const lines = renderGameOver(players, this.theme, size.width);
    for (let i = 0; i < lines.length; i++) {
      this.screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      this.screen.setLine(i, '');
    }
    this.screen.render();
  }

  /** 显示玩家行动消息 — 行动由renderGame的actionLog自动展示 */
  showAction(_playerName: string, _action: string, _amount?: number): void {
    if (this.fallbackMode) {
      const actionMap: Record<string, string> = {
        fold: '弃牌', check: '过牌', call: '跟注', raise: '加注', allin: '全押'
      };
      const actionText = actionMap[_action] || _action;
      console.log(`  → ${_playerName} ${actionText}`);
      return;
    }
    // actionLog已含此动作，下一帧renderGame自动展示
    this.screen.forceFullNext();
  }

  /** 屏幕底部显示消息 */
  showMessage(msg: string, color?: string): void {
    if (this.fallbackMode) {
      console.log(`  ${msg}`);
      return;
    }

    const size = getTerminalSize();
    const c = color || this.theme.dim;
    const line = centerAnsi(themed(msg, c), size.width);
    const bottomH = calcBottomPanelH(size);
    this.screen.setLine(size.height - bottomH - 1, line);
    this.screen.render();
    this.screen.forceFullNext();
  }

  // ============ 动画 ============

  /** 启动Wait动画 — 用于非己方回合等待 */
  startWaitAnimation(message?: string): void {
    this.waitMsg = message || '';
    this.waitFrame = 0;

    if (this.waitTimer) return;

    this.waitTimer = setInterval(() => {
      this.waitFrame++;
      if (this.lastState) {
        this.renderGame(this.lastState, this.lastShowAllCards);
      }
    }, 200);
  }

  /** 停止Wait动画 */
  stopWaitAnimation(): void {
    if (this.waitTimer) {
      clearInterval(this.waitTimer);
      this.waitTimer = null;
    }
    this.screen.forceFullNext();
  }

  /** 销毁时清理所有定时器 */
  private destroyTimers(): void {
    this.stopWaitAnimation();
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }

  /** 阶段过渡动画。清屏后显示进度条，避免旧牌桌内容残留 */
  async showPhaseTransition(durationMs: number, fromPhase?: string, toPhase?: string): Promise<void> {
    if (this.fallbackMode) {
      process.stdout.write('  Entering next phase...\n');
      await sleep(1000);
      return;
    }

    const steps = 20;
    const interval = durationMs / steps;
    const size = getTerminalSize();
    const baseRow = Math.floor(size.height / 2) - 2;

    // 清屏确保进度条在干净背景上
    this.screen.reset();

    const fromLabel = PHASE_NAMES[fromPhase || ''] || fromPhase || '';
    const toLabel = PHASE_NAMES[toPhase || ''] || toPhase || '';

    for (let i = 0; i <= steps; i++) {
      const progress = i / steps;
      const lines = renderProgressBar(progress, fromLabel, toLabel, this.theme, size.width);

      for (let j = 0; j < lines.length; j++) {
        this.screen.setLine(baseRow + j, lines[j]);
      }
      this.screen.render();

      await sleep(interval);
    }
  }

  // ============ 输入 ============

  /** 等待玩家从可用动作中选择 — 左右键切换/数字跳转/回车确认，上下键留给日志滚动 */
  async waitForAction(actions: PlayerAction[]): Promise<{ action: PlayerAction; amount?: number }> {
    const actionOrder = [PlayerAction.Fold, PlayerAction.Check, PlayerAction.Call, PlayerAction.Raise, PlayerAction.AllIn];
    const ordered = actionOrder.filter(a => actions.includes(a));
    let selectedIdx = 0;

    const reRender = () => {
      this.overlayState = { type: 'action-panel', actions: ordered, selectedIndex: selectedIdx };
      if (this.lastState) this.renderGame(this.lastState, this.lastShowAllCards);
    };

    // 自定义按键处理，只响应 left/right/数字/回车，up/down 留给持久化handler滚动日志
    const waitForActionKey = (): Promise<'left' | 'right' | 'enter' | 'escape' | number> => {
      return new Promise((resolve) => {
        const handler = (key: import('./engine/input').KeyEvent) => {
          if (key.name === 'return' || key.name === 'enter') {
            cleanup();
            resolve('enter');
            return;
          }
          if (key.name === 'escape') {
            cleanup();
            resolve('escape');
            return;
          }
          if (key.name === 'left') {
            cleanup();
            resolve('left');
            return;
          }
          if (key.name === 'right') {
            cleanup();
            resolve('right');
            return;
          }
          const num = parseInt(key.name, 10);
          if (!isNaN(num) && num >= 0 && num <= ordered.length) {
            cleanup();
            resolve(num);
            return;
          }
          // up/down 不处理，透传给持久化handler滚动日志
        };

        const cleanup = () => {
          this.input.removeCallback(handler);
        };

        this.input.onKey(handler);
      });
    };

    try {
      reRender();

      while (true) {
        const sel = await waitForActionKey();

        if (sel === 'left') {
          selectedIdx = (selectedIdx - 1 + ordered.length) % ordered.length;
          reRender();
          continue;
        }
        if (sel === 'right') {
          selectedIdx = (selectedIdx + 1) % ordered.length;
          reRender();
          continue;
        }

        if (typeof sel === 'number') {
          if (sel >= 1 && sel <= ordered.length) {
            selectedIdx = sel - 1;
            reRender();
          }
          continue;
        }

        if (sel === 'enter') {
          const chosen = ordered[selectedIdx];

          if (chosen === PlayerAction.Raise) {
            const amount = await this.waitForRaiseAmount();
            if (amount > 0) {
              this.overlayState = { type: 'none' };
              return { action: chosen, amount };
            }
            reRender();
            continue;
          }

          this.overlayState = { type: 'none' };
          return { action: chosen };
        }

        // sel === 'escape' — 忽略，继续等待
      }
    } finally {
      this.overlayState = { type: 'none' };
    }
  }

  /** 等待加注金额输入 */
  private async waitForRaiseAmount(): Promise<number> {
    let text = '';

    const reRender = () => {
      if (this.lastState) this.renderGame(this.lastState, this.lastShowAllCards);
    };

    this.overlayState = { type: 'raise-input', text: '' };
    reRender();

    const result = await this.input.readString(text, 10, (newText: string) => {
      text = newText;
      this.overlayState = { type: 'raise-input', text: newText };
      reRender();
    });

    if (result.cancelled || result.text.length === 0) {
      return -1;
    }
    const num = parseInt(result.text, 10);
    return isNaN(num) ? -1 : num;
  }

  /** 等待回车，返回是否按了0 */
  async waitForEnterOrZero(message?: string): Promise<boolean> {
    if (this.fallbackMode) {
      const rl = await import('readline');
      const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
      return new Promise(resolve => {
        iface.question(message || '按 Enter 继续，或输入 0 结束...', (answer) => {
          iface.close();
          resolve(answer.trim() === '0');
        });
      });
    }

    let handler: ((key: import('./engine/input').KeyEvent) => void) | null = null;
    try {
      this.overlayState = { type: 'enter-or-zero', message };
      if (this.lastState) this.renderGame(this.lastState, this.lastShowAllCards);

      return await new Promise((resolve) => {
        handler = (key: import('./engine/input').KeyEvent) => {
          if (key.ctrl && key.name === 'c') {
            resolve(true);
            return;
          }
          if (key.name === 'return' || key.name === 'enter') {
            resolve(false);
            return;
          }
          if (key.name === '0') {
            resolve(true);
          }
        };
        this.input.onKey(handler);
      });
    } finally {
      if (handler) this.input.removeCallback(handler);
      this.overlayState = { type: 'none' };
    }
  }

  /** 等待回车 */
  async waitForEnter(message?: string): Promise<void> {
    if (this.fallbackMode) {
      const rl = await import('readline');
      const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
      return new Promise(resolve => {
        iface.question(message || '按 Enter 键继续...', () => {
          iface.close();
          resolve();
        });
      });
    }

    try {
      this.overlayState = { type: 'enter-prompt', message };
      if (this.lastState) this.renderGame(this.lastState, this.lastShowAllCards);

      await this.input.waitForEnter();
    } finally {
      this.overlayState = { type: 'none' };
    }
  }

  // ============ 内部方法 ============

  private toViewModel(state: GameState | SerializedGameState, showAllCards: boolean): TableViewModel {
    const isSerialized = !('communityCards' in state && Array.isArray((state as any).communityCards) && ((state as any).communityCards.length === 0 || typeof (state as any).communityCards[0].suit === 'string'));

    let players: any[];
    let communityCards: any[];
    let phase: string;
    let handNumber: number;

    // Detect GameState vs SerializedGameState: GameState has 'deck'
    if ('deck' in state) {
      const gs = state as GameState;
      players = gs.players;
      communityCards = gs.communityCards || [];
      phase = (gs.currentPhase as string)?.toLowerCase() || 'preflop';
      handNumber = gs.handNumber;
    } else {
      const ss = state as SerializedGameState;
      players = ss.players;
      communityCards = ss.communityCards || [];
      phase = (ss.currentPhase as string)?.toLowerCase() || 'preflop';
      handNumber = (ss as any).handNumber || 1;
    }

    const pot = 'pot' in state ? state.pot : (state as SerializedGameState).pot;
    const currentBet = 'currentBet' in state ? state.currentBet : (state as SerializedGameState).currentBet;
    const sidePots = (state as any).sidePots || [];

    return {
      phase,
      handNumber,
      communityCards: communityCards.map((c: any) =>
        typeof c.suit === 'string' ? c : { suit: c.suit, rank: c.rank }
      ),
      potData: {
        pot,
        sidePots,
        currentBet,
      },
      players: players.map((p: any) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        currentBet: p.currentBet || 0,
        hand: (p.hand || []).map((c: any) =>
          typeof c.suit === 'string' ? c : { suit: c.suit, rank: c.rank }
        ),
        isActive: p.isActive,
        isAllIn: p.isAllIn || false,
        isHuman: p.isHuman || false,
        isRemote: p.isRemote || false,
        isYou: this.mySeatIdx >= 0 && p.id === this.mySeatIdx,
        showCards: showAllCards || (this.mySeatIdx >= 0 && p.id === this.mySeatIdx),
        isDisconnected: (p as any).isDisconnected || false,
      })),
      currentPlayerIndex: (state as any).currentPlayerIndex || 0,
      dealerIndex: (state as any).dealerIndex || 0,
      numPlayers: players.length,
      smallBlind: (state as any).smallBlind || 10,
      bigBlind: (state as any).bigBlind || 20,
    };
  }

  private getTotalPot(state: GameState | SerializedGameState): number {
    const pot = 'pot' in state ? state.pot : (state as SerializedGameState).pot;
    const sidePots = (('sidePots' in state ? state.sidePots : (state as SerializedGameState).sidePots) || []) as Array<{ amount: number }>;
    return pot + sidePots.reduce((s, sp) => s + sp.amount, 0);
  }

  /** 非TTY降级渲染 */
  private fallbackRenderGame(state: GameState | SerializedGameState, showAllCards: boolean): void {
    const vm = this.toViewModel(state, showAllCards);
    console.clear();
    console.log(`--- 德州扑克 - ${vm.phase}  #${vm.handNumber} ---`);
    console.log(`底池: $${vm.potData.pot + vm.potData.sidePots.reduce((s, sp) => s + sp.amount, 0)}`);
    for (const p of vm.players) {
      const cursor = p.isActive ? '  ' : 'X ';
      console.log(`${cursor}${p.name}: $${p.chips}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
