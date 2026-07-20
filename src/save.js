export const SAVE_VERSION = 8;
export const SAVE_KEY = 'emoji-smash-3d:save:v1';

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    gold: 0,
    // Players start with no consumables; everything must be earned + bought.
    inventory: {},
    fulfilledNbucksReceipts: [],
    settings: { muted: false, haptics: true },
  };
}

export function serialize(save) {
  return JSON.stringify(save);
}

export function deserialize(blob) {
  if (!blob) return defaultSave();
  let parsed;
  try { parsed = JSON.parse(blob); } catch { return defaultSave(); }
  // v8 only added the paid-fulfillment receipt list. All v7 fields are still
  // valid and must migrate in place instead of wiping a player's inventory.
  if (!parsed || (parsed.version !== SAVE_VERSION && parsed.version !== 7)) return defaultSave();
  const d = defaultSave();
  return {
    version:   SAVE_VERSION,
    gold:      typeof parsed.gold === 'number'   ? parsed.gold   : 0,
    inventory: { ...d.inventory, ...(parsed.inventory || {}) },
    fulfilledNbucksReceipts: Array.isArray(parsed.fulfilledNbucksReceipts)
      ? parsed.fulfilledNbucksReceipts.filter(id => typeof id === 'string')
      : [],
    settings:  { ...d.settings,  ...(parsed.settings  || {}) },
  };
}

export async function load() {
  const sdk = (typeof window !== 'undefined' && window.PlaySDK) || null;
  if (sdk && typeof sdk.load === 'function') {
    try {
      const blob = await sdk.load(SAVE_KEY);
      if (blob) return deserialize(blob);
    } catch { /* fallthrough */ }
  }
  if (typeof localStorage !== 'undefined') return deserialize(localStorage.getItem(SAVE_KEY));
  return defaultSave();
}

export async function save(state) {
  const blob = serialize(state);
  const sdk = (typeof window !== 'undefined' && window.PlaySDK) || null;
  if (sdk && typeof sdk.save === 'function') {
    try { await sdk.save(SAVE_KEY, blob); } catch { /* fallthrough */ }
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, blob);
}
