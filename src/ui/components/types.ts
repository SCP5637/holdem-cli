/**
 * 组件共享类型
 */

export interface PlayerSeatVM {
  id: number;
  name: string;
  chips: number;
  currentBet: number;
  hand: Array<{ suit: string; rank: string }>;
  isActive: boolean;
  isAllIn: boolean;
  isHuman: boolean;
  isRemote?: boolean;
  isYou?: boolean;
  showCards?: boolean;
  isDisconnected?: boolean;
}
