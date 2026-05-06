export const SAVE_VERSION = 1;
const KEY = '8bit-smash-3d:save:v1';

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    gold: 0,
    puzzle: {},
    zen: {},
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
  // shallow merge with defaults to fill in any missing fields
  const d = defaultSave();
  return {
    version: SAVE_VERSION,
    gold:     typeof parsed.gold === 'number' ? parsed.gold : 0,
    puzzle:   parsed.puzzle && typeof parsed.puzzle === 'object' ? parsed.puzzle : {},
    zen:      parsed.zen    && typeof parsed.zen    === 'object' ? parsed.zen    : {},
    settings: { ...d.settings, ...(parsed.settings || {}) },
  };
}

// Browser-only IO. `playSDK` from window if available; else localStorage.
export async function load() {
  const sdk = (typeof window !== 'undefined' && window.PlaySDK) || null;
  if (sdk && typeof sdk.load === 'function') {
    try {
      const blob = await sdk.load();
      if (blob) return deserialize(blob);
      // blob null/empty → fall through to localStorage
    } catch { /* fallthrough */ }
  }
  if (typeof localStorage !== 'undefined') return deserialize(localStorage.getItem(KEY));
  return defaultSave();
}

export async function save(state) {
  const blob = serialize(state);
  const sdk = (typeof window !== 'undefined' && window.PlaySDK) || null;
  if (sdk && typeof sdk.save === 'function') {
    try { await sdk.save(blob); } catch { /* fallthrough */ }
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, blob);
}
