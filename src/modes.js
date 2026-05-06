export function puzzleStars(ballsRemaining) {
  if (ballsRemaining >= 4) return 3;
  if (ballsRemaining >= 2) return 2;
  return 1;  // includes 0 — cleared on the last ball
}

export function zenScore(shots) {
  return shots;
}

export function goldFromPuzzleClear(stars) {
  return 10 + 5 * stars;
}

export function goldFromZenClear(shots) {
  return 10 + Math.max(0, 20 - shots);
}
