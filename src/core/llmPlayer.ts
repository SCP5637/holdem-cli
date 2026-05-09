import { Card, RANK_VALUES, SUIT_SYMBOLS } from '../types/card';
import { GamePhase, GameState, Player, PlayerAction } from '../types/game';
import { LLMPreset } from '../types/llm';
import { getAvailableActions, getCurrentPlayer } from './gameState';
import { getOpponentModelInstance, getFallbackAIAction } from './ai/index';
import { logger } from './logger';

type LLMActionResponse = {
  action?: string;
  amount?: number;
};

const ACTION_VALUES = new Set<string>(Object.values(PlayerAction));
const DEFAULT_MAX_THINKING_TIME_MS = 30000;
/** 扑克决策JSON最多~100 tokens，1024已足够 */
const OUTPUT_TOKENS = 1024;

/** 每个LLM玩家的重试次数状态: playerId → maxRetries */
const playerRetryState = new Map<number, number>();

function getRetryCount(playerId: number): number {
  return playerRetryState.get(playerId) ?? 3;
}

function updateRetryState(playerId: number, succeeded: boolean): void {
  const current = playerRetryState.get(playerId) ?? 3;
  if (succeeded) {
    // 成功: 1 → 2, 2 → 1 (交替)
    playerRetryState.set(playerId, current === 1 ? 2 : 1);
  } else {
    // 失败: 始终 → 1
    playerRetryState.set(playerId, 1);
  }
}

export async function getLLMAction(state: GameState, preset: LLMPreset): Promise<{ action: PlayerAction; amount?: number }> {
  const player = getCurrentPlayer(state);
  const availableActions = getAvailableActions(state);

  if (availableActions.length === 0) {
    return { action: PlayerAction.Fold };
  }

  const maxRetries = getRetryCount(player.id);
  const maxThinkingTime = preset.maxThinkingTimeMs ?? DEFAULT_MAX_THINKING_TIME_MS;
  let lastError: Error | null = null;

  logger.debug('LLM', `开始决策`, {
    player: player.name,
    preset: preset.name,
    model: preset.model,
    maxRetries,
    availableActions,
    hand: player.hand.map(formatCard)
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`  [LLM] ${player.name} 正在思考... (尝试 ${attempt}/${maxRetries})`);
      logger.debug('LLM', `尝试 ${attempt}/${maxRetries}`, { player: player.name, preset: preset.name });

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
        updateRetryState(player.id, true);
        return normalized;
      }

      throw new Error('LLM 返回的动作无效或不可用');
    } catch (error) {
      lastError = error as Error;
      const isTimeout = lastError.message.includes('超时');
      const isConfigError = /invalid|unsupported|not found|unauthorized|max_tokens|超出/i.test(lastError.message);
      console.log(`  [LLM] 尝试 ${attempt}/${maxRetries} 失败: ${lastError.message}${isTimeout ? ' (超时)' : ''}`);
      logger.logLLMError(preset.name, lastError);

      // 配置错误不重试
      if (isConfigError) {
        break;
      }

      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * attempt, 3000);
        logger.debug('LLM', `等待 ${delayMs}ms 后重试`);
        await sleep(delayMs);
      }
    }
  }

  // 所有重试耗尽 → 回退到高难度AI
  updateRetryState(player.id, false);
  console.log(`  [LLM] ${player.name} 在 ${maxRetries} 次尝试后仍失败，改用高级 AI (High/Ultra/Max 随机): ${lastError?.message}`);
  logger.warn('LLM', `所有尝试失败，回退到高级 AI`, {
    player: player.name,
    preset: preset.name,
    maxRetries,
    lastError: lastError?.message
  });
  return getFallbackAIAction(state);
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
  const baseUrl = normalizeBaseUrl(preset.baseUrl);
  const apiUrl = `${baseUrl}/chat/completions`;

  const baseSystemPrompt = `你正在操控一个德州扑克电脑玩家。你必须只返回 JSON，尽快分析并给出答案，不需要解释和其他描述。

JSON 格式: {"action":"fold|check|call|raise|allin","amount":数字可选}
- raise 的 amount 表示本轮该玩家最终总下注额，不是额外加注额
- 只能选择 availableActions 中提供的动作
- 结合 handHistory 理解牌局发展，结合 opponentStats 针对性剥削

对手统计解读:
- vpip (入池率): <0.15=极紧, 0.15-0.25=偏紧, 0.25-0.35=偏松, >0.35=极松
- pfr (翻前加注率): 接近vpip=激进, 远低vpip=被动跟注
- af (侵略因子): <1=被动, 1-2=适中, >2=激进
- archetype: nit=紧弱(多诈唬施压), tag=紧凶(正常应对), lag=松凶(设陷阱诱捕), maniac=疯狂(耐心等好牌), callingStation=跟注站(价值下注别诈唬), unknown=信息不足(正常打)`;
  const systemPrompt = preset.customPrompt
    ? `${baseSystemPrompt}\n\n--- 附加提示词 ---\n${preset.customPrompt}`
    : baseSystemPrompt;
  const userPrompt = JSON.stringify(createDecisionContext(state, player, availableActions));

  logger.logLLMRequest(preset.name, {
    apiUrl,
    model: preset.model,
    temperature: preset.temperature ?? 1,
    maxTokens: OUTPUT_TOKENS,
    system: systemPrompt,
    prompt: userPrompt
  });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${preset.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: preset.model,
        temperature: preset.temperature ?? 1,
        max_tokens: OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${errorText ? ': ' + errorText : ''}`);
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    const finishReason = data.choices?.[0]?.finish_reason;

    logger.logLLMResponse(preset.name, {
      text: content,
      finishReason,
      usage: data.usage
    });

    if (!content) {
      throw new Error('响应内容为空');
    }

    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('LLM', 'LLM API 调用失败', { apiUrl, model: preset.model, error: message });
    throw new Error(message);
  }
}

function createDecisionContext(state: GameState, player: Player, availableActions: PlayerAction[]): object {
  const totalPot = state.pot + state.sidePots.reduce((sum, sp) => sum + sp.amount, 0);

  // 构建手牌历史
  const handHistory = state.actionLog.map(a => ({
    phase: getPhaseName(a.phase),
    player: a.playerName,
    action: a.action,
    amount: a.amount
  }));

  // 构建对手统计
  const om = getOpponentModelInstance();
  const opponentStats = state.players
    .filter(p => p.id !== player.id)
    .map(p => {
      const stats = om.getStats(p.id);
      const archetype = om.getArchetype(p.id);
      return {
        name: p.name,
        chips: p.chips,
        isActive: p.isActive,
        isAllIn: p.isAllIn,
        stats: {
          handsPlayed: stats.handsPlayed,
          vpip: Number(stats.vpip.toFixed(2)),
          pfr: Number(stats.pfr.toFixed(2)),
          aggression: Number(stats.af.toFixed(1)),
          archetype
        }
      };
    });

  return {
    handNumber: state.handNumber,
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
    handHistory,
    players: state.players.map(item => ({
      name: item.name,
      chips: item.chips,
      currentBet: item.currentBet,
      isActive: item.isActive,
      isAllIn: item.isAllIn,
      isDealer: item.id === state.dealerIndex,
      isSelf: item.id === player.id
    })),
    opponentStats
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}
