import type { GigRoll } from './protocol';

// Upper bound also reserves enough presentation time for the strongest throw.
export const ROLL_SETTLE = 1220;
const HOLD = 335;
const WIN_HOLD = 735;
const DOCK = 175;

export function rollOffset(index: number) {
  return Math.min(index, 3) * 46;
}

export function rollHold(roll: GigRoll) {
  return roll.decisive ? WIN_HOLD : HOLD;
}

export function rollTime(roll: GigRoll, settle = ROLL_SETTLE) {
  return settle + rollHold(roll) + DOCK;
}

export function rollDuration(rolls: GigRoll[]) {
  return Math.max(0, ...rolls.map((roll, index) => rollOffset(index) + rollTime(roll))) + 180;
}
