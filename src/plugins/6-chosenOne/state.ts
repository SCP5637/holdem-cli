/**
 * 天选之子状态追踪
 */

let chosenPlayerId: number | null = null;

export function setChosen(id: number): void {
  chosenPlayerId = id;
}

export function getChosen(): number | null {
  return chosenPlayerId;
}

export function isChosen(playerId: number): boolean {
  return chosenPlayerId === playerId;
}

export function clearChosen(): void {
  chosenPlayerId = null;
}
