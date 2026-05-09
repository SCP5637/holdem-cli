/**
 * 德州扑克游戏主入口
 * 协调游戏初始化、主游戏循环和手牌执行
 * 支持本地游戏、主机模式和客户端模式
 */

import { GameState, GameConfig, PlayerAction, GamePhase, Player, AIDifficulty } from './types/game';
import { createGame, executeAction, nextPlayer, isBettingRoundComplete, advancePhase, determineHandWinners, awardPot, isHandOver, prepareNewHand, getCurrentPlayer, getAvailableActions } from './core/gameState';
import { getAIAction, recordPlayerAction } from './core/aiPlayer';
import { getLLMAction } from './core/llmPlayer';
import { evaluateHand } from './core/handEvaluator';
import {
  getGameConfig,
  waitForEnter,
  selectRunMode,
  configureHost,
  configureClient,
  selectSeatAndName,
  getInput,
  getNumberInput
} from './ui/inputHandler';
import { GameUI } from './ui/gameUI';
import { centerVisual } from './ui/terminal';
import { loadLLMPresets } from './core/llmPresetStore';
import { LLMPreset } from './types/llm';
import { logger } from './core/logger';
import { Card, SUIT_SYMBOLS } from './types/card';
import { RunMode, HostConfig, ClientConfig, SeatType, SerializedGameState } from './types/network';
import { GameServer } from './network/server';
import { GameClient } from './network/client';
import { MenuUI } from './ui/menu/menuUI';
import { tuiHostLobby, HostLobbySeat } from './ui/inputHandler';

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MIN_PLAYERS = 2;

// 全局变量用于联机模式
let gameUI: GameUI | null = null;
let gameServer: GameServer | null = null;
let gameClient: GameClient | null = null;
let isHostMode = false;
let isClientMode = false;
let remoteActionPromise: { resolve: (value: { action: PlayerAction; amount?: number } | null) => void; reject: (reason?: unknown) => void } | null = null;

/**
 * 游戏主入口
 */
async function main(): Promise<void> {
  const debugMode = process.argv.includes('--debug') || process.env.HOLDEM_DEBUG === 'true';
  await logger.initialize(debugMode);

  logger.info('GAME', '游戏启动', { debugMode });

  const menuUI = new MenuUI();
  let transferDone = false;

  try {
    menuUI.init();

    // 主循环: 支持Esc从配置返回主菜单
    while (true) {
      const runMode = await selectRunMode();

      if (runMode === null) {
        menuUI.destroy();
        console.log('\n  再见！\n');
        return;
      }

      try {
        switch (runMode) {
          case RunMode.Local:
            await runLocalGame(menuUI);
            break;
          case RunMode.Host:
            await runHostGame(menuUI);
            break;
          case RunMode.Client:
            await runClientGame(menuUI);
            break;
        }
        transferDone = true;
        break; // 游戏正常结束, 退出循环
      } catch (e: any) {
        if (e?.message === '配置取消') {
          // 用户按Esc, 回到主菜单
          continue;
        }
        throw e; // 其他错误继续抛出
      }
    }
  } finally {
    if (!transferDone) {
      // Config phase failed or user cancelled — menuUI still owns screen
      menuUI.destroy();
    }
    // If transferDone, GameUI now owns screen+input and its destroy() handles cleanup
    if (gameUI) {
      gameUI.destroy();
      gameUI = null;
    }
    if (gameServer) {
      await gameServer.stop();
    }
    if (gameClient) {
      gameClient.disconnect();
    }
    await logger.destroy();
  }
}

/**
 * 运行本地游戏（原逻辑）
 */
async function runLocalGame(menuUI: MenuUI): Promise<void> {
  const { numPlayers, humanPosition, startingChips, smallBlind, bigBlind, llmAssignments, aiDifficulties } = await getGameConfig();

  const config: GameConfig = {
    numPlayers,
    startingChips,
    smallBlind,
    bigBlind,
    humanPlayerIndex: humanPosition,
    llmAssignments,
    aiDifficulties
  };

  logger.info('GAME', '游戏配置', config);

  const llmPresets = await loadLLMPresets();
  const llmPresetMap = new Map(llmPresets.map(p => [p.name, p]));

  logger.info('GAME', '已加载 LLM 预设', { presets: llmPresets.map(p => p.name) });

  let state = createGame(config);
  logger.info('GAME', '游戏创建成功', { players: state.players.map(p => ({ name: p.name, isHuman: p.isHuman, llmPreset: p.llmPresetName })) });

  // 移交给GameUI
  const { screen, input } = menuUI.transfer();
  gameUI = new GameUI(screen, input);
  gameUI.init();

  try {
    while (getActivePlayerCount(state) >= MIN_PLAYERS) {
      await playHand(state, llmPresetMap);

      if (getActivePlayerCount(state) < MIN_PLAYERS) {
        break;
      }

      await gameUI.waitForEnter('\n按 Enter 键开始下一手牌...');
      prepareNewHand(state);
    }

    gameUI.renderGameOver(state);
    logger.info('GAME', '游戏结束');
  } finally {
    gameUI.destroy();
    gameUI = null;
  }
}

/**
 * 运行主机游戏
 */
async function runHostGame(menuUI: MenuUI): Promise<void> {
  isHostMode = true;

  const hostConfig = await configureHost();

  // 创建游戏服务器
  gameServer = new GameServer();
  gameServer.setConfig(hostConfig);

  // 设置事件监听
  gameServer.on('player-joined', (seatIndex, playerName) => {
    if (!gameUI) {
      // Still in lobby phase
      const seat = hostConfig.seats.find(s => s.index === seatIndex);
      if (seat) {
        seat.isOccupied = true;
        seat.name = playerName;
      }
    }
  });

  gameServer.on('player-left', (seatIndex, reason) => {
    if (!gameUI) {
      const seat = hostConfig.seats.find(s => s.index === seatIndex);
      if (seat && seat.type === SeatType.Remote) {
        seat.isOccupied = false;
      }
    }
  });

  gameServer.on('player-action', (seatIndex, action, amount) => {
    if (remoteActionPromise) {
      remoteActionPromise.resolve({ action, amount });
      remoteActionPromise = null;
    }
  });

  // 启动服务器
  await gameServer.start(hostConfig.port);

  // TUI大厅等待玩家
  const getLobbySeats = (): HostLobbySeat[] => hostConfig.seats.map(s => ({
    index: s.index,
    type: s.type === SeatType.Host ? '主机' :
          s.type === SeatType.AI ? 'AI' :
          s.type === SeatType.LLM ? 'LLM' : '预留',
    name: s.name,
    isOccupied: s.isOccupied,
  }));

  const gameReady = await tuiHostLobby(
    getLobbySeats,
    async (seatIndex, newName) => {
      const seat = hostConfig.seats[seatIndex];
      if (seat) seat.name = newName;
      return true;
    },
    async () => {
      // Refresh — no-op, seats are live
    }
  );

  if (!gameReady) {
    return;
  }

  // 创建游戏配置
  const llmAssignments = hostConfig.seats
    .filter(s => s.type === SeatType.LLM)
    .map(s => ({ playerIndex: s.index, presetName: s.name }));

  const aiDifficulties = new Map<number, AIDifficulty>();
  for (const seat of hostConfig.seats) {
    if (seat.type === SeatType.AI && seat.aiDifficulty) {
      aiDifficulties.set(seat.index, seat.aiDifficulty);
    }
  }

  const config: GameConfig = {
    numPlayers: hostConfig.numPlayers,
    startingChips: hostConfig.startingChips,
    smallBlind: hostConfig.smallBlind,
    bigBlind: hostConfig.bigBlind,
    humanPlayerIndex: hostConfig.hostSeatIndex,
    llmAssignments,
    aiDifficulties
  };

  const llmPresets = await loadLLMPresets();
  const llmPresetMap = new Map(llmPresets.map(p => [p.name, p]));

  let state = createGame(config);

  // 更新玩家名称
  for (const seat of hostConfig.seats) {
    if (state.players[seat.index]) {
      state.players[seat.index].name = seat.name;
    }
  }

  // 广播初始状态
  gameServer.broadcastGameState(state);

  // 移交给GameUI
  const { screen, input } = menuUI.transfer();
  gameUI = new GameUI(screen, input);
  gameUI.init();

  try {
    while (getActivePlayerCount(state) >= MIN_PLAYERS) {
      await playHandHost(state, llmPresetMap, hostConfig);

      if (getActivePlayerCount(state) < MIN_PLAYERS) {
        break;
      }

      const shouldEnd = await gameUI.waitForEnterOrZero('按 Enter 继续，或按 0 结束游戏');
      if (shouldEnd) {
        gameUI.showMessage('结束游戏');
        break;
      }

      prepareNewHand(state);

      // 广播新游戏状态
      gameServer.broadcastGameState(state);
    }

    gameUI.renderGameOver(state);
    gameServer.broadcastGameState(state);
  } finally {
    gameUI.destroy();
    gameUI = null;
  }
}

/**
 * 运行客户端游戏
 */
async function runClientGame(menuUI: MenuUI): Promise<void> {
  isClientMode = true;

  const clientConfig = await configureClient();

  // 创建游戏客户端
  gameClient = new GameClient();

  let currentGameState: SerializedGameState | null = null;
  let mySeatIndex = -1;
  let waitingForAction = false;
  let gameStarted = false;

  // 设置事件监听
  gameClient.on('connected', () => {
    if (gameUI) {
      gameUI.showMessage('已连接到服务器');
    }
  });

  gameClient.on('disconnected', (reason) => {
    if (gameUI) {
      gameUI.showMessage(`已断开: ${reason}`);
    }
    process.exit(0);
  });

  gameClient.on('game-state', (gameState, seatIndex) => {
    currentGameState = gameState;
    mySeatIndex = seatIndex;

    if (gameUI) {
      gameUI.setMySeat(seatIndex);

      const isMyTurn = gameState.currentPlayerIndex === seatIndex;
      const myPlayer = gameState.players.find(p => p.id === seatIndex);

      if (isMyTurn && myPlayer?.isActive && !myPlayer?.isAllIn && !waitingForAction) {
        waitingForAction = true;
        gameUI.renderGame(gameState);
      } else {
        gameUI.renderGame(gameState);
      }
    }
  });

  gameClient.on('action-result', (success, message) => {
    if (!success && message) {
      if (gameUI) {
        gameUI.showMessage(message);
      }
    }
    waitingForAction = false;
  });

  // 连接到服务器
  await gameClient.connect({ host: clientConfig.host, port: clientConfig.port });

  // 等待连接稳定
  await new Promise(resolve => setTimeout(resolve, 500));

  // 选择座位并加入
  const seatIndex = await getNumberInput('输入要加入的座位号: ', 1, 8) - 1;
  const playerName = await getInput('输入你的名称: ');

  gameClient.joinGame(seatIndex, playerName);

  // 等待加入响应
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('加入超时')), 10000);
    gameClient!.on('join-response', (success, message) => {
      clearTimeout(timeout);
      if (success) {
        resolve();
      } else {
        reject(new Error(message || '加入失败'));
      }
    });
  });

  // 等待游戏开始
  // Pre-game interaction: simple enter-to-wait
  await waitForEnter('按 Enter 等待游戏开始...');

  // Poll until game starts
  while (gameClient.getIsConnected() && !gameStarted) {
    if (currentGameState) {
      gameStarted = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 移交给GameUI
  const { screen, input } = menuUI.transfer();
  gameUI = new GameUI(screen, input);
  if (mySeatIndex >= 0) gameUI.setMySeat(mySeatIndex);
  gameUI.init();

  try {
    if (currentGameState) {
      gameUI.renderGame(currentGameState);
    }

    while (gameClient.getIsConnected()) {
      if (waitingForAction && currentGameState) {
        const availableActions = getAvailableActionsFromState(currentGameState, mySeatIndex);
        if (availableActions.length > 0) {
          try {
            const action = await gameUI.waitForAction(availableActions);
            gameClient.sendAction(action.action, action.amount);
          } catch {
            // 输入错误，继续等待
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    gameUI.destroy();
    gameUI = null;
  }
}

/**
 * 主机模式执行单轮扑克手牌
 */
async function playHandHost(state: GameState, llmPresetMap: Map<string, LLMPreset>, hostConfig: HostConfig): Promise<void> {
  logger.info('GAME', '开始新的一手牌', { hand: state.handNumber, dealer: state.dealerIndex });
  gameUI!.renderGame(state);
  gameServer!.broadcastGameState(state);

  while (!isHandOver(state)) {
    await playBettingRoundHost(state, llmPresetMap, hostConfig);

    if (isHandOver(state)) {
      break;
    }

    if (isBettingRoundComplete(state)) {
      const prevPhase = state.currentPhase;
      const nextPhase = getNextPhase(prevPhase);
      await gameUI!.showPhaseTransition(5000, prevPhase, nextPhase);
      advancePhase(state);
      logger.logPhaseChange(prevPhase, state.currentPhase);
      gameUI!.renderGame(state);
      gameServer!.broadcastGameState(state);
    }
  }

  await resolveHandHost(state);
}

/**
 * 主机模式执行单轮下注
 */
async function playBettingRoundHost(state: GameState, llmPresetMap: Map<string, LLMPreset>, hostConfig: HostConfig): Promise<void> {
  const activePlayers = state.players.filter(p => p.isActive && !p.isAllIn);

  if (activePlayers.length <= 1) {
    return;
  }

  let roundComplete = false;

  while (!roundComplete) {
    const player = getCurrentPlayer(state);

    if (player.isActive && !player.isAllIn) {
      gameUI!.renderGame(state);
      gameServer!.broadcastGameState(state);

      // 检查是否是远程玩家
      const seatConfig = hostConfig.seats[player.id];
      const isRemotePlayer = seatConfig?.type === SeatType.Remote;

      let stopAnimation: (() => void) | null = null;

      if (isRemotePlayer) {
        // 等待远程玩家动作
        gameUI!.showMessage(`等待 ${player.name} 行动`);
        gameServer!.waitForPlayerAction(player.id);

        const action = await waitForRemoteAction();

        if (action) {
          const toCall = state.currentBet - player.currentBet;
          const potBefore = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0);
          const success = executeAction(state, action.action, action.amount);
          gameServer!.sendActionResult(player.id, success, action.action, action.amount);

          if (success) {
            recordPlayerAction(player.id, action.action, toCall, potBefore);
            gameUI!.showAction(player.name, action.action, action.amount);
            logger.logGameAction(player.name, action.action, action.amount);
          }
        }
      } else if (player.isHuman) {
        // 主机玩家
        const action = await gameUI!.waitForAction(getAvailableActions(state));

        if (action) {
          const toCall = state.currentBet - player.currentBet;
          const potBefore = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0);
          const success = executeAction(state, action.action, action.amount);

          if (success) {
            recordPlayerAction(player.id, action.action, toCall, potBefore);
            gameUI!.showAction(player.name, action.action, action.amount);
            logger.logGameAction(player.name, action.action, action.amount);
          }
        }
      } else {
        // AI 玩家
        const thinkingMessage = player.llmPresetName
          ? `[LLM] ${player.name} 正在思考`
          : `${player.name} 正在思考`;
        stopAnimation = gameUI!.startSpinner(thinkingMessage);

        const action = await getAction(state, player, llmPresetMap);

        if (stopAnimation) {
          stopAnimation();
        }

        if (action) {
          const toCall = state.currentBet - player.currentBet;
          const potBefore = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0);
          const success = executeAction(state, action.action, action.amount);

          if (success) {
            recordPlayerAction(player.id, action.action, toCall, potBefore);
            gameUI!.showAction(player.name, action.action, action.amount);
            logger.logGameAction(player.name, action.action, action.amount);
          }
        }
      }
    }

    if (isBettingRoundComplete(state)) {
      roundComplete = true;
    } else {
      nextPlayer(state);
    }
  }
}

/**
 * 等待远程玩家动作
 */
async function waitForRemoteAction(): Promise<{ action: PlayerAction; amount?: number } | null> {
  return new Promise((resolve, reject) => {
    remoteActionPromise = { resolve, reject };

    // 设置超时
    setTimeout(() => {
      if (remoteActionPromise) {
        remoteActionPromise = null;
        resolve(null);
      }
    }, 60000); // 60秒超时
  });
}

/**
 * 主机模式结算手牌
 */
async function resolveHandHost(state: GameState): Promise<void> {
  const winners = determineHandWinners(state);

  const handDescriptions = new Map<number, string>();
  for (const player of state.players) {
    if (player.isActive) {
      if (state.communityCards.length < 5) {
        handDescriptions.set(player.id, formatHoleCards(player.hand));
      } else {
        const allCards = [...player.hand, ...state.communityCards];
        const evaluation = evaluateHand(allCards);
        handDescriptions.set(player.id, evaluation.description);
      }
    }
  }

  gameUI!.renderGame(state, true);
  gameUI!.renderHandResult(winners, handDescriptions, state);
  gameServer!.broadcastGameState(state);

  awardPot(state, winners);

  await gameUI!.waitForEnter();
}

/**
 * 从序列化状态获取可用动作（客户端使用）
 */
function getAvailableActionsFromState(gameState: SerializedGameState, mySeatIndex: number): PlayerAction[] {
  const player = gameState.players.find(p => p.id === mySeatIndex);
  if (!player || !player.isActive || player.isAllIn) {
    return [];
  }

  const actions: PlayerAction[] = [];
  actions.push(PlayerAction.Fold);

  const toCall = gameState.currentBet - player.currentBet;

  if (toCall === 0) {
    actions.push(PlayerAction.Check);
  } else {
    actions.push(PlayerAction.Call);
  }

  if (player.chips > toCall) {
    actions.push(PlayerAction.Raise);
  }

  if (player.chips > 0) {
    actions.push(PlayerAction.AllIn);
  }

  return actions;
}

// 原本地游戏函数保持不变
async function playHand(state: GameState, llmPresetMap: Map<string, LLMPreset>): Promise<void> {
  logger.info('GAME', '开始新的一手牌', { hand: state.handNumber, dealer: state.dealerIndex });
  gameUI!.renderGame(state);

  while (!isHandOver(state)) {
    await playBettingRound(state, llmPresetMap);

    if (isHandOver(state)) {
      break;
    }

    if (isBettingRoundComplete(state)) {
      const prevPhase = state.currentPhase;
      const nextPhase = getNextPhase(prevPhase);
      await gameUI!.showPhaseTransition(5000, prevPhase, nextPhase);
      advancePhase(state);
      logger.logPhaseChange(prevPhase, state.currentPhase);
      gameUI!.renderGame(state);
    }
  }

  await resolveHand(state);
}

async function playBettingRound(state: GameState, llmPresetMap: Map<string, LLMPreset>): Promise<void> {
  const activePlayers = state.players.filter(p => p.isActive && !p.isAllIn);

  if (activePlayers.length <= 1) {
    return;
  }

  let roundComplete = false;

  while (!roundComplete) {
    const player = getCurrentPlayer(state);

    if (player.isActive && !player.isAllIn) {
      gameUI!.renderGame(state);

      let stopAnimation: (() => void) | null = null;
      if (!player.isHuman) {
        const thinkingMessage = player.llmPresetName
          ? `[LLM] ${player.name} 正在思考`
          : `${player.name} 正在思考`;
        stopAnimation = gameUI!.startSpinner(thinkingMessage);
      }

      const action = await getAction(state, player, llmPresetMap);

      if (stopAnimation) {
        stopAnimation();
      }

      if (action) {
        const toCall = state.currentBet - player.currentBet;
        const potBefore = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0);
        const success = executeAction(state, action.action, action.amount);

        if (success) {
          recordPlayerAction(player.id, action.action, toCall, potBefore);
          gameUI!.showAction(player.name, action.action, action.amount);
          logger.logGameAction(player.name, action.action, action.amount);
        }
      }
    }

    if (isBettingRoundComplete(state)) {
      roundComplete = true;
    } else {
      nextPlayer(state);
    }
  }
}

async function getAction(state: GameState, player: Player, llmPresetMap: Map<string, LLMPreset>): Promise<{ action: PlayerAction; amount?: number } | null> {
  const availableActions = getAvailableActions(state);

  if (availableActions.length === 0) {
    return null;
  }

  if (player.isHuman) {
    return await gameUI!.waitForAction(availableActions);
  }

  if (player.llmPresetName) {
    const preset = llmPresetMap.get(player.llmPresetName);
    if (preset) {
      return await getLLMAction(state, preset);
    }
  }

  return await getAIAction(state);
}

async function resolveHand(state: GameState): Promise<void> {
  const winners = determineHandWinners(state);

  const handDescriptions = new Map<number, string>();
  for (const player of state.players) {
    if (player.isActive) {
      if (state.communityCards.length < 5) {
        handDescriptions.set(player.id, formatHoleCards(player.hand));
      } else {
        const allCards = [...player.hand, ...state.communityCards];
        const evaluation = evaluateHand(allCards);
        handDescriptions.set(player.id, evaluation.description);
      }
    }
  }

  gameUI!.renderGame(state, true);
  gameUI!.renderHandResult(winners, handDescriptions, state);

  awardPot(state, winners);

  await gameUI!.waitForEnter();
}

function getActivePlayerCount(state: GameState): number {
  return state.players.filter(p => p.chips > 0 || p.currentBet > 0).length;
}

function formatHoleCards(cards: Card[]): string {
  if (cards.length < 2) {
    return '无效手牌';
  }

  return `${formatCard(cards[0])} ${formatCard(cards[1])}`;
}

function getNextPhase(current: string): string {
  const order = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const idx = order.indexOf(current);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : '';
}

function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

main().catch(console.error);
