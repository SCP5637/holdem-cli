/**
 * 德州扑克游戏主入口
 * 协调游戏初始化、主游戏循环和手牌执行
 * 支持本地游戏、主机模式和客户端模式
 */

import { GameState, GameConfig, PlayerAction, GamePhase, Player } from './types/game';
import { createGame, executeAction, nextPlayer, isBettingRoundComplete, advancePhase, determineHandWinners, awardPot, isHandOver, prepareNewHand, getCurrentPlayer, getAvailableActions } from './core/gameState';
import { getAIAction } from './core/aiPlayer';
import { getLLMAction } from './core/llmPlayer';
import { evaluateHand } from './core/handEvaluator';
import {
  getGameConfig,
  getPlayerAction,
  waitForEnter,
  selectRunMode,
  configureHost,
  configureClient,
  selectSeatAndName
} from './ui/inputHandler';
import {
  renderGameState,
  renderHandResult,
  renderAction,
  renderGameOver,
  clearScreen,
  startWaitingAnimation,
  showPhaseTransitionAnimation
} from './ui/gameRenderer';
import {
  renderRemoteGameState,
  renderRemoteHandResult,
  renderRemoteAction,
  renderRemoteGameOver,
  renderWaiting,
  renderConnectionStatus,
  renderError
} from './ui/remoteRenderer';
import { loadLLMPresets } from './core/llmPresetStore';
import { LLMPreset } from './types/llm';
import { logger } from './core/logger';
import { Card, SUIT_SYMBOLS } from './types/card';
import { RunMode, HostConfig, ClientConfig, SeatType, SerializedGameState } from './types/network';
import { GameServer } from './network/server';
import { GameClient } from './network/client';

const STARTING_CHIPS = 1000;
const SMALL_BLIND = 10;
const BIG_BLIND = 20;
const MIN_PLAYERS = 2;

// 全局变量用于联机模式
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

  try {
    const runMode = await selectRunMode();

    // 用户选择退出
    if (runMode === null) {
      console.log('\n  再见！\n');
      return;
    }

    switch (runMode) {
      case RunMode.Local:
        await runLocalGame();
        break;
      case RunMode.Host:
        await runHostGame();
        break;
      case RunMode.Client:
        await runClientGame();
        break;
    }
  } finally {
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
async function runLocalGame(): Promise<void> {
  const { numPlayers, humanPosition, startingChips, smallBlind, bigBlind, llmAssignments } = await getGameConfig();

  const config: GameConfig = {
    numPlayers,
    startingChips,
    smallBlind,
    bigBlind,
    humanPlayerIndex: humanPosition,
    llmAssignments
  };

  logger.info('GAME', '游戏配置', config);

  const llmPresets = await loadLLMPresets();
  const llmPresetMap = new Map(llmPresets.map(p => [p.name, p]));

  logger.info('GAME', '已加载 LLM 预设', { presets: llmPresets.map(p => p.name) });

  let state = createGame(config);
  logger.info('GAME', '游戏创建成功', { players: state.players.map(p => ({ name: p.name, isHuman: p.isHuman, llmPreset: p.llmPresetName })) });

  while (getActivePlayerCount(state) >= MIN_PLAYERS) {
    await playHand(state, llmPresetMap);

    if (getActivePlayerCount(state) < MIN_PLAYERS) {
      break;
    }

    await waitForEnter('\n按 Enter 键开始下一手牌...');
    prepareNewHand(state);
  }

  renderGameOver(state);
  logger.info('GAME', '游戏结束');
}

/**
 * 运行主机游戏
 */
async function runHostGame(): Promise<void> {
  isHostMode = true;

  const hostConfig = await configureHost();

  // 创建游戏服务器
  gameServer = new GameServer();
  gameServer.setConfig(hostConfig);

  // 设置事件监听
  gameServer.on('player-joined', (seatIndex, playerName) => {
    console.log(`  [系统] 玩家 ${playerName} 加入座位 ${seatIndex + 1}`);
  });

  gameServer.on('player-left', (seatIndex, reason) => {
    console.log(`  [系统] 座位 ${seatIndex + 1} 玩家离开: ${reason}`);
  });

  gameServer.on('player-action', (seatIndex, action, amount) => {
    if (remoteActionPromise) {
      remoteActionPromise.resolve({ action, amount });
      remoteActionPromise = null;
    }
  });

  // 启动服务器
  await gameServer.start(hostConfig.port);

  // 等待玩家连接阶段 - 可配置空座位名称
  let gameReady = false;
  while (!gameReady) {
    console.log('\n  ╔══════════════════════════════════════════════════════════════╗');
    console.log('  ║                      等待玩家连接                              ║');
    console.log('  ╚══════════════════════════════════════════════════════════════╝');
    console.log();

    // 显示当前座位状态
    console.log('  当前座位状态:');
    for (const seat of hostConfig.seats) {
      const status = seat.isOccupied ? '已占用' : '空闲';
      const typeLabel = seat.type === SeatType.Host ? '[主机]' :
                       seat.type === SeatType.AI ? '[AI]' :
                       seat.type === SeatType.LLM ? '[LLM]' : '[预留]';
      console.log(`    ${seat.index + 1}号位 ${typeLabel} ${seat.name} (${status})`);
    }

    console.log();
    console.log('  可用指令:');
    console.log('    1-8. 修改对应座位名称 (如输入 1 修改1号位名称)');
    console.log('    9.   刷新座位状态');
    console.log('    0.   开始游戏 (需要输入两次 0 确认)');
    console.log();

    const choice = await getNumberInput('输入指令 (0-9): ', 0, 9);

    if (choice >= 1 && choice <= 8) {
      // 修改座位名称
      const seatIndex = choice - 1;
      const seat = hostConfig.seats[seatIndex];
      if (seat) {
        if (seat.type === SeatType.Remote && !seat.isOccupied) {
          // 空闲的远程座位可以修改名称
          const newName = await getInput(`输入 ${seatIndex + 1} 号位新名称 (当前: ${seat.name}): `);
          if (newName.trim()) {
            seat.name = newName.trim();
            console.log(`  已更新 ${seatIndex + 1} 号位名称为: ${seat.name}`);
          }
        } else if (seat.type === SeatType.Host) {
          console.log('  不能修改主机座位名称');
        } else if (seat.isOccupied) {
          console.log('  该座位已有玩家，不能修改名称');
        } else {
          const newName = await getInput(`输入 ${seatIndex + 1} 号位新名称 (当前: ${seat.name}): `);
          if (newName.trim()) {
            seat.name = newName.trim();
            console.log(`  已更新 ${seatIndex + 1} 号位名称为: ${seat.name}`);
          }
        }
      }
    } else if (choice === 9) {
      // 刷新状态，直接继续循环显示最新状态
      console.log('  刷新中...');
    } else if (choice === 0) {
      // 需要输入两次 0 确认开始游戏
      console.log('\n  ⚠️  警告: 游戏开始后不能再修改座位配置！');
      const confirm = await getNumberInput('再次输入 0 确认开始游戏，或其他数字取消: ', 0, 9);
      if (confirm === 0) {
        gameReady = true;
        console.log('  游戏即将开始...');
      } else {
        console.log('  取消开始游戏，继续等待...');
      }
    }
  }

  // 创建游戏配置
  const llmAssignments = hostConfig.seats
    .filter(s => s.type === SeatType.LLM)
    .map(s => ({ playerIndex: s.index, presetName: s.name }));

  const config: GameConfig = {
    numPlayers: hostConfig.numPlayers,
    startingChips: hostConfig.startingChips,
    smallBlind: hostConfig.smallBlind,
    bigBlind: hostConfig.bigBlind,
    humanPlayerIndex: hostConfig.hostSeatIndex,
    llmAssignments
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

  while (getActivePlayerCount(state) >= MIN_PLAYERS) {
    await playHandHost(state, llmPresetMap, hostConfig);

    if (getActivePlayerCount(state) < MIN_PLAYERS) {
      break;
    }

    console.log('\n  按 Enter 键开始下一手牌...');
    console.log('  (或输入 0 结束游戏)');

    // 等待 Enter 或 0
    const input = await getInput('');
    if (input.trim() === '0') {
      console.log('  结束游戏');
      break;
    }

    prepareNewHand(state);

    // 广播新游戏状态
    gameServer.broadcastGameState(state);
  }

  renderGameOver(state);
  gameServer.broadcastGameState(state);
}

/**
 * 运行客户端游戏
 */
async function runClientGame(): Promise<void> {
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
    renderConnectionStatus('已连接到服务器');
  });

  gameClient.on('disconnected', (reason) => {
    renderConnectionStatus(`已断开: ${reason}`);
    process.exit(0);
  });

  gameClient.on('game-state', (gameState, seatIndex) => {
    currentGameState = gameState;
    mySeatIndex = seatIndex;

    // 检查是否轮到自己
    const isMyTurn = gameState.currentPlayerIndex === seatIndex;
    const myPlayer = gameState.players.find(p => p.id === seatIndex);

    if (isMyTurn && myPlayer?.isActive && !myPlayer?.isAllIn && !waitingForAction) {
      waitingForAction = true;
      // 获取可用动作并显示
      const availableActions = getAvailableActionsFromState(gameState, seatIndex);
      renderRemoteGameState(gameState, seatIndex, availableActions);
    } else {
      renderRemoteGameState(gameState, seatIndex);
    }
  });

  gameClient.on('action-result', (success, message) => {
    if (!success && message) {
      renderError(message);
    }
    waitingForAction = false;
  });

  // 连接到服务器
  await gameClient.connect({ host: clientConfig.host, port: clientConfig.port });

  // 请求加入游戏
  console.log('\n  等待服务器响应...');

  // 等待一段时间让连接稳定
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
        console.log('  成功加入游戏！');
        resolve();
      } else {
        reject(new Error(message || '加入失败'));
      }
    });
  });

  // 等待游戏开始前的交互循环
  console.log('\n  等待游戏开始...');
  console.log('  可用指令:');
  console.log('    1. 修改当前名称');
  console.log('    2. 切换到其他空座位');
  console.log('    3. 刷新座位状态');
  console.log('    0. 等待游戏开始');
  console.log('');

  // 等待游戏开始前的交互循环
  while (gameClient.getIsConnected() && !gameStarted) {
    try {
      // 使用非阻塞方式读取输入
      const choice = await getNumberInputWithTimeout('输入指令 (0-3): ', 0, 3, 5000);

      switch (choice) {
        case 1: {
          // 修改名称
          const newName = await getInput('输入新名称: ');
          if (newName.trim()) {
            gameClient.rename(newName.trim());
            console.log(`  已发送更名请求: ${newName}`);
          }
          break;
        }
        case 2: {
          // 切换座位
          const newSeat = await getNumberInput('输入要切换到的座位号: ', 1, 8) - 1;
          const newName = await getInput('输入新名称: ');
          if (newName.trim()) {
            gameClient.switchSeat(newSeat, newName.trim());
            console.log(`  已发送换座请求: ${newSeat + 1}号位`);
          }
          break;
        }
        case 3: {
          // 刷新座位状态
          console.log('  刷新中...');
          gameClient.requestSeatList();
          break;
        }
        case 0: {
          // 进入等待模式
          console.log('  进入等待模式，游戏开始后将自动进入游戏...');
          await waitForGameStart();
          gameStarted = true;
          break;
        }
      }
    } catch {
      // 超时或输入错误，继续循环
    }

    // 检查是否收到游戏状态（表示游戏已开始）
    if (currentGameState) {
      gameStarted = true;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // 游戏循环：等待服务器状态更新并响应
  console.log('\n  游戏开始！');

  // 保持进程运行
  while (gameClient.getIsConnected()) {
    if (waitingForAction && currentGameState) {
      // 获取玩家输入
      const availableActions = getAvailableActionsFromState(currentGameState, mySeatIndex);
      if (availableActions.length > 0) {
        try {
          const action = await getPlayerAction(availableActions);
          gameClient.sendAction(action.action, action.amount);
        } catch {
          // 输入错误，继续等待
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * 等待游戏开始
 */
async function waitForGameStart(): Promise<void> {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      // 检查是否收到游戏状态
      if (gameClient) {
        // 游戏开始后会收到游戏状态
        resolve();
        clearInterval(checkInterval);
      }
    }, 500);
  });
}

/**
 * 带超时的数字输入
 */
async function getNumberInputWithTimeout(
  question: string,
  min: number,
  max: number,
  timeoutMs: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('输入超时'));
    }, timeoutMs);

    getNumberInput(question, min, max)
      .then((result) => {
        clearTimeout(timeout);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/**
 * 主机模式执行单轮扑克手牌
 */
async function playHandHost(state: GameState, llmPresetMap: Map<string, LLMPreset>, hostConfig: HostConfig): Promise<void> {
  logger.info('GAME', '开始新的一手牌', { hand: state.handNumber, dealer: state.dealerIndex });
  renderGameState(state);
  gameServer!.broadcastGameState(state);

  while (!isHandOver(state)) {
    await playBettingRoundHost(state, llmPresetMap, hostConfig);

    if (isHandOver(state)) {
      break;
    }

    if (isBettingRoundComplete(state)) {
      const prevPhase = state.currentPhase;
      await showPhaseTransitionAnimation(5000);
      clearScreen();
      advancePhase(state);
      logger.logPhaseChange(prevPhase, state.currentPhase);
      renderGameState(state);
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
      renderGameState(state);
      gameServer!.broadcastGameState(state);

      // 检查是否是远程玩家
      const seatConfig = hostConfig.seats[player.id];
      const isRemotePlayer = seatConfig?.type === SeatType.Remote;

      let stopAnimation: (() => void) | null = null;

      if (isRemotePlayer) {
        // 等待远程玩家动作
        renderWaiting(`等待 ${player.name} 行动`);
        gameServer!.waitForPlayerAction(player.id);

        const action = await waitForRemoteAction();

        if (action) {
          const success = executeAction(state, action.action, action.amount);
          gameServer!.sendActionResult(player.id, success, action.action, action.amount);

          if (success) {
            renderAction(player.name, action.action, action.amount);
            logger.logGameAction(player.name, action.action, action.amount);
          }
        }
      } else if (player.isHuman) {
        // 主机玩家
        const action = await getPlayerAction(getAvailableActions(state));

        if (action) {
          const success = executeAction(state, action.action, action.amount);

          if (success) {
            renderAction(player.name, action.action, action.amount);
            logger.logGameAction(player.name, action.action, action.amount);
          }
        }
      } else {
        // AI 玩家
        const thinkingMessage = player.llmPresetName
          ? `[LLM] ${player.name} 正在思考`
          : `${player.name} 正在思考`;
        stopAnimation = startWaitingAnimation(thinkingMessage);

        const action = await getAction(state, player, llmPresetMap);

        if (stopAnimation) {
          stopAnimation();
        }

        if (action) {
          const success = executeAction(state, action.action, action.amount);

          if (success) {
            renderAction(player.name, action.action, action.amount);
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

  renderGameState(state, true);
  renderHandResult(state, winners, handDescriptions);
  gameServer!.broadcastGameState(state);

  awardPot(state, winners);

  await waitForEnter();
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
  renderGameState(state);

  while (!isHandOver(state)) {
    await playBettingRound(state, llmPresetMap);

    if (isHandOver(state)) {
      break;
    }

    if (isBettingRoundComplete(state)) {
      const prevPhase = state.currentPhase;
      await showPhaseTransitionAnimation(5000);
      clearScreen();
      advancePhase(state);
      logger.logPhaseChange(prevPhase, state.currentPhase);
      renderGameState(state);
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
      renderGameState(state);

      let stopAnimation: (() => void) | null = null;
      if (!player.isHuman) {
        const thinkingMessage = player.llmPresetName
          ? `[LLM] ${player.name} 正在思考`
          : `${player.name} 正在思考`;
        stopAnimation = startWaitingAnimation(thinkingMessage);
      }

      const action = await getAction(state, player, llmPresetMap);

      if (stopAnimation) {
        stopAnimation();
      }

      if (action) {
        const success = executeAction(state, action.action, action.amount);

        if (success) {
          renderAction(player.name, action.action, action.amount);
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
    return await getPlayerAction(availableActions);
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

  renderGameState(state, true);
  renderHandResult(state, winners, handDescriptions);

  awardPot(state, winners);

  await waitForEnter();
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

function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

// 辅助函数
async function getInput(question: string): Promise<string> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getNumberInput(question: string, min: number, max: number): Promise<number> {
  while (true) {
    const input = await getInput(question);
    const num = parseInt(input, 10);

    if (!isNaN(num) && num >= min && num <= max) {
      return num;
    }

    console.log(`输入无效。请输入 ${min} 到 ${max} 之间的数字。`);
  }
}

main().catch(console.error);
