export const SAVE_VERSION = 6;
const KEY = 'emoji-smash-3d:save:v1';

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    gold: 0,
    // Premium currency — used in the shop to buy star packs.
    nbucks: 50,
    // Dev starter pack so new throwables can be tried out immediately.
    inventory: {
      chair: 5, desk: 5, bomb: 5,
      tv: 5, couch: 5, fridge: 5,
      bed: 5, piano: 5, toilet: 5,
    },
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
  if (!parsed || parsed.version !== SAVE_VERSION) return defaultSave();
  const d = defaultSave();
  return {
    version:   SAVE_VERSION,
    gold:      typeof parsed.gold === 'number'   ? parsed.gold   : 0,
    nbucks:    typeof parsed.nbucks === 'number' ? parsed.nbucks : d.nbucks,
    inventory: { ...d.inventory, ...(parsed.inventory || {}) },
    settings:  { ...d.settings,  ...(parsed.settings  || {}) },
  };
}

export async function load() {
  const sdk = (typeof window !== 'undefined' && window.PlaySDK) || null;
  if (sdk && typeof sdk.load === 'function') {
    try {
      const blob = await sdk.load(KEY);
      if (blob) return deserialize(blob);
    } catch { /* fallthrough */ }
  }
  if (typeof localStorage !== 'undefined') return deserialize(localStorage.getItem(KEY));
  return defaultSave();
}

export async function save(state) {
  const blob = serialize(state);
  const sdk = (typeof window !== 'undefined' && window.PlaySDK) || null;
  if (sdk && typeof sdk.save === 'function') {
    try { await sdk.save(KEY, blob); } catch { /* fallthrough */ }
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, blob);
}
