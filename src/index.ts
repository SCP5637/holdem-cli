/**
 * 德州扑克游戏主入口
 * 协调游戏初始化、主游戏循环和手牌执行
 * 支持本地游戏、主机模式和客户端模式
 */

import { GameState, GameConfig, PlayerAction, GamePhase, Player, AIDifficulty, DIFFICULTY_SHORT_NAMES } from './types/game';
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
  getNumberInput,
  tuiClientSeatSelect,
  tuiClientWaitForGame,
  tuiLocalLobby,
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
import { MenuUI, getMenuContext } from './ui/menu/menuUI';
import { tuiHostLobby, HostLobbySeat } from './ui/inputHandler';
import { PluginManager } from './plugins/manager';

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
      // 配置阶段失败或取消 — menuUI 仍持屏幕控制权
      menuUI.destroy();
    }
    // transferDone后 GameUI 持有屏幕和输入控制权，destroy() 负责清理
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

  // 大厅: 展示/修改座位名称和筹码
  const lobbyConfig = await tuiLocalLobby({
    seats: Array.from({ length: numPlayers }, (_, i) => ({
      index: i,
      type: i === humanPosition ? '玩家' :
            llmAssignments?.some(a => a.playerIndex === i) ? 'LLM' : 'AI',
      name: i === humanPosition ? 'You' :
            llmAssignments?.find(a => a.playerIndex === i)?.presetName || (i !== humanPosition && aiDifficulties?.has(i) ? `AI-${DIFFICULTY_SHORT_NAMES[aiDifficulties.get(i)!]}-${i + 1}` : `Player ${i + 1}`),
      chips: startingChips,
    })),
    startingChips,
    smallBlind,
    bigBlind,
  });
  if (!lobbyConfig) throw new Error('配置取消');

  // 构建 per-player chips map
  const playerChips = new Map<number, number>();
  for (const s of lobbyConfig.seats) {
    if (s.chips !== startingChips) playerChips.set(s.index, s.chips);
  }

  const config: GameConfig = {
    numPlayers,
    startingChips,
    smallBlind,
    bigBlind,
    humanPlayerIndex: humanPosition,
    llmAssignments,
    aiDifficulties,
    playerChips: playerChips.size > 0 ? playerChips : undefined,
    enabledVariants: lobbyConfig.enabledVariants && lobbyConfig.enabledVariants.length > 0 ? lobbyConfig.enabledVariants : undefined,
  };

  logger.info('GAME', '游戏配置', config);

  const llmPresets = await loadLLMPresets();
  const llmPresetMap = new Map(llmPresets.map(p => [p.name, p]));

  logger.info('GAME', '已加载 LLM 预设', { presets: llmPresets.map(p => p.name) });

  let state = createGame(config);
  // 应用大厅设置的名称
  for (const s of lobbyConfig.seats) {
    if (state.players[s.index]) state.players[s.index].name = s.name;
  }
  logger.logGameCreation({ players: state.players.map(p => ({ name: p.name, isHuman: p.isHuman, llmPreset: p.llmPresetName, chips: p.chips })), smallBlind: config.smallBlind, bigBlind: config.bigBlind });

  // 移交给GameUI
  const { screen, input } = menuUI.transfer();
  gameUI = new GameUI(screen, input);
  gameUI.setMySeat(humanPosition);
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
      // 大厅阶段：尚未进入游戏
      const seat = hostConfig.seats.find(s => s.index === seatIndex);
      if (seat) {
        seat.isOccupied = true;
        seat.name = playerName;
      }
    } else if (gameUI && state) {
      // 游戏中途加入
      const player = state.players[seatIndex];
      if (player) {
        player.name = playerName;
        player.isDisconnected = false;
        gameUI.addSystemMessage(`${playerName} 加入座位 ${seatIndex + 1}`);
        gameUI.renderGame(state);
        gameServer!.broadcastGameState(state);
      }
    }
  });

  gameServer.on('player-left', (seatIndex, reason) => {
    if (!gameUI) {
      const seat = hostConfig.seats.find(s => s.index === seatIndex);
      if (seat && seat.type === SeatType.Remote) {
        seat.isOccupied = false;
      }
    } else if (gameUI && state) {
      // 游戏中断连：标记离线，AI代打
      const player = state.players[seatIndex];
      if (player && player.isActive) {
        player.isDisconnected = true;
        // 如果正在等待该玩家，取消等待
        if (remoteActionPromise) {
          remoteActionPromise.resolve(null);
          remoteActionPromise = null;
        }
        gameUI.addSystemMessage(`${player.name} 断线，AI代打`);
        gameUI.renderGame(state);
        gameServer!.broadcastGameState(state);
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
  const seatChips = new Map<number, number>();
  let lobbySmallBlind = hostConfig.smallBlind;
  const getLobbySeats = (): HostLobbySeat[] => hostConfig.seats.map(s => ({
    index: s.index,
    type: s.type === SeatType.Host ? '主机' :
          s.type === SeatType.AI ? 'AI' :
          s.type === SeatType.LLM ? 'LLM' : '预留',
    name: s.name,
    isOccupied: s.isOccupied,
    chips: seatChips.get(s.index) ?? hostConfig.startingChips,
  }));

  const lobbyResult = await tuiHostLobby(
    getLobbySeats,
    async (seatIndex, newName) => {
      const seat = hostConfig.seats[seatIndex];
      if (seat) seat.name = newName;
      return true;
    },
    async () => {},
    async (seatIndex, newChips) => {
      seatChips.set(seatIndex, newChips);
      return true;
    },
    async (sb) => {
      lobbySmallBlind = sb;
    },
    hostConfig.smallBlind,
  );

  if (!lobbyResult.start) {
    return;
  }

  // 创建游戏配置
  const llmAssignments = hostConfig.seats
    .filter(s => s.type === SeatType.LLM)
    .map(s => ({ playerIndex: s.index, presetName: s.llmPresetName || s.name }));

  const aiDifficulties = new Map<number, AIDifficulty>();
  for (const seat of hostConfig.seats) {
    if (seat.type === SeatType.AI && seat.aiDifficulty) {
      aiDifficulties.set(seat.index, seat.aiDifficulty);
    }
  }

  const config: GameConfig = {
    numPlayers: hostConfig.numPlayers,
    startingChips: hostConfig.startingChips,
    smallBlind: lobbySmallBlind,
    bigBlind: lobbySmallBlind * 2,
    humanPlayerIndex: hostConfig.hostSeatIndex,
    llmAssignments,
    aiDifficulties,
    playerChips: seatChips.size > 0 ? seatChips : undefined,
    enabledVariants: lobbyResult.enabledVariants.length > 0 ? lobbyResult.enabledVariants : undefined,
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
  logger.logGameCreation({ players: state.players.map(p => ({ name: p.name, isHuman: p.isHuman, llmPreset: p.llmPresetName, chips: p.chips })), smallBlind: config.smallBlind, bigBlind: config.bigBlind });

  // 广播初始状态
  gameServer.broadcastGameState(state);

  // 移交给GameUI
  const { screen, input } = menuUI.transfer();
  gameUI = new GameUI(screen, input);
  gameUI.setMySeat(hostConfig.hostSeatIndex);
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
    gameServer.broadcastGameOver();
    gameServer.broadcastGameState(state);
  } finally {
    // 关服前通知所有客户端
    gameServer.broadcastServerShutdown('主机结束游戏');
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
  let justActed = false;
  let prevPhase = '';
  let gameEnded = false;
  let serverShutdown = false;

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
  });

  gameClient.on('game-over', () => {
    gameEnded = true;
    if (gameUI) gameUI.showMessage('游戏结束');
  });

  gameClient.on('server-shutdown', (reason) => {
    serverShutdown = true;
    if (gameUI) gameUI.showMessage(`服务器: ${reason}`);
  });

  gameClient.on('game-state', (gameState, seatIndex) => {
    currentGameState = gameState;
    mySeatIndex = seatIndex;

    if (gameUI) {
      gameUI.setMySeat(seatIndex);

      const isMyTurn = gameState.currentPlayerIndex === seatIndex;
      const myPlayer = gameState.players.find(p => p.id === seatIndex);

      // 检测阶段切换
      if (prevPhase && gameState.currentPhase !== prevPhase) {
        const phaseLabels: Record<string, string> = {
          preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌'
        };
        const from = phaseLabels[prevPhase] || prevPhase;
        const to = phaseLabels[gameState.currentPhase] || gameState.currentPhase;
        gameUI.addSystemMessage(`${from} → ${to}`);
        // 联机方也展示阶段过渡动画（异步，不阻塞状态更新）
        gameUI.showPhaseTransition(2500, prevPhase, gameState.currentPhase).catch(() => {});
      }
      prevPhase = gameState.currentPhase;

      // 不是自己回合时清除justActed标志（说明服务端已经切换到下个玩家）
      if (!isMyTurn) {
        justActed = false;
      }

      const isShowdown = gameState.currentPhase === 'showdown';
      if (isMyTurn && myPlayer?.isActive && !myPlayer?.isAllIn && !waitingForAction && !justActed) {
        waitingForAction = true;
        gameUI.renderGame(gameState, isShowdown);
      } else {
        gameUI.renderGame(gameState, isShowdown);
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

  // 请求座位列表
  let seats: { seatIndex: number; playerName: string; type: string; isOccupied: boolean }[] = [];
  try {
    seats = await new Promise<any[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('获取座位列表超时')), 10000);
      const handler = (list: any[]) => {
        clearTimeout(timeout);
        resolve(list);
      };
      gameClient!.once('seat-list', handler);
      gameClient!.requestSeatList();
    });
  } catch (e: any) {
    throw new Error('无法获取房间信息: ' + e.message);
  }

  // 筛选可加入的座位（远程座位且未占用）
  const availableRemoteSeats = seats.filter(s => s.type === 'remote' && !s.isOccupied);
  if (availableRemoteSeats.length === 0) {
    throw new Error('该房间没有可用座位');
  }

  // 显示可用座位供选择
  let seatIndex: number;
  let playerName: string;
  if (getMenuContext()) {
    const seatOptions = availableRemoteSeats.map(s =>
      `座位 ${s.seatIndex + 1} (${s.playerName})`
    );
    const choice = await tuiClientSeatSelect(seatOptions);
    if (choice === null) throw new Error('配置取消');
    const chosenSeat = availableRemoteSeats[choice];
    seatIndex = chosenSeat.seatIndex;
    playerName = await getInput('输入你的名称: ');
  } else {
    console.log('\n  可用座位:');
    availableRemoteSeats.forEach((s, i) => {
      console.log(`    ${i + 1}. 座位 ${s.seatIndex + 1} (${s.playerName})`);
    });
    const choice = await getNumberInput('选择座位: ', 1, availableRemoteSeats.length);
    const chosenSeat = availableRemoteSeats[choice - 1];
    seatIndex = chosenSeat.seatIndex;
    playerName = await getInput('输入你的名称: ');
  }

  gameClient.joinGame(seatIndex, playerName);

  // 等待加入响应
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('加入超时')), 10000);
    gameClient!.once('join-response', (success, message) => {
      clearTimeout(timeout);
      if (success) {
        resolve();
      } else {
        reject(new Error(message || '加入失败'));
      }
    });
  });

  // 客户端大厅 — 等待游戏开始（显示房间信息，支持 Esc 退出）
  const gameReady = await tuiClientWaitForGame(() => currentGameState !== null, seats);

  if (!gameReady) {
    // 用户主动退出
    gameClient.disconnect();
    return;
  }

  // 游戏已开始，状态已通过事件接收
  if (!currentGameState) {
    throw new Error('游戏状态异常：状态为空');
  }

  // 移交给GameUI
  const { screen, input } = menuUI.transfer();
  gameUI = new GameUI(screen, input);
  if (mySeatIndex >= 0) gameUI.setMySeat(mySeatIndex);
  // 联机模式下 F 键刷新请求服务端重发当前状态
  gameUI.onRemoteRefresh = () => {
    if (gameClient && gameClient.getIsConnected()) {
      gameClient.requestStateRefresh();
    }
  };
  gameUI.init();

  try {
    // 检查是否轮到我们（可能在 UI 初始化前已收到状态）
    const gs: SerializedGameState = currentGameState!;
    const isMyTurn = gs.currentPlayerIndex === mySeatIndex;
    const myPlayer = gs.players.find(p => p.id === mySeatIndex);
    if (isMyTurn && myPlayer?.isActive && !myPlayer?.isAllIn) {
      waitingForAction = true;
    }
    prevPhase = gs.currentPhase;
    gameUI.renderGame(gs, gs.currentPhase === 'showdown');

    while (gameClient.getIsConnected() && !gameEnded && !serverShutdown) {
      if (waitingForAction && currentGameState) {
        const availableActions = getAvailableActionsFromState(currentGameState, mySeatIndex);
        if (availableActions.length > 0) {
          try {
            const action = await gameUI.waitForAction(availableActions);
            gameClient.sendAction(action.action, action.amount);
            // 标记已行动，防止被同一playerIndex的状态再次触发
            justActed = true;
            waitingForAction = false;
          } catch {
            // 输入错误，继续等待
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (currentGameState) {
      gameUI.renderGameOver(currentGameState);
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
  logger.logHandStart(state.handNumber, state.dealerIndex, state.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, isHuman: p.isHuman })));
  gameUI!.clearSystemLog();
  gameUI!.addSystemMessage(`第 ${state.handNumber} 手牌开始`);
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
      gameUI!.addSystemMessage(`${getPhaseLabel(prevPhase)} → ${getPhaseLabel(nextPhase)}`);
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
      // 同步远程玩家连接状态（离线标记）
      for (const p of state.players) {
        const s = hostConfig.seats[p.id];
        if (s?.type === SeatType.Remote) {
          p.isDisconnected = !gameServer!.isSeatConnected(p.id);
        }
      }

      gameUI!.renderGame(state);
      gameServer!.broadcastGameState(state);

      // 检查是否是远程玩家
      const seatConfig = hostConfig.seats[player.id];
      const isRemotePlayer = seatConfig?.type === SeatType.Remote;
      const isRemoteConnected = isRemotePlayer
        && gameServer!.isSeatConnected(player.id)
        && !player.isDisconnected;

      let actionTaken = false;

      if (isRemoteConnected) {
        // 已连接的远程玩家 — 等待行动
        gameUI!.showMessage(`等待 ${player.name} 行动`);
        gameServer!.waitForPlayerAction(player.id);

        const remoteAction = await waitForRemoteAction();

        if (remoteAction) {
          const toCall = state.currentBet - player.currentBet;
          const potBefore = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0) + state.accumulatedPot;
          const success = executeAction(state, remoteAction.action, remoteAction.amount);
          gameServer!.sendActionResult(player.id, success, remoteAction.action, remoteAction.amount);

          if (success) {
            recordPlayerAction(player.id, remoteAction.action, toCall, potBefore);
            gameUI!.showAction(player.name, remoteAction.action, remoteAction.amount);
            gameUI!.renderGame(state);
            gameServer!.broadcastGameState(state);
            logger.logGameAction(player.name, remoteAction.action, remoteAction.amount);
            actionTaken = true;
          }
        } else {
          // 超时 — 断开连接，标记离线
          player.isDisconnected = true;
          gameUI!.addSystemMessage(`${player.name} 行动超时（60s），AI代打`);
          gameServer!.sendActionResult(player.id, false, PlayerAction.Fold, 0, '行动超时，已断开');
          gameServer!.cancelWaitForPlayerAction(player.id);
          gameServer!.disconnectSeat(player.id);
          // actionTaken保持false，走AI分支
        }
      }

      // 主机玩家
      if (!actionTaken && player.isHuman) {
        const hostAction = await gameUI!.waitForAction(getAvailableActions(state));

        if (hostAction) {
          const toCall = state.currentBet - player.currentBet;
          const potBefore = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0) + state.accumulatedPot;
          const success = executeAction(state, hostAction.action, hostAction.amount);

          if (success) {
            recordPlayerAction(player.id, hostAction.action, toCall, potBefore);
            gameUI!.showAction(player.name, hostAction.action, hostAction.amount);
            gameUI!.renderGame(state);
            gameServer!.broadcastGameState(state);
            logger.logGameAction(player.name, hostAction.action, hostAction.amount);
            actionTaken = true;
          }
        }
      }

      // AI/LLM 或 超时/断线的远程玩家
      if (!actionTaken && !player.isHuman && player.isActive && !player.isAllIn) {
        const thinkingMessage = player.llmPresetName
          ? `[LLM] ${player.name} 正在思考`
          : `${player.name} 正在思考`;
        gameUI!.startWaitAnimation(thinkingMessage);

        const aiAction = await getAction(state, player, llmPresetMap);

        gameUI!.stopWaitAnimation();

        if (aiAction) {
          const toCall = state.currentBet - player.currentBet;
          const potBefore = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0) + state.accumulatedPot;
          const success = executeAction(state, aiAction.action, aiAction.amount);

          if (success) {
            recordPlayerAction(player.id, aiAction.action, toCall, potBefore);
            gameUI!.showAction(player.name, aiAction.action, aiAction.amount);
            gameUI!.renderGame(state);
            gameServer!.broadcastGameState(state);
            logger.logGameAction(player.name, aiAction.action, aiAction.amount);
            actionTaken = true;
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
  PluginManager.hook('onHandResolve', state, winners);

  const activePlayers = state.players.filter(p => p.isActive);
  const totalPot = state.pot + state.accumulatedPot + state.sidePots.reduce((s, sp) => s + sp.amount, 0);

  if (activePlayers.length === 1) {
    gameUI!.addSystemMessage(`${activePlayers[0].name} 赢得底池 ${totalPot} (其余弃牌)`);
  } else {
    gameUI!.addSystemMessage('摊牌');
  }

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
  gameServer!.broadcastGameState(state);

  // 胜利结算播报
  const share = Math.floor(totalPot / winners.length);
  for (const winnerId of winners) {
    const player = state.players.find(p => p.id === winnerId)!;
    const desc = handDescriptions.get(winnerId);
    if (winners.length === 1) {
      gameUI!.addSystemMessage(`胜利: ${player.name} 赢得 ${totalPot} ${desc ? `(${desc})` : ''}`);
    } else {
      gameUI!.addSystemMessage(`胜利: ${player.name} 赢得 ${share} ${desc ? `(${desc})` : ''} (平分)`);
    }
  }

  logger.logHandEnd(state.handNumber, winners.map(id => {
    const p = state.players.find(p => p.id === id)!;
    return { id: p.id, name: p.name, chips: p.chips };
  }), totalPot);

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
  logger.logHandStart(state.handNumber, state.dealerIndex, state.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, isHuman: p.isHuman })));
  gameUI!.clearSystemLog();
  gameUI!.addSystemMessage(`第 ${state.handNumber} 手牌开始`);
  gameUI!.renderGame(state);

  while (!isHandOver(state)) {
    await playBettingRound(state, llmPresetMap);

    if (isHandOver(state)) {
      break;
    }

    if (isBettingRoundComplete(state)) {
      const prevPhase = state.currentPhase;
      const nextPhase = getNextPhase(prevPhase);
      gameUI!.addSystemMessage(`${getPhaseLabel(prevPhase)} → ${getPhaseLabel(nextPhase)}`);
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

      if (!player.isHuman) {
        const thinkingMessage = player.llmPresetName
          ? `[LLM] ${player.name} 正在思考`
          : `${player.name} 正在思考`;
        gameUI!.startWaitAnimation(thinkingMessage);
      }

      const action = await getAction(state, player, llmPresetMap);

      if (!player.isHuman) {
        gameUI!.stopWaitAnimation();
      }

      if (action) {
        const toCall = state.currentBet - player.currentBet;
        const potBefore = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0) + state.accumulatedPot;
        const success = executeAction(state, action.action, action.amount);

        if (success) {
          recordPlayerAction(player.id, action.action, toCall, potBefore);
          gameUI!.showAction(player.name, action.action, action.amount);
          gameUI!.renderGame(state);
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
  PluginManager.hook('onHandResolve', state, winners);

  const activePlayers = state.players.filter(p => p.isActive);
  const totalPot = state.pot + state.accumulatedPot + state.sidePots.reduce((s, sp) => s + sp.amount, 0);

  if (activePlayers.length === 1) {
    gameUI!.addSystemMessage(`${activePlayers[0].name} 赢得底池 ${totalPot} (其余弃牌)`);
  } else {
    gameUI!.addSystemMessage('摊牌');
  }

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

  // 胜利结算播报
  const share = Math.floor(totalPot / winners.length);
  for (const winnerId of winners) {
    const player = state.players.find(p => p.id === winnerId)!;
    const desc = handDescriptions.get(winnerId);
    if (winners.length === 1) {
      gameUI!.addSystemMessage(`胜利: ${player.name} 赢得 ${totalPot} ${desc ? `(${desc})` : ''}`);
    } else {
      gameUI!.addSystemMessage(`胜利: ${player.name} 赢得 ${share} ${desc ? `(${desc})` : ''} (平分)`);
    }
  }

  logger.logHandEnd(state.handNumber, winners.map(id => {
    const p = state.players.find(p => p.id === id)!;
    return { id: p.id, name: p.name, chips: p.chips };
  }), totalPot);

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

function getPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    preflop: '翻牌前', flop: '翻牌圈', turn: '转牌圈', river: '河牌圈', showdown: '摊牌'
  };
  return labels[phase] || phase;
}

function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

main().catch(console.error);
