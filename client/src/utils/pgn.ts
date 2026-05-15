import { MoveEntry } from '../types';

export function parseMoves(moves: string[]): MoveEntry[] {
  const entries: MoveEntry[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    entries.push({
      moveNumber: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1],
    });
  }
  return entries;
}

export function getMoveColor(moveIndex: number): 'white' | 'black' {
  return moveIndex % 2 === 0 ? 'white' : 'black';
}
