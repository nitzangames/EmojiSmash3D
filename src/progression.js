// Reward and economy operations for the simplified zen-only loop.

export const LEVEL_REWARD = 10;

// Star packs available for purchase with nbucks. Larger packs give better rates.
export const STAR_PACKS = [
  { id: 'small',  stars: 50,   nbucks: 5  },  // 10  ★/ⓝ
  { id: 'medium', stars: 200,  nbucks: 15 },  // ~13 ★/ⓝ
  { id: 'large',  stars: 1000, nbucks: 50 },  // 20  ★/ⓝ
];

export function addGold(save, amount) {
  return { ...save, gold: (save.gold || 0) + amount };
}

// Returns a new save with the item added and gold deducted, or null if the
// player can't afford it.
export function buyItem(save, item, cost) {
  if ((save.gold || 0) < cost) return null;
  const inv = save.inventory || {};
  return {
    ...save,
    gold: save.gold - cost,
    inventory: { ...inv, [item]: (inv[item] || 0) + 1 },
  };
}

// Returns a new save with one of the item removed; no-op if count is already 0.
export function consumeItem(save, item) {
  const inv = save.inventory || {};
  const n = inv[item] || 0;
  if (n <= 0) return save;
  return { ...save, inventory: { ...inv, [item]: n - 1 } };
}

export function inventoryCount(save, item) {
  return save.inventory?.[item] || 0;
}
