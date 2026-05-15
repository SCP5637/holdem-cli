/** 反向战争迷雾 — 追踪人类玩家被隐藏的第一张手牌key */
let hiddenHoleKey: string | null = null;

export function cardKey(card: { suit: string; rank: string }): string {
  return `${card.suit}-${card.rank}`;
}

export function setHiddenHoleKey(key: string | null): void {
  hiddenHoleKey = key;
}

export function getHiddenHoleKey(): string | null {
  return hiddenHoleKey;
}
