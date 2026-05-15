/**
 * 战争迷雾状态 — 被隐藏公共牌 + 逐玩家探索计数
 * 探索计数跨牌局持续，迷雾牌每手重置
 */

let fogCardKey: string | null = null;
let humanPlayerId = -1;

/** playerId → 探索次数，跨牌局持久 */
const exploration = new Map<number, number>();

export function cardKey(card: { suit: string; rank: string }): string {
  return `${card.suit}-${card.rank}`;
}

export function setFogCardKey(key: string | null): void { fogCardKey = key; }
export function getFogCardKey(): string | null { return fogCardKey; }

export function setHumanPlayerId(id: number): void { humanPlayerId = id; }
export function getHumanPlayerId(): number { return humanPlayerId; }

export function addExploration(playerId: number): void {
  exploration.set(playerId, (exploration.get(playerId) || 0) + 1);
}

export function getExploration(playerId: number): number {
  return exploration.get(playerId) || 0;
}

export function resetExploration(): void {
  exploration.clear();
}
