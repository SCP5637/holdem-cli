import { Card, RANK_VALUES, SUIT_SYMBOLS } from '../types/card';
import { GamePhase, GameState, Player, PlayerAction } from '../types/game';
import { LLMPreset } from '../types/llm';
import { getAvailableActions, getCurrentPlayer } from './gameState';
import { getAIAction } from './aiPlayer';

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

  for (let attempt = 1; attempt <= MAX_RETRY_COUNT; attempt++) {
    try {
      console.log(`  [LLM] ${player.name} 正在思考... (尝试 ${attempt}/${MAX_RETRY_COUNT})`);

      const response = await requestLLMDecisionWithTimeout(
        state,
        player,
        availableActions,
        preset,
        maxThinkingTime
      );

      const parsed = parseLLMAction(response);
      const normalized = normalizeAction(state, player, availableActions, parsed);

      if (normalized) {
        console.log(`  [LLM] ${player.name} 决策成功: ${normalized.action}${normalized.amount ? ` ${normalized.amount}` : ''}`);
        return normalized;
      }

      throw new Error('LLM 返回的动作无效或不可用');
    } catch (error) {
      lastError = error as Error;
      const isTimeout = lastError.message.includes('超时');
      console.log(`  [LLM] 尝试 ${attempt}/${MAX_RETRY_COUNT} 失败: ${lastError.message}${isTimeout ? ' (超时)' : ''}`);

      if (attempt < MAX_RETRY_COUNT) {
        const delayMs = Math.min(1000 * attempt, 3000);
        await sleep(delayMs);
      }
    }
  }

  console.log(`  [LLM] ${player.name} 在 ${MAX_RETRY_COUNT} 次尝试后仍失败，改用普通 AI: ${lastError?.message}`);
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
  const endpoint = `${preset.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${preset.apiKey}`
    },
    body: JSON.stringify({
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
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('响应内容为空');
  }

  return content;
}

function createDecisionContext(state: GameState, player: Player, availableActions: PlayerAction[]): object {
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
      pot: state.pot,
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
