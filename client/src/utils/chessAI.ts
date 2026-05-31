/**
 * chessAI.ts
 *
 * Coach level definitions for the Stockfish-backed Play-with-Coach feature.
 * All chess computation is handled by StockfishService (Web Worker).
 * This file only contains level metadata shared across components and hooks.
 */

export type CoachLevel =
  | "beginner"
  | "intermediate"
  | "intermediate2"
  | "advanced"
  | "expert"
  | "master"
  | "grandmaster";

export interface CoachLevelConfig {
  skillLevel: number;
  depth: number;
  movetime: number;
  label: string;
  description: string;
  rating: string;
  emoji: string;
  thinkingMs: [number, number];
}

export const COACH_LEVELS: Record<CoachLevel, CoachLevelConfig> = {
  beginner:      { skillLevel: 1,  depth: 5,  movetime: 300,  label: "Beginner",       description: "Learning the rules",            rating: "~400",   emoji: "🐣", thinkingMs: [300,  600]  },
  intermediate:  { skillLevel: 4,  depth: 8,  movetime: 500,  label: "Intermediate",   description: "Knows basic tactics",            rating: "~800",   emoji: "🌱", thinkingMs: [400,  800]  },
  intermediate2: { skillLevel: 7,  depth: 10, movetime: 700,  label: "Intermediate II",description: "Handles simple combinations",    rating: "~1200",  emoji: "🌿", thinkingMs: [500,  1000] },
  advanced:      { skillLevel: 11, depth: 12, movetime: 1000, label: "Advanced",       description: "Strong tactical awareness",      rating: "~1500",  emoji: "🌳", thinkingMs: [600,  1200] },
  expert:        { skillLevel: 14, depth: 14, movetime: 1500, label: "Expert",         description: "Sees deep combinations",         rating: "~1800",  emoji: "⚔️",thinkingMs: [800,  1500] },
  master:        { skillLevel: 17, depth: 15, movetime: 2000, label: "Master",         description: "Near-perfect play",              rating: "~2200",  emoji: "👑", thinkingMs: [1000, 2000] },
  grandmaster:   { skillLevel: 20, depth: 16, movetime: 3000, label: "Grandmaster",    description: "Maximum engine strength",        rating: "~2500+", emoji: "🏆", thinkingMs: [1200, 2500] },
};

export function getCoachConfig(level: CoachLevel): CoachLevelConfig {
  return COACH_LEVELS[level];
}
