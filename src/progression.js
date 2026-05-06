import { goldFromPuzzleClear, goldFromZenClear, puzzleStars } from './modes.js';

// orderedLevels: array of level ids in canonical order across all worlds.
// save shape (see save.js): { gold, puzzle: { id: { stars, balls_left_best } }, zen: { id: { best_shots } } }

export function isLevelUnlocked(levelId, save, orderedLevels) {
  const idx = orderedLevels.indexOf(levelId);
  if (idx <= 0) return idx === 0;  // first level always unlocked
  const prev = orderedLevels[idx - 1];
  return !!(save.puzzle && save.puzzle[prev]);
}

export function recordPuzzleClear(save, levelId, stars, ballsLeft) {
  const out = { ...save, puzzle: { ...save.puzzle } };
  const prev = out.puzzle[levelId] || { stars: 0, balls_left_best: 0 };
  out.puzzle[levelId] = {
    stars: Math.max(prev.stars, stars),
    balls_left_best: Math.max(prev.balls_left_best, ballsLeft),
  };
  out.gold = (save.gold || 0) + goldFromPuzzleClear(stars);
  return out;
}

export function recordZenClear(save, levelId, shots) {
  const out = { ...save, zen: { ...save.zen } };
  const prev = out.zen[levelId];
  out.zen[levelId] = { best_shots: prev ? Math.min(prev.best_shots, shots) : shots };
  out.gold = (save.gold || 0) + goldFromZenClear(shots);
  return out;
}

export function isEndlessUnlocked(save, orderedLevels) {
  return orderedLevels.every(id => save.puzzle && save.puzzle[id]);
}

// Convenience: compute stars given balls remaining.
export { puzzleStars };
