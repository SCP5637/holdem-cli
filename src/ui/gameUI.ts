/**
 * GameUI — 主UI整合类
 * 拥有Screen、InputHandler、Theme。对外提供游戏渲染和输入方法。
 * 同时处理GameState和SerializedGameState。
 */

import { Screen } from './engine/screen';
import { InputHandler } from './engine/input';
import { Theme, defaultTheme, themed, chipText } from './theme';
import { renderTable, TableViewModel } from './components/table';
import { renderActionPanel, renderRaiseInput } from './components/actionPanel';
import { renderHandResult, HandResultPlayer } from './components/handResult';
import { renderGameOver, GameOverPlayer } from './components/gameOver';
import { renderSpinner, renderProgressBar } from './components/spinner';
import { centerAnsi } from './engine/ansi';
import { getTerminalSize, isTTY } from './terminal';

import { GameState, GamePhase, PlayerAction } from '../types/game';
import { SerializedGameState } from '../types/network';
import { Card, Suit, Rank } from '../types/card';

type OverlayState =
  | { type: 'none' }
  | { type: 'action-panel'; actions: PlayerAction[] }
  | { type: 'raise-input'; text: string }
  | { type: 'enter-prompt'; message?: string }
  | { type: 'enter-or-zero'; message?: string };

const PHASE_NAMES: Record<string, string> = {
  preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌'
};

export class GameUI {
  private screen: Screen;
  private input: InputHandler;
  private theme: Theme;
  private mySeatIdx = -1;
  private spinnerTimer: ReturnType<typeof setInterval> | null = null;
  private spinnerFrame = 0;
  private spinnerMsg: string | null = null;
  private fallbackMode: boolean;
  private lastState: GameState | SerializedGameState | null = null;
  private lastShowAllCards = false;
  private overlayState: OverlayState = { type: 'none' };
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

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
  }

  destroy(): void {
    this.stopSpinner();
    if (this.fallbackMode) return;
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

  /** resize后重绘当前叠加层 */
  private reRenderOverlay(): void {
    const size = getTerminalSize();
    switch (this.overlayState.type) {
      case 'action-panel': {
        const panelLines = renderActionPanel({ actions: this.overlayState.actions }, this.theme, size.width);
        const panelStart = size.height - panelLines.length;
        for (let i = 0; i < panelLines.length; i++) {
          this.screen.setLine(panelStart + i, panelLines[i]);
        }
        this.screen.render();
        break;
      }
      case 'raise-input': {
        const lines = renderRaiseInput(this.overlayState.text, this.theme, size.width);
        const start = size.height - lines.length;
        for (let i = 0; i < lines.length; i++) {
          this.screen.setLine(start + i, lines[i]);
        }
        this.screen.render();
        break;
      }
      case 'enter-prompt': {
        const msg = this.overlayState.message || '按 Enter 键继续...';
        const line = centerAnsi(themed(msg, this.theme.dim), size.width);
        this.screen.setLine(size.height - 1, line);
        this.screen.render();
        break;
      }
      case 'enter-or-zero': {
        const msg = this.overlayState.message || '按 Enter 继续，或按 0 结束...';
        const line = centerAnsi(themed(msg, this.theme.dim), size.width);
        this.screen.setLine(size.height - 1, line);
        this.screen.render();
        break;
      }
    }
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
    const lines = renderTable(vm, this.theme, size.width);

    for (let i = 0; i < lines.length; i++) {
      this.screen.setLine(i, lines[i]);
    }
    for (let i = lines.length; i < size.height; i++) {
      this.screen.setLine(i, '');
    }

    this.screen.render();
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

  /** 显示玩家行动消息 */
  showAction(playerName: string, action: string, amount?: number): void {
    const actionMap: Record<string, string> = {
      fold: '弃牌', check: '过牌', call: '跟注', raise: '加注', allin: '全押'
    };
    const actionText = actionMap[action] || action;
    let text = `  → ${playerName} ${actionText}`;
    if (amount !== undefined && amount > 0) {
      text += ` ${chipText(amount)}`;
    }

    if (this.fallbackMode) {
      console.log(text);
      return;
    }

    const size = getTerminalSize();
    const line = centerAnsi(themed(text, this.theme.accent), size.width);
    this.screen.setLine(size.height - 1, line);
    this.screen.render();
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
    this.screen.setLine(size.height - 1, line);
    this.screen.render();
    this.screen.forceFullNext();
  }

  // ============ 动画 ============

  /** 启动旋转动画，返回停止函数 */
  startSpinner(message: string): () => void {
    if (this.fallbackMode) {
      process.stdout.write(`  ${message}...`);
      return () => { process.stdout.write(' done\n'); };
    }

    this.spinnerMsg = message;
    this.spinnerFrame = 0;

    this.spinnerTimer = setInterval(() => {
      this.spinnerFrame++;
      if (this.spinnerMsg) {
        const size = getTerminalSize();
        const line = renderSpinner(this.spinnerMsg, this.spinnerFrame, this.theme, size.width);
        this.screen.setLine(size.height - 1, line);
        this.screen.render();
      }
    }, 150);

    return () => this.stopSpinner();
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
    this.spinnerMsg = null;
    this.screen.forceFullNext();
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

  /** 等待玩家从可用动作中选择 */
  async waitForAction(actions: PlayerAction[]): Promise<{ action: PlayerAction; amount?: number }> {
    const actionOrder = [PlayerAction.Fold, PlayerAction.Check, PlayerAction.Call, PlayerAction.Raise, PlayerAction.AllIn];
    const ordered = actionOrder.filter(a => actions.includes(a));

    this.input.enableRawMode();
    const size = getTerminalSize();

    try {
      // 渲染动作面板
      this.overlayState = { type: 'action-panel', actions: ordered };
      const panelLines = renderActionPanel({ actions: ordered }, this.theme, size.width);
      const panelStart = size.height - panelLines.length;
      for (let i = 0; i < panelLines.length; i++) {
        this.screen.setLine(panelStart + i, panelLines[i]);
      }
      this.screen.render();

      while (true) {
        const num = await this.input.waitForNumber(ordered.length);
        if (num < 1 || num > ordered.length) continue;

        const chosen = ordered[num - 1]; // waitForNumber returns 1-indexed

        if (chosen === PlayerAction.Raise) {
          // 清除动作面板区域，防止残留边框混入加注输入
          this.clearBottomArea(panelStart, size.height);
          this.screen.render();

          const amount = await this.waitForRaiseAmount();
          if (amount > 0) {
            this.clearBottomArea(size.height - 6, size.height);
            this.screen.render();
            return { action: chosen, amount };
          }
          // 取消加注，重新渲染面板并恢复叠加状态
          this.overlayState = { type: 'action-panel', actions: ordered };
          const newPanel = renderActionPanel({ actions: ordered }, this.theme, size.width);
          const newStart = size.height - newPanel.length;
          for (let i = 0; i < newPanel.length; i++) {
            this.screen.setLine(newStart + i, newPanel[i]);
          }
          this.screen.render();
          continue;
        }

        // 非加注动作：清除面板区域再返回
        this.clearBottomArea(panelStart, size.height);
        this.screen.render();
        return { action: chosen };
      }
    } finally {
      this.overlayState = { type: 'none' };
      this.input.disableRawMode();
    }
  }

  /** 等待加注金额输入 */
  private async waitForRaiseAmount(): Promise<number> {
    let text = '';
    const size = getTerminalSize();

    const render = (currentText: string) => {
      const lines = renderRaiseInput(currentText, this.theme, size.width);
      const start = size.height - lines.length;
      for (let i = 0; i < lines.length; i++) {
        this.screen.setLine(start + i, lines[i]);
      }
      this.screen.render();
    };

    this.overlayState = { type: 'raise-input', text: '' };
    render(text);

    const result = await this.input.readString(text, 10, (newText: string) => {
      text = newText;
      this.overlayState = { type: 'raise-input', text: newText };
      render(text);
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

    this.input.enableRawMode();
    try {
      this.overlayState = { type: 'enter-or-zero', message };
      const size = getTerminalSize();
      const msg = message || '按 Enter 继续，或按 0 结束...';
      const line = centerAnsi(themed(msg, this.theme.dim), size.width);
      this.screen.setLine(size.height - 1, line);
      this.screen.render();

      return new Promise((resolve) => {
        const handler = (key: import('./engine/input').KeyEvent) => {
          if (key.ctrl && key.name === 'c') {
            resolve(true); // Ctrl+C = end game
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
      this.overlayState = { type: 'none' };
      this.input.disableRawMode();
    }
  }

  /** 等待回车 */
  async waitForEnter(message?: string): Promise<void> {
    if (this.fallbackMode) {
      // Use readline for fallback
      const rl = await import('readline');
      const iface = rl.createInterface({ input: process.stdin, output: process.stdout });
      return new Promise(resolve => {
        iface.question(message || '按 Enter 键继续...', () => {
          iface.close();
          resolve();
        });
      });
    }

    this.input.enableRawMode();
    try {
      this.overlayState = { type: 'enter-prompt', message };
      const size = getTerminalSize();
      const msg = message || '按 Enter 键继续...';
      const line = centerAnsi(themed(msg, this.theme.dim), size.width);
      this.screen.setLine(size.height - 1, line);
      this.screen.render();

      await this.input.waitForEnter();
    } finally {
      this.overlayState = { type: 'none' };
      this.input.disableRawMode();
    }
  }

  /** 清除屏幕底部指定区域(用于移除叠加UI) */
  private clearBottomArea(fromRow: number, toRow: number): void {
    for (let i = fromRow; i < toRow; i++) {
      this.screen.setLine(i, '');
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
        showCards: showAllCards || p.isHuman || (this.mySeatIdx >= 0 && p.id === this.mySeatIdx),
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
