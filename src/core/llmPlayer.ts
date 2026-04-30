import { Card, RANK_VALUES, SUIT_SYMBOLS } from '../types/card';
import { GamePhase, GameState, Player, PlayerAction } from '../types/game';
import { LLMPreset } from '../types/llm';
import { getAvailableActions, getCurrentPlayer } from './gameState';
import { getAIAction } from './aiPlayer';
import { logger } from './logger';

type LLMActionResponse = {
  action?: string;
  amount?: number;
};

const ACTION_VALUES = new Set<string>(Object.values(PlayerAction));
const DEFAULT_MAX_THINKING_TIME_MS = 30000;
const MAX_RETRY_COUNT = 3;

export async function getLLMAction(state: GameState, preset: LLMPreset): Promise<{ action: PlayerAction; amount?: number }> {
  const player = getCurrentPlayer(state);
  const availableActions = getAvailableActions(state);

  if (availableActions.length === 0) {
    return { action: PlayerAction.Fold };
  }

  const maxThinkingTime = preset.maxThinkingTimeMs ?? DEFAULT_MAX_THINKING_TIME_MS;
  let lastError: Error | null = null;

  logger.debug('LLM', `开始决策`, {
    player: player.name,
    preset: preset.name,
    model: preset.model,
    availableActions,
    hand: player.hand.map(formatCard)
  });

  for (let attempt = 1; attempt <= MAX_RETRY_COUNT; attempt++) {
    try {
      console.log(`  [LLM] ${player.name} 正在思考... (尝试 ${attempt}/${MAX_RETRY_COUNT})`);
      logger.debug('LLM', `尝试 ${attempt}/${MAX_RETRY_COUNT}`, { player: player.name, preset: preset.name });

      const response = await requestLLMDecisionWithTimeout(
        state,
        player,
        availableActions,
        preset,
        maxThinkingTime
      );

      logger.debug('LLM', `收到原始响应`, { player: player.name, response });

      const parsed = parseLLMAction(response);
      logger.debug('LLM', `解析后的动作`, { player: player.name, parsed });

      const normalized = normalizeAction(state, player, availableActions, parsed);

      if (normalized) {
        console.log(`  [LLM] ${player.name} 决策成功: ${normalized.action}${normalized.amount ? ` ${normalized.amount}` : ''}`);
        logger.info('LLM', `决策成功`, {
          player: player.name,
          preset: preset.name,
          action: normalized.action,
          amount: normalized.amount
        });
        return normalized;
      }

      throw new Error('LLM 返回的动作无效或不可用');
    } catch (error) {
      lastError = error as Error;
      const isTimeout = lastError.message.includes('超时');
      console.log(`  [LLM] 尝试 ${attempt}/${MAX_RETRY_COUNT} 失败: ${lastError.message}${isTimeout ? ' (超时)' : ''}`);
      logger.logLLMError(preset.name, lastError);

      if (attempt < MAX_RETRY_COUNT) {
        const delayMs = Math.min(1000 * attempt, 3000);
        logger.debug('LLM', `等待 ${delayMs}ms 后重试`);
        await sleep(delayMs);
      }
    }
  }

  console.log(`  [LLM] ${player.name} 在 ${MAX_RETRY_COUNT} 次尝试后仍失败，改用普通 AI: ${lastError?.message}`);
  logger.warn('LLM', `所有尝试失败，回退到普通 AI`, {
    player: player.name,
    preset: preset.name,
    lastError: lastError?.message
  });
  return getAIAction(state);
}

async function requestLLMDecisionWithTimeout(
  state: GameState,
  player: Player,
  availableActions: PlayerAction[],
  preset: LLMPreset,
  timeoutMs: number
): Promise<string> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`LLM 思考超时 (${timeoutMs}ms)`)), timeoutMs);
  });

  const requestPromise = requestLLMDecision(state, player, availableActions, preset);

  return Promise.race([requestPromise, timeoutPromise]);
}

async function requestLLMDecision(
  state: GameState,
  player: Player,
  availableActions: PlayerAction[],
  preset: LLMPreset
): Promise<string> {
  // 处理 baseUrl：移除末尾斜杠，确保包含 /v1 路径
  let baseUrl = preset.baseUrl.replace(/\/+$/, '');
  if (!baseUrl.endsWith('/v1')) {
    baseUrl += '/v1';
  }
  const endpoint = `${baseUrl}/chat/completions`;

  const requestBody = {
    model: preset.model,
    temperature: preset.temperature ?? 0.2,
    max_tokens: preset.maxTokens ?? 120,
    messages: [
      {
        role: 'system',
        content: '你正在操控一个德州扑克电脑玩家。你必须只返回 JSON，不要解释。JSON 格式为 {"action":"fold|check|call|raise|allin","amount":数字可选}。raise 的 amount 表示本轮该玩家最终总下注额，不是额外加注额。只能选择用户提供的 availableActions。'
      },
      {
        role: 'user',
        content: JSON.stringify(createDecisionContext(state, player, availableActions))
      }
    ]
  };

  logger.logLLMRequest(preset.name, {
    endpoint,
    model: preset.model,
    temperature: preset.temperature ?? 0.2,
    max_tokens: preset.maxTokens ?? 120,
    messages: requestBody.messages
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${preset.apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '无法读取错误响应');
    logger.error('LLM', `HTTP 错误`, {
      status: response.status,
      statusText: response.statusText,
      errorBody: errorText
    });
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  logger.logLLMResponse(preset.name, data);

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('响应内容为空');
  }

  return content;
}

function createDecisionContext(state: GameState, player: Player, availableActions: PlayerAction[]): object {
  // 计算总底池（主底池 + 所有边池）
  const totalPot = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0);

  return {
    phase: getPhaseName(state.currentPhase),
    availableActions,
    rules: {
      raiseAmountMeans: '玩家本轮最终总下注额',
      minRaiseTo: state.minRaise,
      maxRaiseTo: player.currentBet + player.chips,
      toCall: state.currentBet - player.currentBet
    },
    table: {
      pot: totalPot,
      mainPot: state.pot,
      sidePots: state.sidePots.map((sp, i) => ({ index: i + 1, amount: sp.amount })),
      currentBet: state.currentBet,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      communityCards: state.communityCards.map(formatCard)
    },
    self: {
      name: player.name,
      chips: player.chips,
      currentBet: player.currentBet,
      hand: player.hand.map(formatCard)
    },
    players: state.players.map(item => ({
      name: item.name,
      chips: item.chips,
      currentBet: item.currentBet,
      isActive: item.isActive,
      isAllIn: item.isAllIn,
      isDealer: item.id === state.dealerIndex,
      isSelf: item.id === player.id
    }))
  };
}

function parseLLMAction(content: string): LLMActionResponse {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : trimmed;
  return JSON.parse(jsonText) as LLMActionResponse;
}

function normalizeAction(
  state: GameState,
  player: Player,
  availableActions: PlayerAction[],
  response: LLMActionResponse
): { action: PlayerAction; amount?: number } | null {
  if (!response.action || !ACTION_VALUES.has(response.action)) {
    return null;
  }

  const action = response.action as PlayerAction;

  if (!availableActions.includes(action)) {
    return null;
  }

  if (action !== PlayerAction.Raise) {
    return { action };
  }

  const maxRaise = player.currentBet + player.chips;
  const amount = Math.floor(Number(response.amount));

  if (!Number.isFinite(amount) || amount < state.minRaise || amount > maxRaise) {
    return null;
  }

  return { action, amount };
}

function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}(${RANK_VALUES[card.rank]})`;
}

function getPhaseName(phase: GamePhase): string {
  const phaseMap: Record<GamePhase, string> = {
    [GamePhase.PreFlop]: '翻牌前',
    [GamePhase.Flop]: '翻牌圈',
    [GamePhase.Turn]: '转牌圈',
    [GamePhase.River]: '河牌圈',
    [GamePhase.Showdown]: '摊牌'
  };

  return phaseMap[phase];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
